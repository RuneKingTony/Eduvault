import { sql, type RawBuilder } from 'kysely';
import type { CampusScope } from '../campus-scope';
import { currentCampusSql } from './current-campus';
import { inScope } from './visible-students';

export function anyChildInScopeSql(
  alias: string,
  scope: CampusScope
): RawBuilder<boolean> {
  if (scope === 'all') {
    return sql<boolean>`TRUE`;
  }
  const guardianId = sql.ref(`${alias}.guardian_id`);
  const organizationId = sql.ref(`${alias}.organization_id`);
  return sql<boolean>`EXISTS (
    SELECT 1 FROM guardian_student fg
    JOIN student fs ON fs.id = fg.student_id AND fs.organization_id = fg.organization_id
    WHERE fg.guardian_id = ${guardianId} AND fg.organization_id = ${organizationId}
      AND ${inScope(currentCampusSql('fs'), scope)})`;
}
