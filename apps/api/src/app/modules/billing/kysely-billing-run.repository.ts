import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { sql, type Kysely } from 'kysely';
import {
  FEES_RECEIVABLE_SYSTEM_KEY,
  billingRunStatusSchema,
  type BillingRunListQuery,
} from '@eduvault/api-contract';
import {
  ActivityWriter,
  financeActor,
  roundCancelledActivity,
  roundSentActivity,
  type CampusAmount,
  type FinanceActor,
} from '../../common/activity';
import { chunks } from '../../common/db/rows';
import { KYSELY_TOKEN, type Database } from '../../common/db/tokens';
import {
  allocateDocumentNumber,
  formatDocumentNumber,
} from '../../common/documents';
import { sendCharge } from '../../common/fees';
import {
  LedgerPoster,
  schoolCurrency,
  systemAccountId,
} from '../../common/ledger';
import { currentCampusSql, inScope } from '../../common/students';
import type { DB } from '../../../db/db-types';
import {
  BillingRunRepository,
  type CreatedRound,
  type IssueRound,
  type NewRound,
  type RunHeader,
  type RunPage,
  type RunAction,
  type RunOutcome,
} from './billing-run.repository';
import type { OrgScope } from '../../common/scope';
import { findRun, listRuns } from './kysely-billing-run-read.repository';
import { sendOrder } from './send-order';

const INSERT_CHUNK = 500;

const lineTotal = (lines: readonly LedgerChargeLine[]): number =>
  lines.reduce((sum, line) => sum + line.amountMinor, 0);

interface LedgerChargeLine {
  ledgerAccountId: string;
  amountMinor: number;
}

type RunCheck =
  { ok: true; number: string } | { ok: false; outcome: RunOutcome };

interface SendableDraft {
  id: string;
  student_id: string;
  campus_id: string;
  firstName: string;
  lastName: string;
}

@Injectable()
export class KyselyBillingRunRepository extends BillingRunRepository {
  constructor(
    @Inject(KYSELY_TOKEN) private readonly db: Database,
    private readonly poster: LedgerPoster,
    private readonly activity: ActivityWriter
  ) {
    super();
  }

  currency(organizationId: string): Promise<string> {
    return schoolCurrency(this.db, organizationId);
  }

  listRuns(scope: OrgScope, query: BillingRunListQuery): Promise<RunPage> {
    return listRuns(this.db, scope, query);
  }

  findRun(scope: OrgScope, id: string): Promise<RunHeader | undefined> {
    return findRun(this.db, scope, id);
  }

  createRound(input: NewRound): Promise<CreatedRound> {
    return this.db.transaction().execute(async (trx) => {
      const runId = randomUUID();
      const drafts = await this.insertDrafts(trx, input, runId);
      if (drafts.length === 0) {
        return { runId: null, number: null, created: 0 };
      }
      const value = await allocateDocumentNumber(trx, {
        organizationId: input.organizationId,
        kind: 'billing_run',
        year: input.year,
      });
      const number = formatDocumentNumber('billing_run', input.year, value);
      await this.insertRun(trx, { input, runId, number });
      await this.insertLines(trx, input, drafts);
      return { runId, number, created: drafts.length };
    });
  }

  private async insertDrafts(
    trx: Kysely<DB>,
    input: NewRound,
    runId: string
  ): Promise<{ id: string; student_id: string }[]> {
    const inserted: { id: string; student_id: string }[] = [];
    const ordered = input.charges.toSorted((a, b) =>
      a.studentId.localeCompare(b.studentId)
    );
    for (const group of chunks(ordered, INSERT_CHUNK)) {
      const rows = await trx
        .insertInto('invoice')
        .values(
          group.map((charge) => ({
            organization_id: input.organizationId,
            student_id: charge.studentId,
            term_id: input.termId,
            campus_id: charge.campusId,
            billing_run_id: runId,
            kind: 'term',
            status: 'draft',
            created_by: input.userId,
          }))
        )
        .onConflict((conflict) => conflict.doNothing())
        .returning(['id', 'student_id'])
        .execute();
      inserted.push(...rows);
    }
    return inserted;
  }

  private async insertRun(
    trx: Kysely<DB>,
    round: { input: NewRound; runId: string; number: string }
  ): Promise<void> {
    const { input, runId, number } = round;
    await trx
      .insertInto('billing_run')
      .values({
        id: runId,
        organization_id: input.organizationId,
        number,
        term_id: input.termId,
        scope: input.filter.scope,
        scope_campus_id:
          input.filter.scope === 'campus' ? input.filter.campusId : null,
        scope_class_level_id:
          input.filter.scope === 'level' ? input.filter.classLevelId : null,
        status: 'draft',
        created_by: input.userId,
      })
      .execute();
  }

  private async insertLines(
    trx: Kysely<DB>,
    input: NewRound,
    drafts: readonly { id: string; student_id: string }[]
  ): Promise<void> {
    const linesOf = new Map(
      input.charges.map((charge) => [charge.studentId, charge.lines])
    );
    const rows = drafts.flatMap((draft) =>
      (linesOf.get(draft.student_id) ?? []).map((line) => ({
        organization_id: input.organizationId,
        invoice_id: draft.id,
        fee_line_id: line.feeLineId,
        student_discount_id: line.studentDiscountId,
        ledger_account_id: line.ledgerAccountId,
        description: line.description,
        amount_minor: String(line.amountMinor),
      }))
    );
    for (const group of chunks(rows, INSERT_CHUNK)) {
      await trx.insertInto('invoice_line').values(group).execute();
    }
  }

  issue(input: IssueRound): Promise<RunOutcome> {
    return this.db.transaction().execute(async (trx) => {
      const checked = await this.refuseRun(trx, input);
      if (!checked.ok) {
        return checked.outcome;
      }
      const sent = await this.sendDrafts(trx, input);
      await this.activity
        .within(trx)
        .recordMany(
          roundSentActivity(
            await this.runActor(trx, input),
            { id: input.runId, number: checked.number },
            sent
          )
        );
      await trx
        .updateTable('billing_run')
        .set({
          status: 'issued',
          issued_by: input.userId,
          issued_at: sql<Date>`now()`,
        })
        .where('id', '=', input.runId)
        .where('organization_id', '=', input.scope.organizationId)
        .execute();
      return { status: 'done' };
    });
  }

  cancel(input: RunAction): Promise<RunOutcome> {
    return this.db.transaction().execute(async (trx) => {
      const checked = await this.refuseRun(trx, input);
      if (!checked.ok) {
        return checked.outcome;
      }
      const { organizationId } = input.scope;
      const charges = await this.draftCharges(trx, organizationId, input.runId);
      await trx
        .updateTable('invoice')
        .set({ status: 'cancelled' })
        .where('organization_id', '=', organizationId)
        .where('billing_run_id', '=', input.runId)
        .where('status', '=', 'draft')
        .execute();
      await trx
        .updateTable('billing_run')
        .set({
          status: 'cancelled',
          cancelled_by: input.userId,
          cancelled_at: sql<Date>`now()`,
        })
        .where('id', '=', input.runId)
        .where('organization_id', '=', organizationId)
        .execute();
      await this.activity
        .within(trx)
        .recordMany(
          roundCancelledActivity(
            await this.runActor(trx, input),
            { id: input.runId, number: checked.number },
            charges
          )
        );
      return { status: 'done' };
    });
  }

  private async draftCharges(
    trx: Kysely<DB>,
    organizationId: string,
    runId: string
  ): Promise<CampusAmount[]> {
    const { drafts, linesByInvoice } = await this.draftsOf(
      trx,
      organizationId,
      runId
    );
    return drafts.map((row) => ({
      campusId: row.campus_id,
      amountMinor: lineTotal(linesByInvoice.get(row.id) ?? []),
    }));
  }

  private async draftsOf(
    trx: Kysely<DB>,
    organizationId: string,
    runId: string
  ) {
    const drafts = await trx
      .selectFrom('invoice as i')
      .innerJoin('student as st', (join) =>
        join
          .onRef('st.id', '=', 'i.student_id')
          .onRef('st.organization_id', '=', 'i.organization_id')
      )
      .select([
        'i.id',
        'i.student_id',
        'i.campus_id',
        'st.first_name',
        'st.last_name',
        'st.admission_number',
      ])
      .where('i.organization_id', '=', organizationId)
      .where('i.billing_run_id', '=', runId)
      .where('i.status', '=', 'draft')
      .execute();
    const linesByInvoice = await this.draftLines(
      trx,
      organizationId,
      drafts.map((row) => row.id)
    );
    return { drafts, linesByInvoice };
  }

  private async runActor(
    trx: Kysely<DB>,
    input: RunAction
  ): Promise<FinanceActor> {
    return financeActor(
      {
        organizationId: input.scope.organizationId,
        userId: input.userId,
        name: input.userName,
      },
      await schoolCurrency(trx, input.scope.organizationId)
    );
  }

  private async refuseRun(
    trx: Kysely<DB>,
    input: RunAction
  ): Promise<RunCheck> {
    const { organizationId, campusScope } = input.scope;
    const run = await trx
      .selectFrom('billing_run')
      .select(['status', 'number'])
      .where('id', '=', input.runId)
      .where('organization_id', '=', organizationId)
      .forUpdate()
      .executeTakeFirst();
    if (run === undefined) {
      return { ok: false, outcome: { status: 'not_found' } };
    }
    const { rows } = await sql<{ total: number; in_scope: number }>`
      SELECT
        count(*)::int AS total,
        (count(*) FILTER (WHERE ${inScope(currentCampusSql('st'), campusScope)}))::int AS in_scope
      FROM invoice i
      JOIN student st ON st.id = i.student_id AND st.organization_id = i.organization_id
      WHERE i.billing_run_id = ${input.runId} AND i.organization_id = ${organizationId}`.execute(
      trx
    );
    const counts = rows[0];
    if (counts === undefined || counts.in_scope === 0) {
      return { ok: false, outcome: { status: 'not_found' } };
    }
    const current = billingRunStatusSchema.parse(run.status);
    if (current !== 'draft') {
      return { ok: false, outcome: { status: 'refused', current } };
    }
    return counts.in_scope === counts.total
      ? { ok: true, number: run.number }
      : { ok: false, outcome: { status: 'out_of_scope' } };
  }

  private async sendDrafts(
    trx: Kysely<DB>,
    input: IssueRound
  ): Promise<CampusAmount[]> {
    const { organizationId } = input.scope;
    const receivableId = await systemAccountId(
      trx,
      organizationId,
      FEES_RECEIVABLE_SYSTEM_KEY
    );
    const { drafts, linesByInvoice } = await this.draftsOf(
      trx,
      organizationId,
      input.runId
    );
    const sent: CampusAmount[] = [];
    for (const draft of sendOrder(
      drafts.map((row) => ({
        ...row,
        firstName: row.first_name,
        lastName: row.last_name,
        admissionNumber: row.admission_number,
      }))
    )) {
      const lines = linesByInvoice.get(draft.id) ?? [];
      await this.sendOne(trx, { input, receivableId, draft, lines });
      sent.push({
        campusId: draft.campus_id,
        amountMinor: lineTotal(lines),
      });
    }
    return sent;
  }

  private async draftLines(
    trx: Kysely<DB>,
    organizationId: string,
    invoiceIds: readonly string[]
  ): Promise<Map<string, LedgerChargeLine[]>> {
    const linesByInvoice = new Map<string, LedgerChargeLine[]>();
    if (invoiceIds.length === 0) {
      return linesByInvoice;
    }
    for (const line of await trx
      .selectFrom('invoice_line')
      .select(['invoice_id', 'ledger_account_id', 'amount_minor'])
      .where('organization_id', '=', organizationId)
      .where('invoice_id', 'in', invoiceIds)
      .execute()) {
      const lines = linesByInvoice.get(line.invoice_id) ?? [];
      lines.push({
        ledgerAccountId: line.ledger_account_id,
        amountMinor: Number(line.amount_minor),
      });
      linesByInvoice.set(line.invoice_id, lines);
    }
    return linesByInvoice;
  }

  private async sendOne(
    trx: Kysely<DB>,
    send: {
      input: IssueRound;
      receivableId: string;
      draft: SendableDraft;
      lines: LedgerChargeLine[];
    }
  ): Promise<void> {
    const { input, draft } = send;
    await sendCharge(trx, this.poster, {
      invoiceId: draft.id,
      organizationId: input.scope.organizationId,
      studentId: draft.student_id,
      campusId: draft.campus_id,
      receivableId: send.receivableId,
      journalKind: 'invoice',
      memo: `Term fees · ${draft.firstName} ${draft.lastName}`,
      lines: send.lines,
      today: input.today,
      actorId: input.userId,
      year: input.year,
    });
  }
}
