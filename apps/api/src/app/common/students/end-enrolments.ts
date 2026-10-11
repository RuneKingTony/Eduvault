import type { ExpressionBuilder, Kysely } from 'kysely';
import type { DB } from '../../../db/db-types';

interface EndInput {
  organizationId: string;
  studentIds: readonly string[];
  sessionId: string;
  status: 'withdrawn' | 'completed';
}

function sessionsAfter(
  eb: ExpressionBuilder<DB, 'student_enrollment'>,
  input: { organizationId: string; sessionId: string },
  bound: 'after' | 'fromAndAfter'
) {
  return eb
    .selectFrom('academic_session as later')
    .select('later.id')
    .where('later.organization_id', '=', input.organizationId)
    .where('later.starts_on', bound === 'after' ? '>' : '>=', (sub) =>
      sub
        .selectFrom('academic_session as base')
        .select('base.starts_on')
        .where('base.id', '=', input.sessionId)
        .where('base.organization_id', '=', input.organizationId)
    );
}

/**
 * Start gives movers and repeaters an active enrolment in the next school year
 * before its term is current, so an exit must close those as well.
 */
export async function endEnrolments(
  trx: Kysely<DB>,
  input: EndInput
): Promise<void> {
  const closeActive = (status: EndInput['status']) =>
    trx
      .updateTable('student_enrollment')
      .set({ status, updated_at: new Date() })
      .where('organization_id', '=', input.organizationId)
      .where('student_id', 'in', [...input.studentIds])
      .where('status', '=', 'active');
  await closeActive(input.status)
    .where('session_id', '=', input.sessionId)
    .execute();
  await closeActive('withdrawn')
    .where('session_id', 'in', (eb) => sessionsAfter(eb, input, 'after'))
    .execute();
}

export async function restoreEnrolments(
  trx: Kysely<DB>,
  input: { organizationId: string; studentId: string; sessionId: string }
): Promise<void> {
  await trx
    .updateTable('student_enrollment')
    .set({ status: 'active', updated_at: new Date() })
    .where('organization_id', '=', input.organizationId)
    .where('student_id', '=', input.studentId)
    .where('status', 'in', ['withdrawn', 'completed'])
    .where('session_id', 'in', (eb) => sessionsAfter(eb, input, 'fromAndAfter'))
    .execute();
}
