import type { INestApplicationContext } from '@nestjs/common';
import { KYSELY_TOKEN, type Database } from '../../src/app/common/db/tokens';
import { CampusService } from '../../src/app/modules/campus/campus.service';
import { StudentService } from '../../src/app/modules/student/student.service';
import { orgContextFor } from './actors';
import { emailOf, SUPER_ADMIN_EMAIL } from './members';
import { schools } from './schools';
import { students } from './students';

// Until class scope narrows teachers to their arms, Emeka sees all of Lekki.
export const visibleStudents: Record<string, number> = {
  funmi: 28,
  tunde: 28,
  grace: 28,
  chika: 23,
  yemi: 5,
  emeka: 23,
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

async function checkSchool(
  db: Database,
  check: Check,
  school: (typeof schools)[number]
) {
  const account = await db
    .selectFrom('school_account')
    .innerJoin(
      'organization',
      'organization.id',
      'school_account.organization_id'
    )
    .select(['school_account.admission_prefix', 'organization.id'])
    .where('organization.slug', '=', school.slug)
    .executeTakeFirst();
  check(
    `${school.slug} admission prefix`,
    account?.admission_prefix ?? 'missing',
    school.admissionPrefix
  );
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

async function checkPlatform(db: Database, check: Check) {
  await checkSuperAdmin(db, check);
  for (const school of schools) {
    await checkSchool(db, check, school);
  }
}

export async function runSeedCheck(
  app: INestApplicationContext
): Promise<string[]> {
  const failures: string[] = [];
  const check: Check = (label, actual, expected) => {
    if (actual !== expected) {
      failures.push(`${label}: expected ${expected}, got ${actual}`);
    }
  };

  const db = app.get<Database>(KYSELY_TOKEN, { strict: false });
  await checkPlatform(db, check);
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
    const listed = await studentService.list(funmi, campus.id);
    check(`${campus.name} students`, listed.length, expected);
  }

  for (const [key, expected] of Object.entries(visibleStudents)) {
    const ctx = await orgContextFor(app, emailOf(key));
    const listed = await studentService.list(ctx);
    check(`${key} sees students`, listed.length, expected);
  }
  return failures;
}
