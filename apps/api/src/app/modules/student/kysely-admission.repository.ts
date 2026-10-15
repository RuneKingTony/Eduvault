import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { sql, type Kysely } from 'kysely';
import { GUARDIAN_NOT_FOUND_MESSAGE } from '@eduvault/api-contract';
import type { DB } from '../../../db/db-types';
import { ActivityWriter } from '../../common/activity';
import { Clock, schoolToday } from '../../common/clock';
import { createPortalLogin } from '../../common/auth';
import type { CampusScope } from '../../common/campus-scope';
import { inCampusScope } from '../../common/db/in-campus-scope';
import { KYSELY_TOKEN, type Database } from '../../common/db/tokens';
import {
  allocateDocumentNumber,
  peekDocumentNumber,
} from '../../common/documents';
import {
  KyselyGuardianTx,
  attachGuardian,
  provisionGuardian,
  readSchoolRules,
  type GuardianTx,
  type SchoolRules,
} from '../../common/people';
import { visibleStudentsCte } from '../../common/students';
import { formatAdmissionNumber, formatStudentUsername } from './admission-ids';
import {
  AdmissionRepository,
  type AdmissionClass,
  type AdmissionGuardian,
  type AdmissionOutcome,
  type AdmissionWrite,
  type AdmittedGuardian,
  type CurrentTerm,
  type DuplicateMatch,
  type SchoolNaming,
} from './admission.repository';
import type { StudentVisibility } from './visibility';

const PG_UNIQUE_VIOLATION = '23505';
const USERNAME_INDEX = 'user_username_uidx';

const isUsernameClash = (error: unknown): boolean =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  error.code === PG_UNIQUE_VIOLATION &&
  'constraint' in error &&
  error.constraint === USERNAME_INDEX;

interface ArmRow {
  id: string;
  class_level_id: string;
  level_name: string;
  name: string;
  campus_id: string;
  campus_name: string;
}

const toClass = (row: ArmRow): AdmissionClass => ({
  id: row.id,
  levelId: row.class_level_id,
  levelName: row.level_name,
  name: row.name,
  campusId: row.campus_id,
  campusName: row.campus_name,
});

const activityText = (
  write: AdmissionWrite,
  admissionNumber: string,
  guardians: readonly AdmittedGuardian[]
): string => {
  const { firstName, lastName } = write.student;
  const from = write.startsLater ? ` from ${write.term.termName}` : '';
  const placed = `placed in ${write.arm.levelName} ${write.arm.name}${from}`;
  const names = guardians.map((guardian) => guardian.name).join(' and ');
  const noun = guardians.length === 1 ? 'guardian' : 'guardians';
  const people =
    guardians.length === 0
      ? 'with no guardian yet'
      : `with ${names} as ${noun}`;
  return `${firstName} ${lastName} admitted (${admissionNumber}), ${placed}, ${people}.`;
};

async function insertStudent(
  trx: Kysely<DB>,
  input: { write: AdmissionWrite; admissionNumber: string; today: string }
): Promise<string> {
  const { write, admissionNumber, today } = input;
  const row = await trx
    .insertInto('student')
    .values({
      organization_id: write.organizationId,
      campus_id: write.arm.campusId,
      first_name: write.student.firstName,
      last_name: write.student.lastName,
      gender: write.student.gender,
      date_of_birth: write.student.dateOfBirth,
      admission_number: admissionNumber,
      admitted_on: today,
      created_by: write.actor.id,
    })
    .returning('id')
    .executeTakeFirstOrThrow();
  return row.id;
}

async function insertEnrolment(
  trx: Kysely<DB>,
  write: AdmissionWrite,
  studentId: string
): Promise<void> {
  const enrolment = await trx
    .insertInto('student_enrollment')
    .values({
      organization_id: write.organizationId,
      student_id: studentId,
      session_id: write.term.sessionId,
      class_level_id: write.arm.levelId,
      status: 'active',
      is_new_student: true,
      created_by: write.actor.id,
    })
    .returning('id')
    .executeTakeFirstOrThrow();
  await trx
    .insertInto('enrollment_placement')
    .values({
      organization_id: write.organizationId,
      enrollment_id: enrolment.id,
      term_id: write.term.termId,
      class_arm_id: write.arm.id,
      campus_id: write.arm.campusId,
      created_by: write.actor.id,
    })
    .execute();
}

interface GuardianStep {
  write: AdmissionWrite;
  studentId: string;
  draft: AdmissionGuardian;
}

const attachBase = ({ write, studentId }: GuardianStep) => ({
  organizationId: write.organizationId,
  studentId,
  actorId: write.actor.id,
});

type ExistingDraft = Extract<AdmissionGuardian, { kind: 'existing' }>;
type NewDraft = Extract<AdmissionGuardian, { kind: 'new' }>;

async function admitExisting(
  tx: GuardianTx,
  step: GuardianStep & { draft: ExistingDraft }
): Promise<AdmittedGuardian> {
  const { draft } = step;
  const guardian = await tx.findGuardian(
    step.write.organizationId,
    draft.guardianId
  );
  if (guardian === undefined) {
    throw new NotFoundException(GUARDIAN_NOT_FOUND_MESSAGE);
  }
  await attachGuardian(tx, {
    ...attachBase(step),
    guardianId: guardian.id,
    userId: guardian.userId,
    relationship: draft.relationship,
    paysFees: draft.paysFees,
  });
  return {
    guardianId: guardian.id,
    name: guardian.fullName,
    relationship: draft.relationship,
    isNew: false,
    newLogin: false,
    email: null,
    username: null,
  };
}

async function admitNew(
  tx: GuardianTx,
  step: GuardianStep & { draft: NewDraft }
): Promise<AdmittedGuardian> {
  const { write, draft } = step;
  const provisioned = await provisionGuardian(tx, {
    organizationId: write.organizationId,
    actorId: write.actor.id,
    guardian: draft.guardian,
    passwordHash: draft.passwordHash,
  });
  await attachGuardian(tx, {
    ...attachBase(step),
    guardianId: provisioned.guardianId,
    userId: provisioned.userId,
    relationship: draft.guardian.relationship,
    paysFees: draft.guardian.paysFees,
  });
  return {
    guardianId: provisioned.guardianId,
    name: draft.guardian.fullName,
    relationship: draft.guardian.relationship,
    isNew: true,
    newLogin: provisioned.newLogin,
    email: provisioned.email,
    username: provisioned.username,
  };
}

const admitGuardian = (
  tx: GuardianTx,
  step: GuardianStep
): Promise<AdmittedGuardian> =>
  step.draft.kind === 'existing'
    ? admitExisting(tx, { ...step, draft: step.draft })
    : admitNew(tx, { ...step, draft: step.draft });

@Injectable()
export class KyselyAdmissionRepository extends AdmissionRepository {
  constructor(
    @Inject(KYSELY_TOKEN) private readonly db: Database,
    private readonly activity: ActivityWriter,
    private readonly clock: Clock
  ) {
    super();
  }

  today(organizationId: string): string {
    return schoolToday({ organizationId }, this.clock);
  }

  async currentTerm(organizationId: string): Promise<CurrentTerm | undefined> {
    const row = await this.db
      .selectFrom('term')
      .innerJoin('academic_session', 'academic_session.id', 'term.session_id')
      .select([
        'term.id as term_id',
        'term.name as term_name',
        'academic_session.id as session_id',
        'academic_session.name as session_name',
      ])
      .where('term.organization_id', '=', organizationId)
      .where('term.is_current', '=', true)
      .executeTakeFirst();
    return (
      row && {
        termId: row.term_id,
        termName: row.term_name,
        sessionId: row.session_id,
        sessionName: row.session_name,
      }
    );
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

  rules(organizationId: string): Promise<SchoolRules> {
    return readSchoolRules(this.db, organizationId);
  }

  async school(organizationId: string): Promise<SchoolNaming> {
    const row = await this.db
      .selectFrom('school_account')
      .innerJoin(
        'organization',
        'organization.id',
        'school_account.organization_id'
      )
      .select(['school_account.admission_prefix', 'organization.slug'])
      .where('school_account.organization_id', '=', organizationId)
      .executeTakeFirstOrThrow();
    return { prefix: row.admission_prefix, slug: row.slug };
  }

  nextNumber(organizationId: string): Promise<number> {
    return peekDocumentNumber(this.db, {
      organizationId,
      kind: 'admission',
      year: null,
    });
  }

  private arms(organizationId: string, campusScope: CampusScope) {
    return this.db
      .selectFrom('class_arm')
      .innerJoin('class_level', 'class_level.id', 'class_arm.class_level_id')
      .innerJoin('team', 'team.id', 'class_arm.campus_id')
      .select([
        'class_arm.id',
        'class_arm.class_level_id',
        'class_arm.name',
        'class_arm.campus_id',
        'class_level.name as level_name',
        'team.name as campus_name',
      ])
      .where('class_arm.organization_id', '=', organizationId)
      .where('class_arm.retired_at', 'is', null)
      .where((eb) =>
        inCampusScope(eb, 'class_arm.campus_id', { scope: campusScope })
      );
  }

  async classes(
    organizationId: string,
    campusScope: CampusScope
  ): Promise<AdmissionClass[]> {
    const rows = await this.arms(organizationId, campusScope)
      .orderBy('class_level.sequence')
      .orderBy('team.name')
      .orderBy('class_arm.name')
      .orderBy('class_arm.id')
      .execute();
    return rows.map((row) => toClass(row));
  }

  async findClass(
    organizationId: string,
    input: { campusScope: CampusScope; classArmId: string }
  ): Promise<AdmissionClass | undefined> {
    const row = await this.arms(organizationId, input.campusScope)
      .where('class_arm.id', '=', input.classArmId)
      .executeTakeFirst();
    return row && toClass(row);
  }

  async guardiansInSchool(
    organizationId: string,
    ids: readonly string[]
  ): Promise<string[]> {
    if (ids.length === 0) {
      return [];
    }
    const rows = await this.db
      .selectFrom('guardian')
      .select('id')
      .where('organization_id', '=', organizationId)
      .where('id', 'in', [...ids])
      .execute();
    return rows.map((row) => row.id);
  }

  async duplicates(
    organizationId: string,
    scope: StudentVisibility,
    input: {
      firstName: string;
      lastName: string;
      dateOfBirth: string;
    }
  ): Promise<DuplicateMatch[]> {
    const today = this.today(organizationId);
    const { rows } = await sql<{
      id: string;
      first_name: string;
      last_name: string;
      admission_number: string;
      not_seen_since: string | null;
      exit_kind: 'left' | 'graduated' | null;
      in_scope: boolean;
    }>`
      WITH ${visibleStudentsCte({ organizationId, ...scope, today })}
      SELECT s.id, s.first_name, s.last_name, s.admission_number,
        to_char(s.not_seen_since, 'YYYY-MM-DD') AS not_seen_since,
        s.exit_kind,
        EXISTS (SELECT 1 FROM visible v WHERE v.id = s.id) AS in_scope
      FROM student s
      WHERE s.organization_id = ${organizationId}
        AND lower(s.last_name) = lower(${input.lastName})
        AND lower(s.first_name) = lower(${input.firstName})
        AND s.date_of_birth = ${input.dateOfBirth}::date
      ORDER BY s.admission_number`.execute(this.db);
    return rows.map((row) => ({
      studentId: row.id,
      firstName: row.first_name,
      lastName: row.last_name,
      admissionNumber: row.admission_number,
      notSeenSince: row.not_seen_since,
      exitKind: row.exit_kind,
      inScope: row.in_scope,
    }));
  }

  async admit(write: AdmissionWrite): Promise<AdmissionOutcome> {
    try {
      return await this.admitOnce(write);
    } catch (error) {
      if (!isUsernameClash(error)) {
        throw error;
      }
      return this.admitOnce(write);
    }
  }

  private admitOnce(write: AdmissionWrite): Promise<AdmissionOutcome> {
    return this.db.transaction().execute(async (trx) => {
      const number = await allocateDocumentNumber(trx, {
        organizationId: write.organizationId,
        kind: 'admission',
        year: null,
      });
      const admissionNumber = formatAdmissionNumber(
        write.school.prefix,
        number
      );
      const studentUsername = formatStudentUsername(write.school.slug, number);
      const studentId = await insertStudent(trx, {
        write,
        admissionNumber,
        today: this.today(write.organizationId),
      });
      await insertEnrolment(trx, write, studentId);
      const login = await createPortalLogin(trx, {
        organizationId: write.organizationId,
        role: 'student',
        name: `${write.student.firstName} ${write.student.lastName}`,
        email: null,
        username: studentUsername,
        passwordHash: write.studentPasswordHash,
      });
      await trx
        .updateTable('student')
        .set({ user_id: login.userId })
        .where('id', '=', studentId)
        .where('organization_id', '=', write.organizationId)
        .execute();
      const tx = new KyselyGuardianTx(trx, this.activity);
      const guardians: AdmittedGuardian[] = [];
      for (const draft of write.guardians) {
        guardians.push(await admitGuardian(tx, { write, studentId, draft }));
      }
      await this.activity.record(trx, {
        organizationId: write.organizationId,
        campusId: write.arm.campusId,
        pillar: 'foundation',
        kind: 'student.admitted',
        actorUserId: write.actor.id,
        subjectType: 'student',
        subjectId: studentId,
        text: activityText(write, admissionNumber, guardians),
        data: { admissionNumber, classArmId: write.arm.id },
      });
      return { studentId, admissionNumber, studentUsername, guardians };
    });
  }
}
