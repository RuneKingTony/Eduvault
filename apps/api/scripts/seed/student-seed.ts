import type { INestApplicationContext } from '@nestjs/common';
import type { GuardianDraft } from '@eduvault/api-contract';
import { AccountService, type OrgContext } from '../../src/app/common/auth';
import { Clock } from '../../src/app/common/clock';
import { KYSELY_TOKEN, type Database } from '../../src/app/common/db/tokens';
import { ClassService } from '../../src/app/modules/class/class.service';
import { AdmissionService } from '../../src/app/modules/student/admission.service';
import { shiftDate } from './date-shift';
import { SEED_PASSWORD } from './members';
import { SEED_GUARDIANS, students, type SeedStudent } from './students';

const GREENFIELD_PREFIX = 'GF';
const GREENFIELD_SLUG = 'greenfield';

interface Arm {
  id: string;
  levelId: string;
  campusId: string;
}

interface Admitted {
  student: SeedStudent;
  studentId: string;
}

const found = <T>(value: T | undefined, what: string): T => {
  if (value === undefined) {
    throw new Error(`Seed has no ${what}`);
  }
  return value;
};

async function loadArms(
  app: INestApplicationContext,
  owner: OrgContext
): Promise<Map<string, Arm>> {
  const rows = await app
    .get(ClassService, { strict: false })
    .list(owner, { status: 'active' });
  return new Map(
    rows.map((row) => [
      row.displayName,
      { id: row.id, levelId: row.level.id, campusId: row.campus.id },
    ])
  );
}

function draftsFor(
  student: SeedStudent,
  known: ReadonlyMap<string, string>
): GuardianDraft[] {
  return student.guardians.map((link): GuardianDraft => {
    const existing = known.get(link.guardian);
    if (existing !== undefined) {
      return {
        existingGuardianId: existing,
        relationship: link.relationship,
        paysFees: link.paysFees,
      };
    }
    const guardian = found(
      SEED_GUARDIANS.find((candidate) => candidate.key === link.guardian),
      `guardian ${link.guardian}`
    );
    return {
      new: {
        fullName: guardian.fullName,
        phone: guardian.phone,
        address: guardian.address,
        relationship: link.relationship,
        paysFees: link.paysFees,
        login:
          guardian.login.kind === 'email'
            ? { kind: 'email', email: guardian.login.email }
            : { kind: 'username' },
      },
    };
  });
}

async function admitAll(
  app: INestApplicationContext,
  options: { owner: OrgContext; arms: Map<string, Arm> }
): Promise<Admitted[]> {
  const admissions = app.get(AdmissionService, { strict: false });
  const known = new Map<string, string>();
  const admitted: Admitted[] = [];
  for (const student of students) {
    const arm = found(
      options.arms.get(student.className),
      `class ${student.className}`
    );
    const result = await admissions.admit(options.owner, {
      firstName: student.firstName,
      lastName: student.lastName,
      gender: student.gender,
      dateOfBirth: student.dateOfBirth,
      classArmId: arm.id,
      guardians: draftsFor(student, known),
    });
    for (const link of result.student.guardians ?? []) {
      const guardian = SEED_GUARDIANS.find(
        (candidate) => candidate.fullName === link.fullName
      );
      if (guardian !== undefined) {
        known.set(guardian.key, link.guardianId);
      }
    }
    admitted.push({ student, studentId: result.student.id });
  }
  return admitted;
}

/** The prototype's admission numbers, usernames and dates replace the allocated ones. */
async function applyPrototypeFacts(
  db: Database,
  options: { admitted: Admitted[]; offsetDays: number }
): Promise<void> {
  for (const { student, studentId } of options.admitted) {
    const row = await db
      .updateTable('student')
      .set({
        admission_number: `${GREENFIELD_PREFIX}-${student.number}`,
        admitted_on: shiftDate(student.admittedOn, options.offsetDays),
      })
      .where('id', '=', studentId)
      .returning('user_id')
      .executeTakeFirstOrThrow();
    const username = `${GREENFIELD_SLUG}-${student.number}`;
    await db
      .updateTable('user')
      .set({ username, displayUsername: username })
      .where('id', '=', row.user_id ?? '')
      .execute();
    await db
      .updateTable('student_enrollment')
      .set({ is_new_student: student.isNewIntake })
      .where('student_id', '=', studentId)
      .execute();
  }
  for (const guardian of SEED_GUARDIANS) {
    if (guardian.login.kind === 'username') {
      await db
        .updateTable('user')
        .set({
          username: guardian.login.username,
          displayUsername: guardian.login.username,
        })
        .where(
          'id',
          '=',
          db
            .selectFrom('guardian')
            .select('user_id')
            .where('full_name', '=', guardian.fullName)
        )
        .execute();
    }
  }
}

async function addHistory(
  db: Database,
  options: {
    owner: OrgContext;
    arms: Map<string, Arm>;
    admitted: Admitted[];
  }
): Promise<void> {
  const { owner, arms, admitted } = options;
  const sessions = await db
    .selectFrom('academic_session')
    .select('id')
    .where('organization_id', '=', owner.organizationId)
    .orderBy('starts_on')
    .execute();
  const previous = found(sessions[0], 'previous school year').id;
  const previousTerms = await db
    .selectFrom('term')
    .select('id')
    .where('session_id', '=', previous)
    .orderBy('sequence')
    .execute();
  const secondTerm = await db
    .selectFrom('term')
    .select('id')
    .where('session_id', '=', found(sessions[1], 'current school year').id)
    .where('sequence', '=', 2)
    .executeTakeFirstOrThrow();
  const jss1Gold = found(arms.get('JSS 1 Gold'), 'class JSS 1 Gold');
  for (const { student, studentId } of admitted) {
    if (student.completedJss1Gold) {
      const enrolment = await db
        .insertInto('student_enrollment')
        .values({
          organization_id: owner.organizationId,
          student_id: studentId,
          session_id: previous,
          class_level_id: jss1Gold.levelId,
          status: 'completed',
          is_new_student: false,
          created_by: owner.user.id,
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      await db
        .insertInto('enrollment_placement')
        .values(
          previousTerms.map((term) => ({
            organization_id: owner.organizationId,
            enrollment_id: enrolment.id,
            term_id: term.id,
            class_arm_id: jss1Gold.id,
            campus_id: jss1Gold.campusId,
            created_by: owner.user.id,
          }))
        )
        .execute();
    }
    if (student.placedForSecondTerm) {
      const arm = found(arms.get(student.className), student.className);
      const current = await db
        .selectFrom('student_enrollment')
        .select('id')
        .where('student_id', '=', studentId)
        .where('session_id', '=', found(sessions[1], 'current school year').id)
        .executeTakeFirstOrThrow();
      await db
        .insertInto('enrollment_placement')
        .values({
          organization_id: owner.organizationId,
          enrollment_id: current.id,
          term_id: secondTerm.id,
          class_arm_id: arm.id,
          campus_id: arm.campusId,
          created_by: owner.user.id,
        })
        .execute();
    }
  }
}

async function openPortalLogins(
  app: INestApplicationContext,
  db: Database,
  organizationId: string
): Promise<void> {
  const hash = await app
    .get(AccountService, { strict: false })
    .hashPassword(SEED_PASSWORD);
  await db
    .updateTable('account')
    .set({ password: hash })
    .where(
      'userId',
      'in',
      db
        .selectFrom('member')
        .select('userId')
        .where('organizationId', '=', organizationId)
        .where('role', 'in', ['student', 'guardian'])
    )
    .execute();
}

/** Most seeded students have no guardian, so the school's guardian-required rule is lifted while the roll is admitted. */
export async function seedStudents(
  app: INestApplicationContext,
  options: { owner: OrgContext; today: string; offsetDays: number }
): Promise<void> {
  const { owner, today, offsetDays } = options;
  const db = app.get<Database>(KYSELY_TOKEN, { strict: false });
  const clock = app.get(Clock, { strict: false });
  const arms = await loadArms(app, owner);
  const setRequired = (requireGuardian: boolean) =>
    db
      .updateTable('school_setting')
      .set({ require_guardian: requireGuardian })
      .where('organization_id', '=', owner.organizationId)
      .execute();

  clock.set(today);
  await setRequired(false);
  try {
    const admitted = await admitAll(app, { owner, arms });
    await applyPrototypeFacts(db, { admitted, offsetDays });
    await addHistory(db, { owner, arms, admitted });
    await openPortalLogins(app, db, owner.organizationId);
    await db
      .updateTable('document_sequence')
      .set({
        next_value: Math.max(...students.map((row) => Number(row.number))) + 1,
      })
      .where('organization_id', '=', owner.organizationId)
      .where('kind', '=', 'admission')
      .execute();
  } finally {
    await setRequired(true);
    clock.set(null);
  }
}
