import type { ExpressionBuilder, ReferenceExpression } from 'kysely';
import type { DB } from '../../db/db-types';
import type { OrgContext } from './auth';

/** WHERE fragment keeping only rows on campuses the caller may see. */
export function inCampusScope<TB extends keyof DB>(
  eb: ExpressionBuilder<DB, TB>,
  column: ReferenceExpression<DB, TB>,
  scope: OrgContext['campusScope']
) {
  if (scope === 'all') return eb.val(true);
  if (scope.length === 0) return eb.val(false);
  return eb(column, 'in', scope);
}

export const canSeeCampus = (
  scope: OrgContext['campusScope'],
  campusId: string
): boolean => scope === 'all' || scope.includes(campusId);
