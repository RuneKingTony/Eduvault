import type { Database } from './tokens';

interface ClassTeachingEnd {
  organizationId: string;
  userId: string;
  /** Only the classes on these campuses; every class when left out. */
  campusIds?: readonly string[];
}

/** Covers class-teacher and subject-teacher rows; earlier years' and terms' rows stay as history. */
export async function endClassTeaching(
  db: Database,
  { organizationId, userId, campusIds }: ClassTeachingEnd
): Promise<void> {
  if (campusIds?.length === 0) {
    return;
  }
  const campusArms = () =>
    db
      .selectFrom('class_arm')
      .select('class_arm.id')
      .where('class_arm.organization_id', '=', organizationId)
      .where('class_arm.campus_id', 'in', [...(campusIds ?? [])]);
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
    .$if(campusIds !== undefined, (qb) =>
      qb.where('class_arm_id', 'in', campusArms())
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
    .$if(campusIds !== undefined, (qb) =>
      qb.where('class_arm_id', 'in', campusArms())
    )
    .execute();
}
