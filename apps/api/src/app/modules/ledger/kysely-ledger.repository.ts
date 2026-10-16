import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'kysely';
import {
  FEES_RECEIVABLE_SYSTEM_KEY,
  OPENING_BALANCE_SYSTEM_KEY,
  journalKindSchema,
  ledgerAccountTypeSchema,
  type JournalEntry,
  type JournalList,
  type JournalLine,
  type JournalQuery,
} from '@eduvault/api-contract';
import { inCampusScope } from '../../common/db/in-campus-scope';
import { day } from '../../common/db/rows';
import { KYSELY_TOKEN, type Database } from '../../common/db/tokens';
import {
  LedgerPoster,
  insertChildAccount,
  schoolCurrency,
  transactAccounts,
  type ChartAccount,
} from '../../common/ledger';
import { visibleStudentsCte } from '../../common/students';
import {
  LedgerRepository,
  type LedgerAccountRef,
  type LedgerOutcome,
  type LedgerScope,
  type MoneyAccountRef,
  type OpeningPost,
  type SystemAccounts,
} from './ledger.repository';

interface EntryRow {
  id: string;
  reference: string;
  kind: string;
  memo: string | null;
  effective_on: string;
  invoice_id: string | null;
}

interface LineRow {
  entry_id: string;
  code: number;
  account_name: string;
  student_name: string | null;
  campus_name: string | null;
  debit_minor: string;
  credit_minor: string;
}

const toLine = (row: LineRow): JournalLine => ({
  accountCode: row.code,
  accountName: row.account_name,
  studentName: row.student_name,
  campusName: row.campus_name,
  debitMinor: Number(row.debit_minor),
  creditMinor: Number(row.credit_minor),
});

const toEntry = (
  row: EntryRow,
  totalMinor: number,
  lines: JournalLine[]
): JournalEntry => ({
  entryId: row.id,
  effectiveOn: row.effective_on,
  reference: row.reference,
  kind: journalKindSchema.parse(row.kind),
  memo: row.memo,
  totalMinor,
  link:
    row.invoice_id === null ? null : { type: 'invoice', id: row.invoice_id },
  lines,
});

@Injectable()
export class KyselyLedgerRepository extends LedgerRepository {
  constructor(
    @Inject(KYSELY_TOKEN) private readonly db: Database,
    private readonly poster: LedgerPoster
  ) {
    super();
  }

  async chart(scope: LedgerScope): Promise<ChartAccount[]> {
    const rows = await this.db
      .selectFrom('ledger_account')
      .leftJoin('journal_line', (join) =>
        join
          .onRef('journal_line.ledger_account_id', '=', 'ledger_account.id')
          .onRef(
            'journal_line.organization_id',
            '=',
            'ledger_account.organization_id'
          )
          .on((eb) =>
            inCampusScope(eb, 'journal_line.campus_id', {
              scope: scope.campusScope,
            })
          )
      )
      .leftJoin('money_account', (join) =>
        join
          .onRef('money_account.ledger_account_id', '=', 'ledger_account.id')
          .onRef(
            'money_account.organization_id',
            '=',
            'ledger_account.organization_id'
          )
      )
      .where('ledger_account.organization_id', '=', scope.organizationId)
      .where((eb) =>
        eb.or([
          eb('money_account.id', 'is', null),
          inCampusScope(eb, 'money_account.campus_id', {
            scope: scope.campusScope,
          }),
        ])
      )
      .groupBy('ledger_account.id')
      .select([
        'ledger_account.id',
        'ledger_account.code',
        'ledger_account.name',
        'ledger_account.type',
        'ledger_account.parent_id',
        'ledger_account.system_key',
        sql<string>`COALESCE(SUM(journal_line.debit_minor), 0)`.as('debit'),
        sql<string>`COALESCE(SUM(journal_line.credit_minor), 0)`.as('credit'),
      ])
      .execute();
    return rows.map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      type: ledgerAccountTypeSchema.parse(row.type),
      parentId: row.parent_id,
      systemKey: row.system_key,
      debitMinor: Number(row.debit),
      creditMinor: Number(row.credit),
    }));
  }

  currency(organizationId: string): Promise<string> {
    return schoolCurrency(this.db, organizationId);
  }

  async findAccount(
    organizationId: string,
    id: string
  ): Promise<LedgerAccountRef | undefined> {
    const row = await this.db
      .selectFrom('ledger_account')
      .select(['id', 'code', 'name', 'type', 'system_key'])
      .where('organization_id', '=', organizationId)
      .where('id', '=', id)
      .executeTakeFirst();
    return row === undefined
      ? undefined
      : {
          id: row.id,
          code: row.code,
          name: row.name,
          type: ledgerAccountTypeSchema.parse(row.type),
          systemKey: row.system_key,
        };
  }

  async createAccount(input: {
    organizationId: string;
    parentId: string;
    name: string;
  }): Promise<LedgerOutcome> {
    return transactAccounts(this.db, async (trx): Promise<LedgerOutcome> => {
      const inserted = await insertChildAccount(trx, input);
      if (inserted.status === 'name_taken') {
        return inserted;
      }
      const { row } = inserted;
      return {
        status: 'saved',
        account: {
          id: row.id,
          code: row.code,
          name: row.name,
          type: ledgerAccountTypeSchema.parse(row.type),
          parentId: row.parent_id,
          systemKey: row.system_key,
          balanceMinor: 0,
        },
      };
    });
  }

  private entries(scope: LedgerScope, query: JournalQuery) {
    return this.db
      .selectFrom('journal_entry')
      .where('journal_entry.organization_id', '=', scope.organizationId)
      .where((eb) =>
        eb.exists(
          eb
            .selectFrom('journal_line')
            .select('journal_line.id')
            .whereRef('journal_line.entry_id', '=', 'journal_entry.id')
            .whereRef(
              'journal_line.organization_id',
              '=',
              'journal_entry.organization_id'
            )
            .where((inner) =>
              inCampusScope(inner, 'journal_line.campus_id', {
                scope: scope.campusScope,
              })
            )
        )
      )
      .$if(query.from !== undefined, (qb) =>
        qb.where(
          sql<boolean>`journal_entry.effective_on >= ${query.from}::date`
        )
      )
      .$if(query.to !== undefined, (qb) =>
        qb.where(sql<boolean>`journal_entry.effective_on <= ${query.to}::date`)
      )
      .$if(query.kind !== undefined, (qb) =>
        qb.where('journal_entry.kind', '=', query.kind ?? '')
      );
  }

  async journal(scope: LedgerScope, query: JournalQuery): Promise<JournalList> {
    const [page, count, currency] = await Promise.all([
      this.entries(scope, query)
        .select([
          'journal_entry.id',
          'journal_entry.reference',
          'journal_entry.kind',
          'journal_entry.memo',
          day('journal_entry.effective_on').as('effective_on'),
          sql<string | null>`(
            select invoice.id
            from invoice
            where invoice.journal_entry_id = journal_entry.id
              and invoice.organization_id = journal_entry.organization_id
          )`.as('invoice_id'),
        ])
        .orderBy('journal_entry.effective_on', 'desc')
        .orderBy('journal_entry.sequence', 'desc')
        .limit(query.pageSize)
        .offset((query.page - 1) * query.pageSize)
        .execute(),
      this.entries(scope, query)
        .select(sql<string>`count(*)`.as('count'))
        .executeTakeFirstOrThrow(),
      schoolCurrency(this.db, scope.organizationId),
    ]);
    const lines = await this.linesOf(
      scope,
      page.map((row) => row.id)
    );
    return {
      currency,
      items: page.map((row) => {
        const own = lines.filter((line) => line.entry_id === row.id);
        const total = own.reduce(
          (sum, line) => sum + Number(line.debit_minor),
          0
        );
        return toEntry(
          row,
          total,
          own.map((line) => toLine(line))
        );
      }),
      total: Number(count.count),
    };
  }

  private async linesOf(
    scope: LedgerScope,
    entryIds: string[]
  ): Promise<LineRow[]> {
    if (entryIds.length === 0) {
      return [];
    }
    return this.db
      .selectFrom('journal_line')
      .innerJoin('ledger_account', (join) =>
        join
          .onRef('ledger_account.id', '=', 'journal_line.ledger_account_id')
          .onRef(
            'ledger_account.organization_id',
            '=',
            'journal_line.organization_id'
          )
      )
      .leftJoin('student', (join) =>
        join
          .onRef('student.id', '=', 'journal_line.student_id')
          .onRef('student.organization_id', '=', 'journal_line.organization_id')
      )
      .leftJoin('team', 'team.id', 'journal_line.campus_id')
      .where('journal_line.organization_id', '=', scope.organizationId)
      .where('journal_line.entry_id', 'in', entryIds)
      .where((eb) =>
        inCampusScope(eb, 'journal_line.campus_id', {
          scope: scope.campusScope,
        })
      )
      .orderBy('journal_line.entry_id')
      .orderBy('journal_line.credit_minor')
      .orderBy('ledger_account.code')
      .select([
        'journal_line.entry_id',
        'journal_line.debit_minor',
        'journal_line.credit_minor',
        'ledger_account.code',
        'ledger_account.name as account_name',
        'team.name as campus_name',
        sql<string | null>`CASE WHEN student.id IS NULL THEN NULL
          ELSE student.first_name || ' ' || student.last_name END`.as(
          'student_name'
        ),
      ])
      .execute();
  }

  async studentCampuses(
    scope: LedgerScope,
    options: { studentIds: string[]; today: string }
  ): Promise<Map<string, string>> {
    if (options.studentIds.length === 0) {
      return new Map();
    }
    const ids = sql.join(options.studentIds.map((id) => sql`${id}`));
    const { rows } = await sql<{ id: string; campus_id: string }>`
      WITH ${visibleStudentsCte({
        organizationId: scope.organizationId,
        campusScope: scope.campusScope,
        classScope: 'all',
        today: options.today,
      })}
      SELECT id, campus_id FROM visible
      WHERE id IN (${ids})`.execute(this.db);
    return new Map(rows.map((row) => [row.id, row.campus_id]));
  }

  async moneyAccounts(
    scope: LedgerScope,
    ids: string[]
  ): Promise<MoneyAccountRef[]> {
    if (ids.length === 0) {
      return [];
    }
    const rows = await this.db
      .selectFrom('money_account')
      .select(['id', 'campus_id', 'ledger_account_id'])
      .where('organization_id', '=', scope.organizationId)
      .where('id', 'in', ids)
      .where((eb) =>
        inCampusScope(eb, 'money_account.campus_id', {
          scope: scope.campusScope,
        })
      )
      .execute();
    return rows.map((row) => ({
      id: row.id,
      campusId: row.campus_id,
      ledgerAccountId: row.ledger_account_id,
    }));
  }

  async systemAccounts(organizationId: string): Promise<SystemAccounts> {
    const rows = await this.db
      .selectFrom('ledger_account')
      .select(['id', 'system_key'])
      .where('organization_id', '=', organizationId)
      .where('system_key', 'in', [
        FEES_RECEIVABLE_SYSTEM_KEY,
        OPENING_BALANCE_SYSTEM_KEY,
      ])
      .execute();
    const idOf = (key: string) => {
      const found = rows.find((row) => row.system_key === key);
      if (found === undefined) {
        throw new Error(`The school has no ${key} account`);
      }
      return found.id;
    };
    return {
      receivableId: idOf(FEES_RECEIVABLE_SYSTEM_KEY),
      equityId: idOf(OPENING_BALANCE_SYSTEM_KEY),
    };
  }

  postOpening(post: OpeningPost): Promise<boolean[]> {
    return this.db.transaction().execute(async (trx) => {
      const replays: boolean[] = [];
      for (const entry of post.entries) {
        const { replayed } = await this.poster.post(trx, {
          organizationId: post.organizationId,
          reference: entry.reference,
          kind: 'opening',
          effectiveOn: entry.effectiveOn,
          memo: entry.memo,
          postedBy: post.userId,
          lines: entry.lines,
        });
        replays.push(replayed);
      }
      return replays;
    });
  }
}
