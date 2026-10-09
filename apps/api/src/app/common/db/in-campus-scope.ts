import type { ExpressionBuilder, ReferenceExpression } from 'kysely';
import type { DB } from '../../../db/db-types';
import type { CampusScope } from '../campus-scope';

/** WHERE fragment keeping only rows on campuses the caller may see. */
export function inCampusScope<TB extends keyof DB>(
  eb: ExpressionBuilder<DB, TB>,
  column: ReferenceExpression<DB, TB>,
  scope: CampusScope
) {
  if (scope === 'all') {
    return eb.val(true);
  }
  if (scope.length === 0) {
    return eb.val(false);
  }
  return eb(column, 'in', scope);
}
