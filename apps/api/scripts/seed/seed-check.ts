import type { INestApplicationContext } from '@nestjs/common';
import { KYSELY_TOKEN, type Database } from '../../src/app/common/db/tokens';
import { CalendarService } from '../../src/app/modules/calendar/calendar.service';
import { CampusService } from '../../src/app/modules/campus/campus.service';
import { ClassService } from '../../src/app/modules/class/class.service';
import { StudentService } from '../../src/app/modules/student/student.service';
import { orgContextFor } from './actors';
import { SEEDED_ACTING_REASON } from './acting-requests';
import { CURRENT_CLASS_TEACHERS, SEED_CLASSES } from './classes';
import { shiftDate } from './date-shift';
import { emailOf, SUPER_ADMIN_EMAIL } from './members';
import {
  GREENFIELD_SLUG,
  HILLTOP_SLUG,
  SUSPENDED_SLUG,
  schools,
} from './schools';
import {
  SEED_ENROLMENTS,
  SEED_GUARDIANS,
  SEED_PLACEMENTS,
  students,
} from './students';

// Emeka is class-scoped to JSS 3 Gold, where Bola Johnson sits.
export const visibleStudents: Record<string, number> = {
  funmi: 28,
  tunde: 28,
  grace: 28,
  chika: 23,
  yemi: 5,
  emeka: 1,
  kola: 0,
};

type Check = (
  label: string,
  actual: number | string,
  expected: number | string
) => void;

async function checkSuperAdmin(db: Database, check: Check) {
  const expected = (
    process.env['BOOTSTRAP_ADMIN_EMAIL'] ?? SUPER_ADMIN_EMAIL
  ).toLowerCase();
  const superAdmin = await db
    .selectFrom('user')
    .select('email')
    .where('role', '=', 'superadmin')
    .where('email', '=', expected)
    .executeTakeFirst();
  check('super admin', superAdmin?.email ?? 'missing', expected);
}

function checkSchoolState(
  check: Check,
  {
    school,
    offsetDays,
    account,
  }: {
    school: (typeof schools)[number];
    offsetDays: number;
    account: { createdAt: Date | string; suspended_at: unknown } | undefined;
  }
) {
  check(
    `${school.slug} created on`,
    account
      ? new Date(account.createdAt).toISOString().slice(0, 10)
      : 'missing',
    shiftDate(school.createdOn, offsetDays)
  );
  check(
    `${school.slug} suspended`,
    account?.suspended_at === null ? 'no' : 'yes',
    school.slug === SUSPENDED_SLUG ? 'yes' : 'no'
  );
}

async function checkSchool(
  db: Database,
  check: Check,
  {
    school,
    offsetDays,
  }: { school: (typeof schools)[number]; offsetDays: number }
) {
  const account = await db
    .selectFrom('school_account')
    .innerJoin(
      'organization',
      'organization.id',
      'school_account.organization_id'
    )
    .select([
      'school_account.admission_prefix',
      'school_account.suspended_at',
      'organization.id',
      'organization.createdAt',
    ])
    .where('organization.slug', '=', school.slug)
    .executeTakeFirst();
  check(
    `${school.slug} admission prefix`,
    account?.admission_prefix ?? 'missing',
    school.admissionPrefix
  );
  checkSchoolState(check, { school, offsetDays, account });
  const levels = await db
    .selectFrom('class_level')
    .select(['code', 'next_level_id'])
    .where('organization_id', '=', account?.id ?? '')
    .orderBy('sequence')
    .execute();
  check(`${school.slug} levels`, levels.length, 12);
  check(
    `${school.slug} final level`,
    levels.filter((level) => level.next_level_id === null).length === 1
      ? (levels.at(-1)?.code ?? 'none')
      : 'several',
    'SS3'
  );
}

async function checkSupportActivity(db: Database, check: Check) {
  const rows = await db
    .selectFrom('audit_log')
    .innerJoin('organization', 'organization.id', 'audit_log.organization_id')
    .select(['audit_log.method', 'audit_log.reason'])
    .where('audit_log.kind', '=', 'acting')
    .where('organization.slug', '=', HILLTOP_SLUG)
    .execute();
  check('Hilltop acting requests', rows.length, 3);
  check(
    'Hilltop acting writes',
    rows
      .filter((row) => row.method !== 'GET')
      .map((row) => row.reason ?? '')
      .join(','),
    SEEDED_ACTING_REASON
  );
}

async function checkCalendar(
  app: INestApplicationContext,
  db: Database,
  check: Check
) {
  const count = async (
    table: 'academic_session' | 'term' | 'school_holiday'
  ) => {
    const row = await db
      .selectFrom(table)
      .innerJoin('organization', 'organization.id', `${table}.organization_id`)
      .where('organization.slug', '=', GREENFIELD_SLUG)
      .select((eb) => eb.fn.countAll<string>().as('total'))
      .executeTakeFirstOrThrow();
    return Number(row.total);
  };
  check('Greenfield school years', await count('academic_session'), 2);
  check('Greenfield terms', await count('term'), 6);
  check('Greenfield holidays', await count('school_holiday'), 11);
  const current = await db
    .selectFrom('term')
    .select((eb) => eb.fn.countAll<string>().as('total'))
    .where('is_current', '=', true)
    .executeTakeFirstOrThrow();
  check('current terms', Number(current.total), 1);

  const funmi = await orgContextFor(app, emailOf('funmi'));
  const now = await app.get(CalendarService, { strict: false }).current(funmi);
  check('Greenfield current term', now.term?.name ?? 'none', 'First term');
  check('Greenfield school days', now.schoolDays, 67);
}

async function checkClasses(
  app: INestApplicationContext,
  db: Database,
  check: Check
) {
  const funmi = await orgContextFor(app, emailOf('funmi'));
  const classes = app.get(ClassService, { strict: false });
  const everyClass = await classes.list(funmi, { status: 'all' });
  check('Greenfield classes', everyClass.length, SEED_CLASSES.length);
  check(
    'Greenfield archived classes',
    everyClass.filter((row) => row.retiredAt !== null).length,
    1
  );
  const teachers = await db
    .selectFrom('class_arm_teacher')
    .innerJoin('term', (join) =>
      join
        .onRef('term.session_id', '=', 'class_arm_teacher.session_id')
        .on('term.is_current', '=', true)
    )
    .select((eb) => eb.fn.countAll<string>().as('total'))
    .where('class_arm_teacher.organization_id', '=', funmi.organizationId)
    .executeTakeFirstOrThrow();
  check(
    'Greenfield current class teachers',
    Number(teachers.total),
    CURRENT_CLASS_TEACHERS.length
  );

  const emeka = await orgContextFor(app, emailOf('emeka'));
  const jss3Gold = everyClass.find((row) => row.displayName === 'JSS 3 Gold');
  check(
    'Emeka class scope',
    emeka.classScope === 'all' ? 'all' : emeka.classScope.join(','),
    jss3Gold?.id ?? 'missing'
  );
}

const byName = (a: string, b: string) => a.localeCompare(b);

async function checkRoll(
  app: INestApplicationContext,
  db: Database,
  check: Check
) {
  const funmi = await orgContextFor(app, emailOf('funmi'));
  const organizationId = funmi.organizationId;
  const count = async (
    table:
      | 'student_enrollment'
      | 'enrollment_placement'
      | 'guardian'
      | 'guardian_student'
  ) => {
    const row = await db
      .selectFrom(table)
      .where('organization_id', '=', organizationId)
      .select((eb) => eb.fn.countAll<string>().as('total'))
      .executeTakeFirstOrThrow();
    return Number(row.total);
  };
  check(
    'Greenfield enrolments',
    await count('student_enrollment'),
    SEED_ENROLMENTS
  );
  check(
    'Greenfield placements',
    await count('enrollment_placement'),
    SEED_PLACEMENTS
  );
  check('Greenfield guardians', await count('guardian'), SEED_GUARDIANS.length);
  check(
    'Greenfield guardian links',
    await count('guardian_student'),
    students.reduce((total, row) => total + row.guardians.length, 0)
  );

  const listed = await app
    .get(StudentService, { strict: false })
    .list(funmi, { tab: 'new', page: 1, pageSize: 100 });
  check(
    'Greenfield new intakes',
    listed.items
      .map((row) => row.firstName)
      .toSorted(byName)
      .join(','),
    students
      .filter((row) => row.isNewIntake)
      .map((row) => row.firstName)
      .toSorted(byName)
      .join(',')
  );
}

async function checkLogins(organizationId: string, db: Database, check: Check) {
  const ada = await db
    .selectFrom('student')
    .innerJoin('user', 'user.id', 'student.user_id')
    .select(['student.admission_number', 'user.username'])
    .where('student.organization_id', '=', organizationId)
    .where('student.first_name', '=', 'Ada')
    .executeTakeFirst();
  check('Ada admission number', ada?.admission_number ?? 'missing', 'GF-0123');
  check('Ada username', ada?.username ?? 'missing', 'greenfield-0123');

  await checkGuardianLogins(organizationId, db, check);
}

async function checkGuardianLogins(
  organizationId: string,
  db: Database,
  check: Check
) {
  for (const guardian of SEED_GUARDIANS) {
    const row = await db
      .selectFrom('guardian')
      .innerJoin('user', 'user.id', 'guardian.user_id')
      .select(['user.username', 'user.email'])
      .where('guardian.organization_id', '=', organizationId)
      .where('guardian.full_name', '=', guardian.fullName)
      .executeTakeFirst();
    check(
      `${guardian.fullName} login`,
      (guardian.login.kind === 'email' ? row?.email : row?.username) ??
        'missing',
      guardian.login.kind === 'email'
        ? guardian.login.email
        : guardian.login.username
    );
  }
}

async function checkStudents(
  app: INestApplicationContext,
  db: Database,
  check: Check
) {
  await checkRoll(app, db, check);
  const funmi = await orgContextFor(app, emailOf('funmi'));
  await checkLogins(funmi.organizationId, db, check);
}

async function checkPlatform(db: Database, check: Check, offsetDays: number) {
  await checkSuperAdmin(db, check);
  for (const school of schools) {
    await checkSchool(db, check, { school, offsetDays });
  }
  await checkSupportActivity(db, check);
}

export async function runSeedCheck(
  app: INestApplicationContext,
  offsetDays: number
): Promise<string[]> {
  const failures: string[] = [];
  const check: Check = (label, actual, expected) => {
    if (actual !== expected) {
      failures.push(`${label}: expected ${expected}, got ${actual}`);
    }
  };

  const db = app.get<Database>(KYSELY_TOKEN, { strict: false });
  await checkPlatform(db, check, offsetDays);
  const organizations = await db
    .selectFrom('organization')
    .select('slug')
    .execute();
  check('schools', organizations.length, schools.length);

  const campusService = app.get(CampusService, { strict: false });
  const studentService = app.get(StudentService, { strict: false });

  const funmi = await orgContextFor(app, emailOf('funmi'));
  const campuses = await campusService.list(funmi);
  check('Greenfield campuses', campuses.length, 2);
  for (const campus of campuses) {
    const expected = students.filter((s) => s.campus === campus.name).length;
    const listed = await studentService.list(funmi, {
      tab: 'active',
      page: 1,
      pageSize: 100,
      campusId: campus.id,
    });
    check(`${campus.name} students`, listed.total, expected);
  }

  await checkCalendar(app, db, check);
  await checkClasses(app, db, check);
  await checkStudents(app, db, check);

  for (const [key, expected] of Object.entries(visibleStudents)) {
    const ctx = await orgContextFor(app, emailOf(key));
    const listed = await studentService.list(ctx, {
      tab: 'active',
      page: 1,
      pageSize: 100,
    });
    check(`${key} sees students`, listed.total, expected);
  }
  return failures;
}
