import { Inject, Injectable } from '@nestjs/common';
import { sql, type Kysely } from 'kysely';
import { splitRoles } from '@eduvault/policy';
import type { DB } from '../../../db/db-types';
import { ActivityWriter, type ActivityInput } from '../../common/activity';
import { addMemberRole, stripMemberRole } from '../../common/auth/member-rows';
import { resetPortalPassword } from '../../common/auth/portal-login';
import { KYSELY_TOKEN, type Database } from '../../common/db/tokens';
import {
  archiveGraduates,
  endEnrolments,
  placedNow,
  restoreEnrolments,
  type GraduatingStudent,
} from '../../common/students';
import type { CurrentTerm } from './admission.repository';
import {
  LifecycleRepository,
  type EnrolmentFacts,
  type LeavingWrite,
  type LifecycleStudent,
  type LifecycleTx,
  type PlacementArm,
} from './lifecycle.repository';

interface StudentRow {
  id: string;
  first_name: string;
  last_name: string;
  admitted_on: string;
  user_id: string | null;
  campus_id: string;
  not_seen_since: string | null;
  exit_kind: 'left' | 'graduated' | null;
  archived_term_id: string | null;
}

interface ArchivedRow {
  user_id: string | null;
  graduated_session_id: string | null;
  term_session_id: string | null;
}

interface ArmRow {
  id: string;
  levelId: string;
  campusId: string;
  retiredAt: Date | null;
  campusName: string;
  levelName: string;
  armName: string;
}

const toPlacementArm = (row: ArmRow): PlacementArm => ({
  id: row.id,
  levelId: row.levelId,
  display: `${row.levelName} ${row.armName}`,
  campusId: row.campusId,
  campusName: row.campusName,
  retired: row.retiredAt !== null,
});

class KyselyLifecycleTx implements LifecycleTx {
  constructor(
    private readonly db: Kysely<DB>,
    private readonly activity: ActivityWriter
  ) {}

  async lockStudent(
    organizationId: string,
    studentId: string
  ): Promise<LifecycleStudent | undefined> {
    const { rows } = await sql<StudentRow>`
      SELECT
        s.id,
        s.first_name,
        s.last_name,
        s.user_id,
        s.exit_kind,
        s.archived_term_id,
        to_char(s.admitted_on, 'YYYY-MM-DD') AS admitted_on,
        to_char(s.not_seen_since, 'YYYY-MM-DD') AS not_seen_since,
        COALESCE(cp.campus_id, s.campus_id) AS campus_id
      FROM student s
      LEFT JOIN term cur ON cur.organization_id = s.organization_id AND cur.is_current
      LEFT JOIN student_enrollment ce
        ON ce.student_id = s.id AND ce.organization_id = s.organization_id AND ce.session_id = cur.session_id
      LEFT JOIN enrollment_placement cp ON cp.enrollment_id = ce.id AND cp.term_id = cur.id
      WHERE s.id = ${studentId}::uuid AND s.organization_id = ${organizationId}
      FOR UPDATE OF s`.execute(this.db);
    const [row] = rows;
    return (
      row && {
        id: row.id,
        firstName: row.first_name,
        lastName: row.last_name,
        admittedOn: row.admitted_on,
        userId: row.user_id,
        campusId: row.campus_id,
        notSeenSince: row.not_seen_since,
        exitKind: row.exit_kind,
        archivedTermId: row.archived_term_id,
      }
    );
  }

  async currentTerm(organizationId: string): Promise<CurrentTerm | undefined> {
    const row = await this.db
      .selectFrom('term')
      .innerJoin('academic_session', 'academic_session.id', 'term.session_id')
      .select([
        'term.id as termId',
        'term.name as termName',
        'academic_session.id as sessionId',
        'academic_session.name as sessionName',
      ])
      .where('term.organization_id', '=', organizationId)
      .where('term.is_current', '=', true)
      .executeTakeFirst();
    return row;
  }

  async nextTerm(
    organizationId: string,
    termId: string
  ): Promise<{ id: string; name: string } | undefined> {
    const { rows } = await sql<{ id: string; name: string }>`
      SELECT nxt.id, nxt.name
      FROM term cur
      JOIN term nxt
        ON nxt.organization_id = cur.organization_id
        AND nxt.session_id = cur.session_id
        AND nxt.sequence = cur.sequence + 1
      WHERE cur.id = ${termId}::uuid AND cur.organization_id = ${organizationId}`.execute(
      this.db
    );
    return rows[0];
  }

  async setNotSeen(input: {
    organizationId: string;
    studentId: string;
    date: string;
    byUserId: string;
    note: string | null;
  }): Promise<void> {
    await this.db
      .updateTable('student')
      .set({
        not_seen_since: input.date,
        not_seen_by: input.byUserId,
        not_seen_note: input.note,
        updated_at: new Date(),
      })
      .where('id', '=', input.studentId)
      .where('organization_id', '=', input.organizationId)
      .execute();
  }

  async clearNotSeen(organizationId: string, studentId: string): Promise<void> {
    await this.db
      .updateTable('student')
      .set({
        not_seen_since: null,
        not_seen_by: null,
        not_seen_note: null,
        updated_at: new Date(),
      })
      .where('id', '=', studentId)
      .where('organization_id', '=', organizationId)
      .execute();
  }

  async recordLeaving(write: LeavingWrite): Promise<void> {
    await this.db
      .updateTable('student')
      .set({
        exit_kind: 'left',
        exit_reason: write.reason,
        exit_note: write.note,
        last_day: write.lastDay,
        archived_at: new Date(),
        archived_by: write.actorUserId,
        archived_term_id: write.termId,
        updated_at: new Date(),
      })
      .where('id', '=', write.studentId)
      .where('organization_id', '=', write.organizationId)
      .execute();
    await endEnrolments(this.db, {
      organizationId: write.organizationId,
      studentIds: [write.studentId],
      sessionId: write.sessionId,
      status: 'withdrawn',
    });
    if (write.userId !== null) {
      await stripMemberRole(this.db, {
        organizationId: write.organizationId,
        userId: write.userId,
        role: 'student',
      });
    }
  }

  async undoArchive(input: {
    organizationId: string;
    studentId: string;
    userId: string | null;
  }): Promise<void> {
    const { rows } = await sql<ArchivedRow>`
      SELECT s.user_id, s.graduated_session_id, t.session_id AS term_session_id
      FROM student s
      LEFT JOIN term t ON t.id = s.archived_term_id
      WHERE s.id = ${input.studentId}::uuid AND s.organization_id = ${input.organizationId}`.execute(
      this.db
    );
    const archived = rows[0];
    const sessionId =
      archived?.graduated_session_id ?? archived?.term_session_id ?? null;
    await this.db
      .updateTable('student')
      .set({
        exit_kind: null,
        exit_reason: null,
        exit_note: null,
        last_day: null,
        graduated_session_id: null,
        archived_at: null,
        archived_by: null,
        archived_term_id: null,
        updated_at: new Date(),
      })
      .where('id', '=', input.studentId)
      .where('organization_id', '=', input.organizationId)
      .execute();
    if (sessionId !== null) {
      await restoreEnrolments(this.db, {
        organizationId: input.organizationId,
        studentId: input.studentId,
        sessionId,
      });
    }
    if (input.userId !== null) {
      await addMemberRole(this.db, {
        organizationId: input.organizationId,
        userId: input.userId,
        role: 'student',
      });
    }
  }

  async activeEnrolment(
    organizationId: string,
    input: { studentId: string; sessionId: string }
  ): Promise<EnrolmentFacts | undefined> {
    const row = await this.db
      .selectFrom('student_enrollment as en')
      .innerJoin('class_level as lvl', 'lvl.id', 'en.class_level_id')
      .select(['en.id', 'lvl.id as levelId', 'lvl.name as levelName'])
      .where('en.organization_id', '=', organizationId)
      .where('en.student_id', '=', input.studentId)
      .where('en.session_id', '=', input.sessionId)
      .where('en.status', '=', 'active')
      .executeTakeFirst();
    return row;
  }

  async hasPlacement(
    organizationId: string,
    input: { enrolmentId: string; termId: string }
  ): Promise<boolean> {
    const row = await this.db
      .selectFrom('enrollment_placement')
      .select('id')
      .where('organization_id', '=', organizationId)
      .where('enrollment_id', '=', input.enrolmentId)
      .where('term_id', '=', input.termId)
      .executeTakeFirst();
    return row !== undefined;
  }

  private armsQuery(organizationId: string) {
    return this.db
      .selectFrom('class_arm as arm')
      .innerJoin('class_level as lvl', 'lvl.id', 'arm.class_level_id')
      .innerJoin('team', 'team.id', 'arm.campus_id')
      .select([
        'arm.id',
        'arm.class_level_id as levelId',
        'arm.campus_id as campusId',
        'arm.retired_at as retiredAt',
        'team.name as campusName',
        'lvl.name as levelName',
        'arm.name as armName',
      ])
      .where('arm.organization_id', '=', organizationId);
  }

  async findArm(
    organizationId: string,
    armId: string
  ): Promise<PlacementArm | undefined> {
    const row = await this.armsQuery(organizationId)
      .where('arm.id', '=', armId)
      .executeTakeFirst();
    return row && toPlacementArm(row);
  }

  async openArmsAtLevel(
    organizationId: string,
    levelId: string
  ): Promise<PlacementArm[]> {
    const rows = await this.armsQuery(organizationId)
      .where('arm.class_level_id', '=', levelId)
      .where('arm.retired_at', 'is', null)
      .orderBy('team.name')
      .orderBy('arm.name')
      .execute();
    return rows.map((row) => toPlacementArm(row));
  }

  async insertPlacement(input: {
    organizationId: string;
    enrolmentId: string;
    termId: string;
    arm: PlacementArm;
    actorUserId: string;
  }): Promise<void> {
    await this.db
      .insertInto('enrollment_placement')
      .values({
        organization_id: input.organizationId,
        enrollment_id: input.enrolmentId,
        term_id: input.termId,
        class_arm_id: input.arm.id,
        campus_id: input.arm.campusId,
        created_by: input.actorUserId,
      })
      .execute();
  }

  async lockRoster(
    organizationId: string,
    input: { armId: string; ids: readonly string[] }
  ): Promise<GraduatingStudent[]> {
    const rows = await placedNow(this.db, organizationId)
      .where('ep.class_arm_id', '=', input.armId)
      .where('en.status', '=', 'active')
      .where('student.id', 'in', [...input.ids])
      .select([
        'student.id',
        'student.user_id',
        'student.first_name',
        'student.last_name',
        'ep.campus_id',
      ])
      .forUpdate(['student'])
      .execute();
    return rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      name: `${row.first_name} ${row.last_name}`,
      campusId: row.campus_id,
    }));
  }

  graduate(input: {
    organizationId: string;
    actorUserId: string;
    termId: string;
    sessionId: string;
    students: readonly GraduatingStudent[];
  }): Promise<number> {
    return archiveGraduates(this.db, this.activity, input);
  }

  async resetLogin(input: {
    organizationId: string;
    userId: string;
    passwordHash: string;
  }): Promise<'reset' | 'shared' | 'missing'> {
    const user = await this.db
      .selectFrom('user')
      .select('role')
      .where('id', '=', input.userId)
      .forUpdate()
      .executeTakeFirst();
    if (user === undefined) {
      return 'missing';
    }
    const members = await this.db
      .selectFrom('member')
      .select(['organizationId', 'role'])
      .where('userId', '=', input.userId)
      .execute();
    const ownRoleOnly = members.every(
      (member) =>
        member.organizationId === input.organizationId &&
        splitRoles(member.role).every((role) => role === 'student')
    );
    if (!ownRoleOnly || splitRoles(user.role).length > 0) {
      return 'shared';
    }
    await resetPortalPassword(this.db, {
      userId: input.userId,
      passwordHash: input.passwordHash,
    });
    return 'reset';
  }

  record(input: ActivityInput): Promise<void> {
    return this.activity.record(this.db, input);
  }
}

@Injectable()
export class KyselyLifecycleRepository extends LifecycleRepository {
  constructor(
    @Inject(KYSELY_TOKEN) private readonly db: Database,
    private readonly activity: ActivityWriter
  ) {
    super();
  }

  transaction<T>(fn: (tx: LifecycleTx) => Promise<T>): Promise<T> {
    return this.db
      .transaction()
      .execute((trx) => fn(new KyselyLifecycleTx(trx, this.activity)));
  }
}
