import { sql, type Kysely } from 'kysely';
import type { DB } from '../../../db/db-types';
import type { CampusAmount } from '../activity';
import { currentCampusSql } from '../students';

export async function allocationShares(
  db: Kysely<DB>,
  payment: { organizationId: string; paymentId: string }
): Promise<CampusAmount[]> {
  const { rows } = await sql<{ campus_id: string; amount_minor: string }>`
    SELECT ${currentCampusSql('st')} AS campus_id, pa.amount_minor::text AS amount_minor
    FROM payment_allocation pa
    JOIN student st ON st.id = pa.student_id AND st.organization_id = pa.organization_id
    WHERE pa.payment_id = ${payment.paymentId} AND pa.organization_id = ${payment.organizationId}
    ORDER BY st.first_name, st.last_name, st.id`.execute(db);
  return rows.map((row) => ({
    campusId: row.campus_id,
    amountMinor: Number(row.amount_minor),
  }));
}
