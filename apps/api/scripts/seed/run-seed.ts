import type { INestApplicationContext } from '@nestjs/common';
import { AuthService } from '@thallesp/nestjs-better-auth';
import type { AppAuth, OrgContext } from '../../src/app/common/auth';
import { castToBetterAuthRoles } from '../../src/app/common/auth/better-auth-roles';
import { ENV_TOKEN, type Env } from '../../src/app/common/config/env';
import { KYSELY_TOKEN, type Database } from '../../src/app/common/db/tokens';
import { CampusService } from '../../src/app/modules/campus/campus.service';
import { SchoolAccountService } from '../../src/app/modules/school-account/school-account.service';
import { StudentService } from '../../src/app/modules/student/student.service';
import { orgContextFor } from './actors';
import { PROTOTYPE_TODAY, seedOffsetDays, shiftDate } from './date-shift';
import { emailOf, memberships, personas, SEED_PASSWORD } from './members';
import { GREENFIELD_SLUG, schools } from './schools';
import { runSeedCheck } from './seed-check';
import { students } from './students';

interface SeedOptions {
  log?: (line: string) => void;
  now?: Date;
}

interface SeedResult {
  seeded: boolean;
  failures: string[];
}

const lookup = (map: Map<string, string>, key: string, what: string) => {
  const value = map.get(key);
  if (value === undefined) {
    throw new Error(`Unknown ${what} ${key}`);
  }
  return value;
};

async function createSchools(app: INestApplicationContext) {
  const { api } = app.get(AuthService<AppAuth>, { strict: false });
  const campusService = app.get(CampusService, { strict: false });
  const accounts = app.get(SchoolAccountService, { strict: false });

  const userIds = new Map<string, string>();
  for (const { key, name, email } of personas) {
    const { user } = await api.signUpEmail({
      body: { name, email, password: SEED_PASSWORD },
    });
    userIds.set(key, user.id);
  }

  const organizationIds = new Map<string, string>();
  const campusIds = new Map<string, string>();
  const owners = new Map<string, OrgContext>();
  for (const school of schools) {
    const organization = await api.createOrganization({
      body: {
        name: school.name,
        slug: school.slug,
        userId: lookup(userIds, school.owner, 'persona'),
      },
    });
    organizationIds.set(school.slug, organization.id);

    const owner = await orgContextFor(app, emailOf(school.owner));
    owners.set(school.slug, owner);
    for (const campus of school.campuses) {
      const created = await campusService.create(owner, campus);
      campusIds.set(`${school.slug}/${campus.name}`, created.id);
    }
    await accounts.create(owner, {
      name: school.name,
      currency: school.currency,
    });
  }
  return { userIds, organizationIds, campusIds, owners };
}

type Created = Awaited<ReturnType<typeof createSchools>>;

async function addMembers(
  app: INestApplicationContext,
  { userIds, organizationIds, campusIds, owners }: Created
) {
  const { api } = app.get(AuthService<AppAuth>, { strict: false });
  for (const { persona, school, roles, campuses } of memberships) {
    const userId = lookup(userIds, persona, 'persona');
    await api.addMember({
      body: {
        userId,
        organizationId: lookup(organizationIds, school, 'school'),
        role: castToBetterAuthRoles(roles),
      },
    });
    const owner = owners.get(school);
    for (const campus of campuses) {
      await api.addTeamMember({
        body: {
          teamId: lookup(campusIds, `${school}/${campus}`, 'campus'),
          userId,
        },
        headers: owner?.headers,
      });
    }
  }
}

async function createStudents(
  app: INestApplicationContext,
  campusIds: Map<string, string>
) {
  const studentService = app.get(StudentService, { strict: false });
  const tunde = await orgContextFor(app, emailOf('tunde'));
  for (const student of students) {
    await studentService.create(tunde, {
      campusId: lookup(
        campusIds,
        `${GREENFIELD_SLUG}/${student.campus}`,
        'campus'
      ),
      fullName: student.fullName,
      admissionNumber: student.admissionNumber,
    });
  }
}

export async function runSeed(
  app: INestApplicationContext,
  { log = console.log, now }: SeedOptions = {}
): Promise<SeedResult> {
  const db = app.get<Database>(KYSELY_TOKEN, { strict: false });
  const marker = await db
    .selectFrom('organization')
    .select('id')
    .where('slug', '=', GREENFIELD_SLUG)
    .executeTakeFirst();
  if (marker) {
    log('Already seeded; nothing to do.');
    return { seeded: false, failures: [] };
  }

  const { SEED_TODAY } = app.get<Env>(ENV_TOKEN, { strict: false });
  const today = shiftDate(PROTOTYPE_TODAY, seedOffsetDays(now, SEED_TODAY));
  log(`Seeding Eduvault dev data; seed "today" is ${today}.`);

  const created = await createSchools(app);
  await addMembers(app, created);
  await createStudents(app, created.campusIds);

  const failures = await runSeedCheck(app);
  if (failures.length > 0) {
    log('Seed check failed:');
    for (const failure of failures) {
      log(`  ${failure}`);
    }
    return { seeded: true, failures };
  }

  log(
    `Seeded ${schools.length} schools, ${personas.length} users and ${students.length} students; seed check passed.`
  );
  log(`Sign in with any of these (password: ${SEED_PASSWORD}):`);
  for (const { name, email } of personas) {
    log(`  ${email}  ${name}`);
  }
  return { seeded: true, failures: [] };
}
