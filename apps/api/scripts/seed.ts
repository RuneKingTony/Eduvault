// Deterministic dev data, created through Better Auth so hashing, memberships
// and teams follow the real code paths. Safe to re-run: it skips when seeded.
import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import { createAuth } from '../src/app/common/auth/better-auth';
import { loadEnv } from '../src/app/common/config/env';
import type { DB } from '../src/db/db-types';

export const SEED_PASSWORD = 'password123';

const env = loadEnv();
const pool = new Pool({ connectionString: env.DATABASE_URL });
const db = new Kysely<DB>({ dialect: new PostgresDialect({ pool }) });
const auth = createAuth(pool, env);

const users = {
  greenfieldOwner: ['Grace Owner', 'owner@greenfield.test'],
  greenfieldTeacher: ['Tunde Teacher', 'teacher@greenfield.test'],
  riversideOwner: ['Rita Owner', 'owner@riverside.test'],
  multi: ['Mo Multi', 'multi@eduvault.test'],
} as const;

async function signUp([name, email]: readonly [string, string]) {
  const { user } = await auth.api.signUpEmail({
    body: { name, email, password: SEED_PASSWORD },
  });
  return user.id;
}

async function headersFor(email: string) {
  const { headers } = await auth.api.signInEmail({
    body: { email, password: SEED_PASSWORD },
    returnHeaders: true,
  });
  const cookie = headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');
  return new Headers({ cookie });
}

async function main() {
  const existing = await db
    .selectFrom('user')
    .select('id')
    .where('email', '=', users.greenfieldOwner[1])
    .executeTakeFirst();
  if (existing) {
    console.log('Already seeded; nothing to do.');
    return;
  }

  const ids = {
    greenfieldOwner: await signUp(users.greenfieldOwner),
    greenfieldTeacher: await signUp(users.greenfieldTeacher),
    riversideOwner: await signUp(users.riversideOwner),
    multi: await signUp(users.multi),
  };

  const greenfield = await auth.api.createOrganization({
    body: {
      name: 'Greenfield Academy',
      slug: 'greenfield-academy',
      userId: ids.greenfieldOwner,
    },
  });
  const riverside = await auth.api.createOrganization({
    body: {
      name: 'Riverside School',
      slug: 'riverside-school',
      userId: ids.riversideOwner,
    },
  });

  const greenfieldHeaders = await headersFor(users.greenfieldOwner[1]);
  const riversideHeaders = await headersFor(users.riversideOwner[1]);

  const createCampus = async (
    organizationId: string,
    name: string,
    address: string,
    headers: Headers
  ) => {
    const team = await auth.api.createTeam({
      body: { name, organizationId },
      headers,
    });
    await db
      .insertInto('campus')
      .values({ team_id: team.id, organization_id: organizationId, address })
      .execute();
    return team.id;
  };

  const main = await createCampus(
    greenfield.id,
    'Main Campus',
    '1 Green Road',
    greenfieldHeaders
  );
  const annex = await createCampus(
    greenfield.id,
    'Annex',
    '9 Hill Street',
    greenfieldHeaders
  );
  const riversideMain = await createCampus(
    riverside.id,
    'Riverside Main',
    '5 River Lane',
    riversideHeaders
  );

  await auth.api.addMember({
    body: {
      userId: ids.greenfieldTeacher,
      organizationId: greenfield.id,
      role: 'teacher',
    },
  });
  await auth.api.addTeamMember({
    body: { teamId: main, userId: ids.greenfieldTeacher },
    headers: greenfieldHeaders,
  });

  // The multi-school user is a teacher in Greenfield and an admin in Riverside.
  await auth.api.addMember({
    body: { userId: ids.multi, organizationId: greenfield.id, role: 'teacher' },
  });
  await auth.api.addTeamMember({
    body: { teamId: main, userId: ids.multi },
    headers: greenfieldHeaders,
  });
  await auth.api.addMember({
    body: { userId: ids.multi, organizationId: riverside.id, role: 'admin' },
  });

  await db
    .insertInto('school_account')
    .values([
      {
        organization_id: greenfield.id,
        name: 'Greenfield fees',
        currency: 'NGN',
      },
      {
        organization_id: riverside.id,
        name: 'Riverside fees',
        currency: 'NGN',
      },
    ])
    .execute();
  await db
    .insertInto('fee_schedule')
    .values([
      {
        organization_id: greenfield.id,
        campus_id: null,
        name: 'Tuition',
        amount_minor: '15000000',
        currency: 'NGN',
      },
      {
        organization_id: greenfield.id,
        campus_id: annex,
        name: 'Annex transport',
        amount_minor: '2500000',
        currency: 'NGN',
      },
      {
        organization_id: riverside.id,
        campus_id: null,
        name: 'Tuition',
        amount_minor: '12000000',
        currency: 'NGN',
      },
    ])
    .execute();
  await db
    .insertInto('student')
    .values([
      {
        organization_id: greenfield.id,
        campus_id: main,
        full_name: 'Ada Obi',
        admission_number: 'GF-001',
      },
      {
        organization_id: greenfield.id,
        campus_id: main,
        full_name: 'Bayo Ade',
        admission_number: 'GF-002',
      },
      {
        organization_id: greenfield.id,
        campus_id: annex,
        full_name: 'Chidi Eze',
        admission_number: 'GF-003',
      },
      {
        organization_id: riverside.id,
        campus_id: riversideMain,
        full_name: 'Dayo Lawal',
        admission_number: 'RS-001',
      },
    ])
    .execute();

  console.log('Seeded 2 schools (Greenfield: 2 campuses, Riverside: 1).');
  console.log(`Sign in with any of these (password: ${SEED_PASSWORD}):`);
  for (const [, email] of Object.values(users)) console.log(`  ${email}`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.destroy();
  });
