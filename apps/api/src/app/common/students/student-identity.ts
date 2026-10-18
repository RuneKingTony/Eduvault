import { sql, type Kysely } from 'kysely';
import type { DB } from '../../../db/db-types';
import type { CampusScope } from '../campus-scope';
import { currentCampusSql } from './current-campus';
import { inScope } from './visible-students';

export interface StudentIdentity {
  id: string;
  name: string;
  campusId: string;
}

export interface StudentIdentityRow {
  id: string;
  first_name: string;
  last_name: string;
  campus_id: string;
}

export const toStudentIdentity = (
  row: StudentIdentityRow
): StudentIdentity => ({
  id: row.id,
  name: `${row.first_name} ${row.last_name}`,
  campusId: row.campus_id,
});

export async function findStudentIdentity(
  trx: Kysely<DB>,
  scope: { organizationId: string; campusScope: CampusScope },
  studentId: string
): Promise<StudentIdentity | undefined> {
  const { rows } = await sql<StudentIdentityRow>`
    SELECT st.id, st.first_name, st.last_name, ${currentCampusSql('st')} AS campus_id
    FROM student st
    WHERE st.id = ${studentId} AND st.organization_id = ${scope.organizationId}
      AND ${inScope(currentCampusSql('st'), scope.campusScope)}`.execute(trx);
  const row = rows[0];
  return row && toStudentIdentity(row);
}
