import type { ExpressionBuilder, ReferenceExpression } from 'kysely';
import type { DB } from '../../../db/db-types';

export function inStudentScope<TB extends keyof DB>(
  eb: ExpressionBuilder<DB, TB>,
  column: ReferenceExpression<DB, TB>,
  scope: readonly string[]
) {
  return scope.length === 0 ? eb.val(false) : eb(column, 'in', [...scope]);
}
