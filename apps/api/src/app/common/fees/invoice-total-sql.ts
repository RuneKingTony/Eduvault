import { sql, type RawBuilder } from 'kysely';

export function invoiceTotalSql(alias: string): RawBuilder<string> {
  const id = sql.ref(`${alias}.id`);
  const organizationId = sql.ref(`${alias}.organization_id`);
  return sql<string>`COALESCE((
    SELECT sum(il.amount_minor)
    FROM invoice_line il
    WHERE il.invoice_id = ${id} AND il.organization_id = ${organizationId}
  ), 0)`;
}
