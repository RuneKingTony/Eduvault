import type { Kysely } from 'kysely';
import type { DB } from '../../../db/db-types';
import { day, iso, nullableDay } from '../db/rows';
import type {
  DiscountFacts,
  DiscountKind,
  DiscountStatus,
  TermPosition,
} from './discount-caps';

export async function termPosition(
  db: Kysely<DB>,
  organizationId: string,
  termId: string
): Promise<TermPosition | undefined> {
  const row = await db
    .selectFrom('term')
    .innerJoin('academic_session', (join) =>
      join
        .onRef('academic_session.id', '=', 'term.session_id')
        .onRef('academic_session.organization_id', '=', 'term.organization_id')
    )
    .select([
      'term.sequence',
      day('academic_session.starts_on').as('starts_on'),
    ])
    .where('term.organization_id', '=', organizationId)
    .where('term.id', '=', termId)
    .executeTakeFirst();
  return (
    row && {
      sessionStartsOn: row.starts_on,
      sequence: row.sequence,
    }
  );
}

function discountRows(
  db: Kysely<DB>,
  organizationId: string,
  studentIds: readonly string[]
) {
  return db
    .selectFrom('student_discount as d')
    .innerJoin('term as from_term', (join) =>
      join
        .onRef('from_term.id', '=', 'd.from_term_id')
        .onRef('from_term.organization_id', '=', 'd.organization_id')
    )
    .innerJoin('academic_session as from_session', (join) =>
      join
        .onRef('from_session.id', '=', 'from_term.session_id')
        .onRef('from_session.organization_id', '=', 'from_term.organization_id')
    )
    .leftJoin('term as to_term', (join) =>
      join
        .onRef('to_term.id', '=', 'd.to_term_id')
        .onRef('to_term.organization_id', '=', 'd.organization_id')
    )
    .leftJoin('academic_session as to_session', (join) =>
      join
        .onRef('to_session.id', '=', 'to_term.session_id')
        .onRef('to_session.organization_id', '=', 'to_term.organization_id')
    )
    .leftJoin('ledger_account as fee_type', (join) =>
      join
        .onRef('fee_type.id', '=', 'd.ledger_account_id')
        .onRef('fee_type.organization_id', '=', 'd.organization_id')
    )
    .select([
      'd.id',
      'd.student_id',
      'd.status',
      'd.kind',
      'd.value',
      'd.ledger_account_id',
      'fee_type.name as fee_type_name',
      'd.reason',
      'd.approved_at',
      day('from_session.starts_on').as('from_starts_on'),
      'from_term.sequence as from_sequence',
      nullableDay('to_session.starts_on').as('to_starts_on'),
      'to_term.sequence as to_sequence',
    ])
    .where('d.organization_id', '=', organizationId)
    .where('d.student_id', 'in', [...studentIds])
    .where('d.status', 'in', ['submitted', 'approved'])
    .where('d.ended_at', 'is', null)
    .execute();
}

type DiscountRow = Awaited<ReturnType<typeof discountRows>>[number];

const toFacts = (row: DiscountRow): DiscountFacts => ({
  id: row.id,
  status: row.status as DiscountStatus,
  kind: row.kind as DiscountKind,
  value: Number(row.value),
  feeTypeId: row.ledger_account_id,
  feeTypeName: row.fee_type_name,
  reason: row.reason,
  approvedAt: row.approved_at === null ? null : iso(row.approved_at),
  from: { sessionStartsOn: row.from_starts_on, sequence: row.from_sequence },
  to:
    row.to_starts_on === null || row.to_sequence === null
      ? null
      : { sessionStartsOn: row.to_starts_on, sequence: row.to_sequence },
});

export async function discountFacts(
  db: Kysely<DB>,
  organizationId: string,
  studentIds: readonly string[]
): Promise<Map<string, DiscountFacts[]>> {
  const byStudent = new Map<string, DiscountFacts[]>();
  if (studentIds.length === 0) {
    return byStudent;
  }
  for (const row of await discountRows(db, organizationId, studentIds)) {
    const facts = byStudent.get(row.student_id) ?? [];
    facts.push(toFacts(row));
    byStudent.set(row.student_id, facts);
  }
  return byStudent;
}
