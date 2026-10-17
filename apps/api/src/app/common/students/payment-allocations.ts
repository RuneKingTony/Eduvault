import { sql, type RawBuilder } from 'kysely';
import type { CampusScope } from '../campus-scope';
import { currentCampusSql } from './current-campus';
import { inScope } from './visible-students';

/** A payment is visible when any student it pays for is in scope. */
export function anyAllocationInScopeSql(
  alias: string,
  scope: CampusScope
): RawBuilder<boolean> {
  if (scope === 'all') {
    return sql<boolean>`TRUE`;
  }
  const id = sql.ref(`${alias}.id`);
  const organizationId = sql.ref(`${alias}.organization_id`);
  return sql<boolean>`EXISTS (
    SELECT 1 FROM payment_allocation va
    JOIN student vs ON vs.id = va.student_id AND vs.organization_id = va.organization_id
    WHERE va.payment_id = ${id} AND va.organization_id = ${organizationId}
      AND ${inScope(currentCampusSql('vs'), scope)})`;
}

export function allAllocationsInScopeSql(
  alias: string,
  scope: CampusScope
): RawBuilder<boolean> {
  if (scope === 'all') {
    return sql<boolean>`TRUE`;
  }
  const id = sql.ref(`${alias}.id`);
  const organizationId = sql.ref(`${alias}.organization_id`);
  return sql<boolean>`NOT EXISTS (
    SELECT 1 FROM payment_allocation va
    JOIN student vs ON vs.id = va.student_id AND vs.organization_id = va.organization_id
    WHERE va.payment_id = ${id} AND va.organization_id = ${organizationId}
      AND NOT (${inScope(currentCampusSql('vs'), scope)}))`;
}
