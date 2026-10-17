import { sql, type RawBuilder } from 'kysely';
import { FEES_RECEIVABLE_SYSTEM_KEY } from '@eduvault/api-contract';

export function receivableAccountIdSql(
  organizationId: string | RawBuilder<unknown>
): RawBuilder<string> {
  return sql<string>`(
    select la.id from ledger_account la
    where la.organization_id = ${organizationId}
      and la.system_key = ${FEES_RECEIVABLE_SYSTEM_KEY}
  )`;
}

/** Positive is owing, negative is credit. */
export function receivableBalanceSql(alias: string): RawBuilder<string> {
  const id = sql.ref(`${alias}.id`);
  const organizationId = sql.ref(`${alias}.organization_id`);
  return sql<string>`coalesce((
    select sum(jl.debit_minor - jl.credit_minor)
    from journal_line jl
    where jl.organization_id = ${organizationId}
      and jl.student_id = ${id}
      and jl.ledger_account_id = ${receivableAccountIdSql(organizationId)}
  ), 0)`;
}
