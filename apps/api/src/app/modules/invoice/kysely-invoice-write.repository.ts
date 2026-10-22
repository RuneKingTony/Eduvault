import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { sql, type Kysely } from 'kysely';
import { FEES_RECEIVABLE_SYSTEM_KEY } from '@eduvault/api-contract';
import type { DB } from '../../../db/db-types';
import {
  ActivityWriter,
  financeActor,
  oneOffChargeActivity,
  type ActivityRecorder,
} from '../../common/activity';
import { canSeeCampus } from '../../common/campus-scope';
import { advisoryLock } from '../../common/db/advisory-lock';
import { KYSELY_TOKEN, type Database } from '../../common/db/tokens';
import { insertDraftCharge, sendCharge } from '../../common/fees';
import {
  LedgerPoster,
  feeTypeQuery,
  schoolCurrency,
  systemAccountId,
} from '../../common/ledger';
import { currentCampusSql, findStudentIdentity } from '../../common/students';
import {
  distinctFeeTypeIds,
  InvoiceWriteRepository,
  type ChargeableStudent,
  type ExistingCharge,
  type NewOneOffCharge,
  type OneOffOutcome,
} from './invoice-write.repository';
import type { OrgScope } from '../../common/scope';

interface ChargeWriters {
  poster: LedgerPoster;
  activity: ActivityRecorder;
}

async function findByReference(
  db: Kysely<DB>,
  organizationId: string,
  reference: string
): Promise<ExistingCharge | undefined> {
  const { rows } = await sql<{
    id: string;
    request_hash: string | null;
    number: string | null;
    campus_id: string;
  }>`
    SELECT i.id, i.request_hash, i.number, ${currentCampusSql('st')} AS campus_id
    FROM invoice i
    JOIN student st ON st.id = i.student_id AND st.organization_id = i.organization_id
    WHERE i.organization_id = ${organizationId}
      AND i.reference = ${reference}`.execute(db);
  const row = rows[0];
  return (
    row && {
      id: row.id,
      requestHash: row.request_hash ?? '',
      number: row.number ?? '',
      campusId: row.campus_id,
    }
  );
}

async function findStudent(
  db: Kysely<DB>,
  scope: OrgScope,
  studentId: string
): Promise<ChargeableStudent | undefined> {
  const identity = await findStudentIdentity(db, scope, studentId);
  if (identity === undefined) {
    return undefined;
  }
  const { exit_kind: exitKind } = await db
    .selectFrom('student')
    .select('exit_kind')
    .where('id', '=', studentId)
    .where('organization_id', '=', scope.organizationId)
    .executeTakeFirstOrThrow();
  return { ...identity, onRoll: exitKind === null };
}

async function activeFeeTypeIds(
  db: Kysely<DB>,
  organizationId: string,
  ids: readonly string[]
): Promise<string[]> {
  const rows = await feeTypeQuery(db, organizationId)
    .where('ledger_account.id', 'in', ids)
    .execute();
  return rows.map((row) => row.id);
}

async function findCurrentTerm(
  db: Kysely<DB>,
  organizationId: string
): Promise<{ id: string; name: string } | undefined> {
  return db
    .selectFrom('term')
    .select(['id', 'name'])
    .where('organization_id', '=', organizationId)
    .where('is_current', '=', true)
    .executeTakeFirst();
}

const totalOf = (lines: NewOneOffCharge['lines']): number =>
  lines.reduce((sum, line) => sum + line.amountMinor, 0);

async function writeCharge(
  trx: Kysely<DB>,
  poster: LedgerPoster,
  request: { input: NewOneOffCharge; student: ChargeableStudent }
): Promise<{ id: string; number: string }> {
  const { input, student } = request;
  const { organizationId } = input;
  const id = randomUUID();
  await insertDraftCharge(trx, {
    id,
    organizationId,
    studentId: student.id,
    termId: input.termId,
    campusId: student.campusId,
    kind: 'adhoc',
    createdBy: input.userId,
    request: {
      reference: input.reference,
      requestHash: input.requestHash,
    },
    lines: input.lines.map((line) => ({
      ledgerAccountId: line.feeTypeId,
      description: line.description,
      amountMinor: line.amountMinor,
    })),
  });
  const sent = await sendCharge(trx, poster, {
    invoiceId: id,
    organizationId,
    studentId: student.id,
    campusId: student.campusId,
    receivableId: await systemAccountId(
      trx,
      organizationId,
      FEES_RECEIVABLE_SYSTEM_KEY
    ),
    journalKind: 'adhoc',
    memo: `Charge · ${student.name}`,
    lines: input.lines.map((line) => ({
      ledgerAccountId: line.feeTypeId,
      amountMinor: line.amountMinor,
    })),
    today: input.today,
    actorId: input.userId,
    year: input.year,
  });
  return { id, number: sent.number };
}

async function createIn(
  trx: Kysely<DB>,
  { poster, activity }: ChargeWriters,
  input: NewOneOffCharge
): Promise<OneOffOutcome> {
  const { organizationId, reference, campusScope } = input;
  await advisoryLock(trx, `invoice-charge:${organizationId}:${reference}`);
  const existing = await findByReference(trx, organizationId, reference);
  if (existing !== undefined) {
    if (!canSeeCampus(campusScope, existing.campusId)) {
      return { status: 'reference_taken' };
    }
    return existing.requestHash === input.requestHash
      ? { status: 'replayed', id: existing.id }
      : { status: 'reference_used', number: existing.number };
  }
  const student = await findStudent(
    trx,
    { organizationId, campusScope },
    input.studentId
  );
  if (student === undefined) {
    return { status: 'student_not_found' };
  }
  if (!student.onRoll) {
    return { status: 'student_gone' };
  }
  const feeTypeIds = distinctFeeTypeIds(input.lines);
  const feeTypes = await activeFeeTypeIds(trx, organizationId, feeTypeIds);
  if (feeTypes.length !== feeTypeIds.length) {
    return { status: 'fee_type_not_found' };
  }
  const term = await findCurrentTerm(trx, organizationId);
  if (term?.id !== input.termId) {
    return { status: 'no_term' };
  }
  const charge = await writeCharge(trx, poster, { input, student });
  await activity.recordMany(
    oneOffChargeActivity(
      financeActor(
        { organizationId, userId: input.userId, name: input.userName },
        await schoolCurrency(trx, organizationId)
      ),
      {
        ...charge,
        studentId: student.id,
        studentName: student.name,
        campusId: student.campusId,
        totalMinor: totalOf(input.lines),
      }
    )
  );
  return { status: 'created', id: charge.id };
}

@Injectable()
export class KyselyInvoiceWriteRepository extends InvoiceWriteRepository {
  constructor(
    @Inject(KYSELY_TOKEN) private readonly db: Database,
    private readonly poster: LedgerPoster,
    private readonly activity: ActivityWriter
  ) {
    super();
  }

  findByReference(
    organizationId: string,
    reference: string
  ): Promise<ExistingCharge | undefined> {
    return findByReference(this.db, organizationId, reference);
  }

  chargeableStudent(
    scope: OrgScope,
    studentId: string
  ): Promise<ChargeableStudent | undefined> {
    return findStudent(this.db, scope, studentId);
  }

  async activeFeeTypes(
    organizationId: string,
    ids: readonly string[]
  ): Promise<string[]> {
    return activeFeeTypeIds(this.db, organizationId, ids);
  }

  currentTerm(
    organizationId: string
  ): Promise<{ id: string; name: string } | undefined> {
    return findCurrentTerm(this.db, organizationId);
  }

  createOneOff(input: NewOneOffCharge): Promise<OneOffOutcome> {
    return this.db
      .transaction()
      .execute((trx) =>
        createIn(
          trx,
          { poster: this.poster, activity: this.activity.within(trx) },
          input
        )
      );
  }
}
