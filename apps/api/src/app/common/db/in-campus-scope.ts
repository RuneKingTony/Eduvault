import type { ExpressionBuilder, ReferenceExpression } from 'kysely';
import type { DB } from '../../../db/db-types';
import type { CampusScope } from '../campus-scope';

export interface InCampusScopeOptions {
  scope: CampusScope;
  /**
   * Who sees a row whose campus is null: 'all' means every member of the
   * school, 'readAllOnly' (the default) only a caller whose scope is 'all'.
   */
  nullMeans?: 'all' | 'readAllOnly';
}

/** WHERE fragment keeping only rows on campuses the caller may see. */
export function inCampusScope<TB extends keyof DB>(
  eb: ExpressionBuilder<DB, TB>,
  column: ReferenceExpression<DB, TB>,
  { scope, nullMeans = 'readAllOnly' }: InCampusScopeOptions
) {
  if (scope === 'all') {
    return eb.val(true);
  }
  const inScope = scope.length === 0 ? eb.val(false) : eb(column, 'in', scope);
  return nullMeans === 'all'
    ? eb.or([eb(column, 'is', null), inScope])
    : inScope;
}
