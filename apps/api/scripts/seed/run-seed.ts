import type { INestApplicationContext } from '@nestjs/common';
import { AuthService } from '@thallesp/nestjs-better-auth';
import {
  AccountService,
  bootstrapSuperAdmin,
  parseBootstrapEnv,
  type AppAuth,
  type AuthenticatedUser,
  type OrgContext,
} from '../../src/app/common/auth';
import { castToBetterAuthRoles } from '../../src/app/common/auth/better-auth-roles';
import { ENV_TOKEN, type Env } from '../../src/app/common/config/env';
import { AuditRepository } from '../../src/app/common/audit';
import { KYSELY_TOKEN, type Database } from '../../src/app/common/db/tokens';
import { CampusService } from '../../src/app/modules/campus/campus.service';
import { PlatformService } from '../../src/app/modules/platform/platform.service';
import { StudentService } from '../../src/app/modules/student/student.service';
import { orgContextFor } from './actors';
import { PROTOTYPE_TODAY, seedOffsetDays, shiftDate } from './date-shift';
import {
  emailOf,
  memberships,
  personas,
  SEED_PASSWORD,
  SUPER_ADMIN_EMAIL,
  FORCED_CHANGE_PERSONA,
} from './members';
import { seededActingRequests } from './acting-requests';
import {
  GREENFIELD_SLUG,
  HILLTOP_SLUG,
  SUSPENDED_SLUG,
  schools,
} from './schools';
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

const lookupPersona = (key: string) => {
  const persona = personas.find((candidate) => candidate.key === key);
  if (persona === undefined) {
    throw new Error(`Unknown persona ${key}`);
  }
  return persona;
};

const lookup = (map: Map<string, string>, key: string, what: string) => {
  const value = map.get(key);
  if (value === undefined) {
    throw new Error(`Unknown ${what} ${key}`);
  }
  return value;
};

async function createSchools(
  app: INestApplicationContext,
  actor: AuthenticatedUser
) {
  const campusService = app.get(CampusService, { strict: false });
  const accounts = app.get(AccountService, { strict: false });
  const platform = app.get(PlatformService, { strict: false });

  const userIds = new Map<string, string>();
  for (const { key, name, email } of personas) {
    const { user } = await accounts.createAccount({
      name,
      email,
      password: SEED_PASSWORD,
      mustChangePassword: key === FORCED_CHANGE_PERSONA,
    });
    userIds.set(key, user.id);
  }

  const organizationIds = new Map<string, string>();
  const campusIds = new Map<string, string>();
  const owners = new Map<string, OrgContext>();
  for (const school of schools) {
    const ownerPersona = lookupPersona(school.owner);
    const created = await platform.createSchool(actor, {
      name: school.name,
      slug: school.slug,
      admissionPrefix: school.admissionPrefix,
      city: school.city,
      ownerName: ownerPersona.name,
      ownerEmail: ownerPersona.email,
    });
    organizationIds.set(school.slug, created.school.id);

    const owner = await orgContextFor(app, ownerPersona.email);
    owners.set(school.slug, owner);
    for (const campus of school.campuses) {
      const campusRow = await campusService.create(owner, campus);
      campusIds.set(`${school.slug}/${campus.name}`, campusRow.id);
    }
  }
  return { userIds, organizationIds, campusIds, owners };
}

type Created = Awaited<ReturnType<typeof createSchools>>;

async function addMembers(
  app: INestApplicationContext,
  { userIds, organizationIds, campusIds, owners }: Created
) {
  const { api } = app.get(AuthService<AppAuth>, { strict: false });
  for (const { persona, school, roles, campuses, title } of memberships) {
    const userId = lookup(userIds, persona, 'persona');
    await api.addMember({
      body: {
        userId,
        organizationId: lookup(organizationIds, school, 'school'),
        role: castToBetterAuthRoles(roles),
        title,
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

async function ensureSuperAdmin(
  app: INestApplicationContext,
  log: (line: string) => void
): Promise<AuthenticatedUser> {
  const auth = app.get(AuthService<AppAuth>, { strict: false }).instance;
  const credentials = parseBootstrapEnv({
    ...process.env,
    BOOTSTRAP_ADMIN_EMAIL:
      process.env['BOOTSTRAP_ADMIN_EMAIL'] ?? SUPER_ADMIN_EMAIL,
    BOOTSTRAP_ADMIN_PASSWORD:
      process.env['BOOTSTRAP_ADMIN_PASSWORD'] ?? SEED_PASSWORD,
  });
  const outcome = await bootstrapSuperAdmin(auth, credentials);
  if (outcome === 'created') {
    log(`Created the super admin ${credentials.email}.`);
  }
  const db = app.get<Database>(KYSELY_TOKEN, { strict: false });
  return db
    .selectFrom('user')
    .select(['id', 'email', 'name'])
    .where('email', '=', credentials.email.toLowerCase())
    .executeTakeFirstOrThrow();
}

/** Better Auth stamps `now`, so the seed backdates when each school joined. */
async function backdateSchools(
  db: Database,
  organizationIds: Map<string, string>,
  offsetDays: number
) {
  for (const school of schools) {
    await db
      .updateTable('organization')
      .set({
        createdAt: `${shiftDate(school.createdOn, offsetDays)}T09:00:00Z`,
      })
      .where('id', '=', lookup(organizationIds, school.slug, 'school'))
      .execute();
  }
}

async function addSupportActivity(
  app: INestApplicationContext,
  actor: AuthenticatedUser,
  organizationIds: Map<string, string>
) {
  const audit = app.get(AuditRepository, { strict: false });
  for (const request of seededActingRequests) {
    await audit.recordActing({
      actorUserId: actor.id,
      organizationId: lookup(organizationIds, HILLTOP_SLUG, 'school'),
      ...request,
    });
  }
  await app
    .get(PlatformService, { strict: false })
    .suspend(actor, lookup(organizationIds, SUSPENDED_SLUG, 'school'));
}

export async function runSeed(
  app: INestApplicationContext,
  { log = console.log, now }: SeedOptions = {}
): Promise<SeedResult> {
  const superAdmin = await ensureSuperAdmin(app, log);
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

  const offsetDays = seedOffsetDays(now, SEED_TODAY);
  const created = await createSchools(app, superAdmin);
  await backdateSchools(db, created.organizationIds, offsetDays);
  await addMembers(app, created);
  await createStudents(app, created.campusIds);
  await addSupportActivity(app, superAdmin, created.organizationIds);

  const failures = await runSeedCheck(app, offsetDays);
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
  log(`  ${superAdmin.email}  Super admin (staff app, no school)`);
  for (const { name, email } of personas) {
    log(`  ${email}  ${name}`);
  }
  return { seeded: true, failures: [] };
}
