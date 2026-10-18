import type { Database } from './tokens';

export type TeachingScope =
  | { kind: 'all' }
  | { kind: 'on'; campusIds: readonly string[] }
  | { kind: 'outside'; campusIds: readonly string[] };

interface ClassTeachingEndInput {
  organizationId: string;
  userId: string;
  scope?: TeachingScope;
}

function campusArmFilter(
  scope: TeachingScope | undefined
): { operator: 'in' | 'not in'; campusIds: readonly string[] } | undefined {
  if (scope?.kind === 'on') {
    return { operator: 'in', campusIds: scope.campusIds };
  }
  if (scope?.kind === 'outside' && scope.campusIds.length > 0) {
    return { operator: 'not in', campusIds: scope.campusIds };
  }
  return undefined;
}

/** Covers class-teacher and subject-teacher rows; earlier years' and terms' rows stay as history. */
export async function endClassTeaching(
  db: Database,
  end: ClassTeachingEndInput
): Promise<void> {
  const { organizationId, userId, scope } = end;
  if (scope?.kind === 'on' && scope.campusIds.length === 0) {
    return;
  }
  const filter = campusArmFilter(scope);
  const campusArms =
    filter &&
    db
      .selectFrom('class_arm')
      .select('class_arm.id')
      .where('class_arm.organization_id', '=', organizationId)
      .where('class_arm.campus_id', filter.operator, [...filter.campusIds]);
  await db
    .deleteFrom('class_arm_teacher')
    .where('organization_id', '=', organizationId)
    .where('user_id', '=', userId)
    .where(
      'session_id',
      'in',
      db
        .selectFrom('term')
        .select('term.session_id')
        .where('term.organization_id', '=', organizationId)
        .where('term.is_current', '=', true)
    )
    .$call((qb) =>
      campusArms === undefined ? qb : qb.where('class_arm_id', 'in', campusArms)
    )
    .execute();
  await db
    .deleteFrom('subject_teacher')
    .where('organization_id', '=', organizationId)
    .where('user_id', '=', userId)
    .where(
      'term_id',
      'in',
      db
        .selectFrom('term')
        .select('term.id')
        .where('term.organization_id', '=', organizationId)
        .where('term.is_current', '=', true)
    )
    .$call((qb) =>
      campusArms === undefined ? qb : qb.where('class_arm_id', 'in', campusArms)
    )
    .execute();
}
