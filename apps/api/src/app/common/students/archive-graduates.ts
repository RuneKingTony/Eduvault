import type { Kysely } from 'kysely';
import type { DB } from '../../../db/db-types';
import type { ActivityWriter } from '../activity';
import { stripMemberRole } from '../auth/portal-login';
import { endEnrolments } from './end-enrolments';

export interface GraduatingStudent {
  id: string;
  userId: string | null;
  name: string;
  campusId: string;
}

interface GraduationInput {
  organizationId: string;
  actorUserId: string;
  termId: string;
  sessionId: string;
  students: readonly GraduatingStudent[];
}

async function levelNames(
  trx: Kysely<DB>,
  input: GraduationInput,
  ids: readonly string[]
): Promise<Map<string, string>> {
  const rows = await trx
    .selectFrom('student_enrollment as en')
    .innerJoin('class_level as lvl', 'lvl.id', 'en.class_level_id')
    .select(['en.student_id', 'lvl.name as level_name'])
    .where('en.organization_id', '=', input.organizationId)
    .where('en.session_id', '=', input.sessionId)
    .where('en.student_id', 'in', [...ids])
    .execute();
  return new Map(rows.map((row) => [row.student_id, row.level_name]));
}

async function closeLogins(
  trx: Kysely<DB>,
  activity: ActivityWriter,
  input: GraduationInput & { graduates: readonly GraduatingStudent[] }
): Promise<void> {
  const levels = await levelNames(
    trx,
    input,
    input.graduates.map((student) => student.id)
  );
  for (const student of input.graduates) {
    if (student.userId !== null) {
      await stripMemberRole(trx, {
        organizationId: input.organizationId,
        userId: student.userId,
        role: 'student',
      });
    }
    const level = levels.get(student.id) ?? 'final year';
    await activity.record(trx, {
      organizationId: input.organizationId,
      campusId: student.campusId,
      pillar: 'foundation',
      kind: 'student.graduated',
      actorUserId: input.actorUserId,
      subjectType: 'student',
      subjectId: student.id,
      text: `${student.name} graduated: Completed ${level}.`,
      data: { sessionId: input.sessionId },
    });
  }
}

async function archiveStudents(
  trx: Kysely<DB>,
  input: GraduationInput
): Promise<GraduatingStudent[]> {
  const archived = await trx
    .updateTable('student')
    .set({
      exit_kind: 'graduated',
      exit_reason: 'completed',
      graduated_session_id: input.sessionId,
      archived_at: new Date(),
      archived_by: input.actorUserId,
      archived_term_id: input.termId,
      updated_at: new Date(),
    })
    .where('organization_id', '=', input.organizationId)
    .where('exit_kind', 'is', null)
    .where(
      'id',
      'in',
      input.students.map((student) => student.id)
    )
    .returning('id')
    .execute();
  const done = new Set(archived.map((row) => row.id));
  return input.students.filter((student) => done.has(student.id));
}

export async function archiveGraduates(
  trx: Kysely<DB>,
  activity: ActivityWriter,
  input: GraduationInput
): Promise<number> {
  if (input.students.length === 0) {
    return 0;
  }
  const graduates = await archiveStudents(trx, input);
  if (graduates.length === 0) {
    return 0;
  }
  await endEnrolments(trx, {
    organizationId: input.organizationId,
    studentIds: graduates.map((student) => student.id),
    sessionId: input.sessionId,
    status: 'completed',
  });
  await closeLogins(trx, activity, { ...input, graduates });
  return graduates.length;
}
