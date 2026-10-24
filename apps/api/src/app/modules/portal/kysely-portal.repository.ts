import { Inject, Injectable } from '@nestjs/common';
import { sql, type RawBuilder } from 'kysely';
import {
  classTeacherRoleSchema,
  type ClassTeacher,
  type PortalChild,
} from '@eduvault/api-contract';
import { inStudentScope } from '../../common/db/in-student-scope';
import { KYSELY_TOKEN, type Database } from '../../common/db/tokens';
import { receivableBalanceSql } from '../../common/ledger';
import {
  PortalRepository,
  type PortalProfile,
  type PortalScope,
  type PortalStudentRecord,
} from './portal.repository';

const day = (column: string) =>
  sql<string>`to_char(${sql.ref(column)}, 'YYYY-MM-DD')`;

const usernameOf = sql<
  string | null
>`COALESCE("user"."displayUsername", "user"."username")`;

@Injectable()
export class KyselyPortalRepository extends PortalRepository {
  constructor(@Inject(KYSELY_TOKEN) private readonly db: Database) {
    super();
  }

  /** Class and campus come from the current-term placement, else no class and the home campus. */
  private placed(scope: PortalScope) {
    return this.db
      .selectFrom('student')
      .where('student.organization_id', '=', scope.organizationId)
      .where((eb) => inStudentScope(eb, 'student.id', scope.studentScope))
      .leftJoin('term as current_term', (join) =>
        join
          .onRef('current_term.organization_id', '=', 'student.organization_id')
          .on('current_term.is_current', '=', true)
      )
      .leftJoin('student_enrollment as enrolment', (join) =>
        join
          .onRef('enrolment.student_id', '=', 'student.id')
          .onRef('enrolment.organization_id', '=', 'student.organization_id')
          .onRef('enrolment.session_id', '=', 'current_term.session_id')
      )
      .leftJoin('enrollment_placement as placement', (join) =>
        join
          .onRef('placement.enrollment_id', '=', 'enrolment.id')
          .onRef('placement.term_id', '=', 'current_term.id')
      )
      .leftJoin('class_arm as arm', 'arm.id', 'placement.class_arm_id')
      .leftJoin('class_level as level', 'level.id', 'arm.class_level_id')
      .leftJoin('user', 'user.id', 'student.user_id')
      .innerJoin('team as campus', (join) =>
        join.on(
          sql<boolean>`campus.id = COALESCE(placement.campus_id, student.campus_id)`
        )
      )
      .select([
        'student.id',
        'student.first_name',
        'student.last_name',
        'student.exit_kind',
        'student.admission_number',
        day('student.date_of_birth').as('date_of_birth'),
        usernameOf.as('username'),
        'arm.id as arm_id',
        'campus.id as campus_id',
        'campus.name as campus_name',
        sql<string | null>`level.name || ' ' || arm.name`.as('class_name'),
      ]);
  }

  async profile(
    organizationId: string,
    userId: string
  ): Promise<PortalProfile | undefined> {
    const row = await this.db
      .selectFrom('organization')
      .where('organization.id', '=', organizationId)
      .innerJoin(
        'school_account',
        'school_account.organization_id',
        'organization.id'
      )
      .innerJoin('user', (join) => join.on('user.id', '=', userId))
      .leftJoin('student', (join) =>
        join
          .onRef('student.user_id', '=', 'user.id')
          .onRef('student.organization_id', '=', 'organization.id')
      )
      .select([
        'user.name',
        'user.email',
        usernameOf.as('username'),
        'student.first_name as student_first_name',
        'organization.name as school_name',
        'school_account.admission_prefix',
        'school_account.currency',
        'school_account.logo_file_id',
        'school_account.email as school_email',
      ])
      .executeTakeFirst();
    return (
      row && {
        name: row.name,
        username: row.username,
        email: row.email,
        studentFirstName: row.student_first_name,
        school: {
          name: row.school_name,
          admissionPrefix: row.admission_prefix,
          currency: row.currency,
          logoUrl:
            row.logo_file_id === null ? null : `/files/${row.logo_file_id}`,
          email: row.school_email,
        },
      }
    );
  }

  children(scope: PortalScope): Promise<PortalChild[]> {
    return this.childrenOf(scope, sql<string | null>`null`);
  }

  childrenWithBalance(scope: PortalScope): Promise<PortalChild[]> {
    return this.childrenOf(
      scope,
      sql<string | null>`(${receivableBalanceSql('student')})::text`
    );
  }

  private async childrenOf(
    scope: PortalScope,
    balance: RawBuilder<string | null>
  ): Promise<PortalChild[]> {
    const rows = await this.placed(scope)
      .select(balance.as('balance'))
      .orderBy('student.first_name')
      .orderBy('student.last_name')
      .orderBy('student.id')
      .execute();
    return rows.map((row) => ({
      id: row.id,
      firstName: row.first_name,
      lastName: row.last_name,
      className: row.class_name,
      campusName: row.campus_name,
      archived: row.exit_kind !== null,
      ...(row.balance === null ? {} : { balanceMinor: Number(row.balance) }),
    }));
  }

  async student(
    scope: PortalScope,
    studentId: string
  ): Promise<PortalStudentRecord | undefined> {
    const row = await this.placed(scope)
      .where('student.id', '=', studentId)
      .executeTakeFirst();
    return (
      row && {
        id: row.id,
        firstName: row.first_name,
        lastName: row.last_name,
        admissionNumber: row.admission_number,
        dateOfBirth: row.date_of_birth,
        className: row.class_name,
        campusName: row.campus_name,
        campusId: row.campus_id,
        armId: row.arm_id,
        username: row.username,
        archived: row.exit_kind !== null,
      }
    );
  }

  async classTeachers(
    organizationId: string,
    armId: string
  ): Promise<ClassTeacher[]> {
    const rows = await this.db
      .selectFrom('class_arm_teacher')
      .innerJoin('term', (join) =>
        join
          .onRef('term.session_id', '=', 'class_arm_teacher.session_id')
          .onRef(
            'term.organization_id',
            '=',
            'class_arm_teacher.organization_id'
          )
          .on('term.is_current', '=', true)
      )
      .innerJoin('user', 'user.id', 'class_arm_teacher.user_id')
      .where('class_arm_teacher.organization_id', '=', organizationId)
      .where('class_arm_teacher.class_arm_id', '=', armId)
      .select([
        'class_arm_teacher.user_id',
        'class_arm_teacher.role',
        'user.name',
      ])
      .execute();
    return rows.map((row) => ({
      userId: row.user_id,
      name: row.name,
      role: classTeacherRoleSchema.parse(row.role),
    }));
  }
}
