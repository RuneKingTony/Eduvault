import { randomUUID } from 'node:crypto';
import {
  acting,
  baseTest,
  expect,
  PASSWORD,
  waitForAuditRows,
  type Fixtures,
  type TestOrganization,
  type TestUser,
} from './support/base-test';
import { createStudent } from './support/factories/students';

const test = baseTest;

const body = (overrides: Record<string, unknown> = {}) => {
  const suffix = randomUUID().slice(0, 6);
  return {
    name: `Greenfield ${suffix}`,
    slug: `greenfield-${suffix}`,
    admissionPrefix: 'GF',
    city: 'Lagos',
    ownerName: 'Funmi Adeyemi',
    ownerEmail: `funmi-${suffix}@example.test`,
    ...overrides,
  };
};

const breakRoleInserts = async (pool: {
  query: (sql: string) => Promise<unknown>;
}) => {
  await pool.query(`
    CREATE FUNCTION fail_role_insert() RETURNS trigger AS $$
    BEGIN RAISE EXCEPTION 'role insert refused'; END
    $$ LANGUAGE plpgsql`);
  await pool.query(`
    CREATE TRIGGER fail_role_insert BEFORE INSERT ON "organizationRole"
    FOR EACH ROW EXECUTE FUNCTION fail_role_insert()`);
};
const repairRoleInserts = async (pool: {
  query: (sql: string) => Promise<unknown>;
}) => {
  await pool.query(
    `DROP TRIGGER IF EXISTS fail_role_insert ON "organizationRole"`
  );
  await pool.query(`DROP FUNCTION IF EXISTS fail_role_insert()`);
};

test.describe('platform schools', () => {
  test('answers 401 without a session, 403 for an owner and 200 for a super admin', async ({
    api,
    createUser,
    createOrganization,
    makeSuperAdmin,
  }) => {
    await api().get('/platform/schools').expect(401);

    const owner = await createUser();
    await createOrganization(owner);
    const refused = await api(owner).get('/platform/schools').expect(403);
    expect(refused.body).toMatchObject({
      code: 'Forbidden',
      message: 'Super admins only',
    });
    await api(owner).post('/platform/schools').send(body()).expect(403);

    const admin = await makeSuperAdmin(await createUser());
    const list = await api(admin).get('/platform/schools').expect(200);
    expect(list.body).toEqual({
      items: [],
      totals: { schools: 0, active: 0, students: 0, actingRequests: 0 },
      nextCursor: null,
    });
  });

  test('creates the school, its owner, six roles, the account and the ladder', async ({
    api,
    pool,
    createUser,
    makeSuperAdmin,
    createSchoolViaPlatform,
  }) => {
    const admin = await makeSuperAdmin(await createUser());
    const input = body();
    const result = await createSchoolViaPlatform(admin, input);

    expect(result.temporaryPassword).toMatch(/^[2-9A-NP-Za-km-z]{12}$/);
    expect(result.owner.email).toBe(input.ownerEmail);
    expect(result.school).toMatchObject({
      name: input.name,
      slug: input.slug,
      admissionPrefix: 'GF',
      city: 'Lagos',
      owners: [{ email: input.ownerEmail, name: 'Funmi Adeyemi' }],
    });

    const flag = await pool.query<{ mustChangePassword: boolean }>(
      `SELECT "mustChangePassword" FROM "user" WHERE id = $1`,
      [result.owner.id]
    );
    expect(flag.rows[0]?.mustChangePassword).toBe(true);

    const member = await pool.query<{ role: string }>(
      `SELECT role FROM member WHERE "organizationId" = $1 AND "userId" = $2`,
      [result.school.id, result.owner.id]
    );
    expect(member.rows).toEqual([{ role: 'owner' }]);

    const roles = await pool.query(
      `SELECT role FROM "organizationRole" WHERE "organizationId" = $1 AND source = 'starter'`,
      [result.school.id]
    );
    expect(roles.rows).toHaveLength(6);

    const account = await pool.query(
      `SELECT name, city, admission_prefix, currency FROM school_account WHERE organization_id = $1`,
      [result.school.id]
    );
    expect(account.rows).toEqual([
      {
        name: input.name,
        city: 'Lagos',
        admission_prefix: 'GF',
        currency: 'NGN',
      },
    ]);

    const levels = await pool.query<{ code: string; next: string | null }>(
      `SELECT l.code, n.code AS next FROM class_level l
       LEFT JOIN class_level n ON n.id = l.next_level_id
       WHERE l.organization_id = $1 ORDER BY l.sequence`,
      [result.school.id]
    );
    expect(levels.rows).toHaveLength(12);
    expect(levels.rows[0]).toEqual({ code: 'P1', next: 'P2' });
    expect(levels.rows.at(-1)).toEqual({ code: 'SS3', next: null });

    const session = await api()
      .post('/api/auth/sign-in/email')
      .send({
        email: input.ownerEmail,
        password: result.temporaryPassword,
      })
      .expect(200);
    expect(session.body.user.mustChangePassword).toBe(true);
  });

  test('a taken slug answers 409 and leaves nothing behind', async ({
    api,
    pool,
    createUser,
    makeSuperAdmin,
    createSchoolViaPlatform,
  }) => {
    const admin = await makeSuperAdmin(await createUser());
    const first = body();
    await createSchoolViaPlatform(admin, first);

    const second = body({ slug: first.slug });
    const res = await api(admin)
      .post('/platform/schools')
      .send(second)
      .expect(409);
    expect(res.body).toMatchObject({
      code: 'Conflict',
      message: 'That slug is taken.',
    });
    const users = await pool.query(`SELECT id FROM "user" WHERE email = $1`, [
      second.ownerEmail,
    ]);
    expect(users.rows).toHaveLength(0);
  });

  test('an existing user becomes owner and keeps their password', async ({
    api,
    createUser,
    makeSuperAdmin,
    createSchoolViaPlatform,
  }) => {
    const admin = await makeSuperAdmin(await createUser());
    const existing = await createUser({ email: 'kola@example.test' });

    const result = await createSchoolViaPlatform(
      admin,
      body({ ownerEmail: 'Kola@Example.test', ownerName: 'Someone Else' })
    );
    expect(result.temporaryPassword).toBeNull();
    expect(result.owner.id).toBe(existing.id);

    await api()
      .post('/api/auth/sign-in/email')
      .send({ email: existing.email, password: PASSWORD })
      .expect(200);
    const me = await api(existing).get('/me').expect(200);
    expect(me.body).toMatchObject({
      mustChangePassword: false,
      activeOrganizationId: result.school.id,
      schoolCount: 1,
    });
  });

  test('refuses a super admin as owner', async ({
    api,
    createUser,
    makeSuperAdmin,
  }) => {
    const admin = await makeSuperAdmin(await createUser());
    const other = await makeSuperAdmin(await createUser());
    await api(admin)
      .post('/platform/schools')
      .send(body({ ownerEmail: other.email }))
      .expect(409);
  });

  test('lists every school with its owners, sorted by name', async ({
    api,
    createUser,
    makeSuperAdmin,
    createSchoolViaPlatform,
  }) => {
    const admin = await makeSuperAdmin(await createUser());
    const zion = body({ name: 'Zion Academy', slug: 'zion-academy' });
    const alpha = body({ name: 'Alpha College', slug: 'alpha-college' });
    await createSchoolViaPlatform(admin, zion);
    await createSchoolViaPlatform(admin, alpha);

    const list = await api(admin).get('/platform/schools').expect(200);
    expect(
      list.body.items.map((school: { name: string }) => school.name)
    ).toEqual(['Alpha College', 'Zion Academy']);
    expect(list.body.items[0].owners).toEqual([
      expect.objectContaining({ email: alpha.ownerEmail }),
    ]);
  });

  test.describe('compensation', () => {
    test('a failure after the owner step removes the school and the new owner', async ({
      api,
      pool,
      createUser,
      makeSuperAdmin,
    }) => {
      const admin = await makeSuperAdmin(await createUser());
      const input = body();
      await breakRoleInserts(pool);
      try {
        const res = await api(admin)
          .post('/platform/schools')
          .send(input)
          .expect(500);
        expect(res.body).toEqual({
          code: 'InternalError',
          message: 'Could not create the school',
        });
      } finally {
        await repairRoleInserts(pool);
      }

      const schools = await pool.query(
        `SELECT id FROM organization WHERE slug = $1`,
        [input.slug]
      );
      const owners = await pool.query(
        `SELECT id FROM "user" WHERE email = $1`,
        [input.ownerEmail]
      );
      expect(schools.rows).toHaveLength(0);
      expect(owners.rows).toHaveLength(0);

      const rows = await waitForAuditRows(
        pool,
        { kind: 'platform', action: 'school.create' },
        1
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        actor_user_id: admin.id,
        organization_id: null,
        status: 500,
        method: null,
      });
    });

    test('an existing owner survives the cleanup', async ({
      api,
      pool,
      createUser,
      makeSuperAdmin,
    }) => {
      const admin = await makeSuperAdmin(await createUser());
      const existing = await createUser();
      const input = body({ ownerEmail: existing.email });
      await breakRoleInserts(pool);
      try {
        await api(admin).post('/platform/schools').send(input).expect(500);
      } finally {
        await repairRoleInserts(pool);
      }

      const schools = await pool.query(
        `SELECT id FROM organization WHERE slug = $1`,
        [input.slug]
      );
      const owners = await pool.query(`SELECT id FROM "user" WHERE id = $1`, [
        existing.id,
      ]);
      expect(schools.rows).toHaveLength(0);
      expect(owners.rows).toHaveLength(1);
      await api()
        .post('/api/auth/sign-in/email')
        .send({ email: existing.email, password: PASSWORD })
        .expect(200);
    });
  });

  test.describe('isolation', () => {
    test('case 6: no session answers 401 on both routes', async ({ api }) => {
      await api().get('/platform/schools').expect(401);
      await api().post('/platform/schools').send(body()).expect(401);
    });

    test('each school’s class levels chain only to its own rows', async ({
      pool,
      createUser,
      makeSuperAdmin,
      createSchoolViaPlatform,
    }) => {
      const admin = await makeSuperAdmin(await createUser());
      const first = await createSchoolViaPlatform(admin, {
        ownerEmail: `a-${randomUUID()}@example.test`,
      });
      const second = await createSchoolViaPlatform(admin, {
        ownerEmail: `b-${randomUUID()}@example.test`,
      });

      const { rows } = await pool.query<{ school: string; count: string }>(
        `SELECT l.organization_id AS school, count(*) AS count
         FROM class_level l
         JOIN class_level n ON n.id = l.next_level_id
         WHERE n.organization_id <> l.organization_id
         GROUP BY l.organization_id`
      );
      expect(rows).toEqual([]);

      const perSchool = await pool.query<{
        organization_id: string;
        count: string;
      }>(
        `SELECT organization_id, count(*) AS count FROM class_level
         GROUP BY organization_id`
      );
      expect(perSchool.rows.map((row) => Number(row.count))).toEqual([12, 12]);

      const foreign = await pool.query<{ id: string }>(
        `SELECT id FROM class_level WHERE organization_id = $1 AND code = 'P1'`,
        [second.school.id]
      );
      await expect(
        pool.query(
          `UPDATE class_level SET next_level_id = $1
           WHERE organization_id = $2 AND code = 'P1'`,
          [foreign.rows[0]?.id, first.school.id]
        )
      ).rejects.toMatchObject({ code: '23503' });
    });

    test('case 5: a school owner answers 403 on both routes', async ({
      api,
      createUser,
      createOrganization,
    }) => {
      const owner = await createUser();
      await createOrganization(owner);
      await api(owner).get('/platform/schools').expect(403);
      await api(owner).post('/platform/schools').send(body()).expect(403);
    });
  });
});

interface ConsoleKit {
  admin: TestUser;
  school: (
    overrides?: Record<string, unknown>
  ) => Promise<{ org: TestOrganization; id: string; ownerUser: TestUser }>;
  ownerCount: (organizationId: string) => Promise<number>;
}

const consoleTest = baseTest.extend<{ kit: ConsoleKit }>({
  kit: async (
    { pool, createUser, makeSuperAdmin, createSchoolViaPlatform },
    use
  ) => {
    const admin = await makeSuperAdmin(await createUser());
    await use({
      admin,
      school: async (overrides = {}) => {
        const ownerUser = await createUser();
        const input = body({ ownerEmail: ownerUser.email, ...overrides });
        const { school } = await createSchoolViaPlatform(admin, input);
        return {
          id: school.id,
          ownerUser,
          org: {
            id: school.id,
            name: input.name,
            slug: input.slug,
            owner: ownerUser,
          },
        };
      },
      ownerCount: async (organizationId) => {
        const { rows } = await pool.query<{ total: string }>(
          `SELECT count(*) AS total FROM member
           WHERE "organizationId" = $1 AND 'owner' = ANY(string_to_array(role, ','))`,
          [organizationId]
        );
        return Number(rows[0]?.total);
      },
    });
  },
});

const memberIdOf = async (
  api: Fixtures['api'],
  query: { admin: TestUser; schoolId: string; userId: string }
) => {
  const res = await api(query.admin)
    .get(`/platform/schools/${query.schoolId}/members`)
    .expect(200);
  const found = (res.body.items as { memberId: string; userId: string }[]).find(
    (member) => member.userId === query.userId
  );
  return found?.memberId ?? 'missing';
};

consoleTest.describe('platform console', () => {
  consoleTest(
    'lists totals, status, counts, A–Z order and searches by name or slug',
    async ({ api, app, pool, createCampus, kit }) => {
      const gamma = await kit.school({
        name: 'Gamma School',
        slug: 'gamma-sc',
      });
      const alpha = await kit.school({ name: 'alpha house', slug: 'alp-hse' });
      const beta = await kit.school({ name: 'Beta Hall', slug: 'beta-hall' });
      const campus = await createCampus(alpha.org, 'Main');
      await createCampus(alpha.org, 'Annex');
      await createStudent(app, alpha.ownerUser, { campusId: campus.id });
      await createStudent(app, alpha.ownerUser, { campusId: campus.id });
      await api(kit.admin)
        .post(`/platform/schools/${beta.id}/suspend`)
        .expect(200);
      await api(kit.admin).get('/students').set(acting(gamma.id)).expect(200);
      await waitForAuditRows(pool, { kind: 'acting' }, 1);

      const list = await api(kit.admin).get('/platform/schools').expect(200);
      expect(list.body.totals).toEqual({
        schools: 3,
        active: 2,
        students: 2,
        actingRequests: 1,
      });
      expect(list.body.nextCursor).toBeNull();
      expect(
        list.body.items.map(
          (school: {
            name: string;
            status: string;
            students: number;
            campuses: number;
          }) => [school.name, school.status, school.students, school.campuses]
        )
      ).toEqual([
        ['Beta Hall', 'suspended', 0, 0],
        ['Gamma School', 'active', 0, 0],
        ['alpha house', 'active', 2, 2],
      ]);

      const byName = await api(kit.admin)
        .get('/platform/schools')
        .query({ q: 'BETA' })
        .expect(200);
      expect(byName.body.items).toHaveLength(1);
      expect(byName.body.totals.schools).toBe(3);
      const bySlug = await api(kit.admin)
        .get('/platform/schools')
        .query({ q: 'alp-' })
        .expect(200);
      expect(
        bySlug.body.items.map((school: { id: string }) => school.id)
      ).toEqual([alpha.id]);
    }
  );

  consoleTest(
    'pages the list ten at a time with a cursor',
    async ({ api, kit }) => {
      for (let index = 1; index <= 12; index += 1) {
        const label = String(index).padStart(2, '0');
        await kit.school({ name: `School ${label}`, slug: `school-${label}` });
      }
      const first = await api(kit.admin).get('/platform/schools').expect(200);
      expect(first.body.items).toHaveLength(10);
      expect(first.body.items[0].name).toBe('School 01');
      expect(first.body.nextCursor).toEqual(expect.any(String));

      const second = await api(kit.admin)
        .get('/platform/schools')
        .query({ cursor: first.body.nextCursor })
        .expect(200);
      expect(
        second.body.items.map((school: { name: string }) => school.name)
      ).toEqual(['School 11', 'School 12']);
      expect(second.body.nextCursor).toBeNull();

      await api(kit.admin)
        .get('/platform/schools')
        .query({ cursor: 'not-a-cursor' })
        .expect(400);
    }
  );

  consoleTest(
    'school options list every school by name without the page cap',
    async ({ api, kit }) => {
      const names = ['Delta', 'Alpha', 'Charlie', 'Bravo'];
      for (const name of names) {
        await kit.school({ name });
      }
      const res = await api(kit.admin)
        .get('/platform/schools/options')
        .expect(200);
      expect(
        (res.body.items as { name: string }[]).map((item) => item.name)
      ).toEqual(['Alpha', 'Bravo', 'Charlie', 'Delta']);
      expect(
        Object.keys(res.body.items[0] as object).toSorted((a, b) =>
          a.localeCompare(b)
        )
      ).toEqual(['id', 'name']);
    }
  );

  consoleTest(
    'get and members answer 404 for an unknown school',
    async ({ api, kit }) => {
      await api(kit.admin).get('/platform/schools/nowhere').expect(404);
      await api(kit.admin).get('/platform/schools/nowhere/members').expect(404);
      await api(kit.admin)
        .post('/platform/schools/nowhere/suspend')
        .expect(404);
      await api(kit.admin)
        .post('/platform/schools/nowhere/reactivate')
        .expect(404);
      await api(kit.admin)
        .put('/platform/schools/nowhere/owner')
        .send({ newOwner: { memberId: 'm' }, previousOwner: 'member' })
        .expect(404);
    }
  );

  consoleTest(
    'suspending pauses member routes, keeps data and sign-in, and reactivating resumes them',
    async ({ api, app, pool, createCampus, kit }) => {
      const { id, org, ownerUser } = await kit.school({ name: 'Paused High' });
      const campus = await createCampus(org, 'Main');
      await createStudent(app, ownerUser, { campusId: campus.id });
      const studentRows = () =>
        pool.query(
          `SELECT id, full_name FROM student WHERE organization_id = $1`,
          [id]
        );
      const before = await studentRows();

      await api(ownerUser).get('/students').expect(200);
      const suspended = await api(kit.admin)
        .post(`/platform/schools/${id}/suspend`)
        .expect(200);
      expect(suspended.body.status).toBe('suspended');

      for (const path of ['/students', '/me/permissions', '/campuses']) {
        const res = await api(ownerUser).get(path).expect(403);
        expect(res.body).toEqual({
          code: 'SchoolSuspended',
          message:
            'Paused High is paused on Eduvault. Contact the school for details.',
        });
      }
      expect((await studentRows()).rows).toEqual(before.rows);

      await api()
        .post('/api/auth/sign-in/email')
        .send({ email: ownerUser.email, password: PASSWORD })
        .expect(200);
      const me = await api(ownerUser).get('/me').expect(200);
      expect(me.body.suspendedSchool).toEqual({ id, name: 'Paused High' });

      const again = await api(kit.admin)
        .post(`/platform/schools/${id}/suspend`)
        .expect(409);
      expect(again.body).toMatchObject({
        code: 'Conflict',
        message: 'This school is already suspended.',
      });

      const reactivated = await api(kit.admin)
        .post(`/platform/schools/${id}/reactivate`)
        .expect(200);
      expect(reactivated.body.status).toBe('active');
      await api(ownerUser).get('/students').expect(200);
      expect(
        (await api(ownerUser).get('/me').expect(200)).body.suspendedSchool
      ).toBeNull();
      const twice = await api(kit.admin)
        .post(`/platform/schools/${id}/reactivate`)
        .expect(409);
      expect(twice.body.message).toBe('This school is not suspended.');
    }
  );

  consoleTest(
    'suspending one school leaves another school working',
    async ({ api, app, createCampus, kit }) => {
      const paused = await kit.school();
      const open = await kit.school();
      const campus = await createCampus(open.org, 'Main');
      await createStudent(app, open.ownerUser, { campusId: campus.id });

      await api(kit.admin)
        .post(`/platform/schools/${paused.id}/suspend`)
        .expect(200);

      await api(paused.ownerUser).get('/students').expect(403);
      expect(
        (await api(open.ownerUser).get('/students').expect(200)).body
      ).toHaveLength(1);
      const me = await api(open.ownerUser).get('/me').expect(200);
      expect(me.body.suspendedSchool).toBeNull();
      await api(open.ownerUser).get('/me/permissions').expect(200);
    }
  );

  consoleTest(
    'a member of two schools is blocked only while the paused one is active',
    async ({ api, createSchoolViaPlatform, setActiveOrganization, kit }) => {
      const first = await kit.school();
      const { school: second } = await createSchoolViaPlatform(
        kit.admin,
        body({ ownerEmail: first.ownerUser.email })
      );
      const user = first.ownerUser;
      await setActiveOrganization(user, first.id);
      await api(kit.admin)
        .post(`/platform/schools/${first.id}/suspend`)
        .expect(200);

      await api(user).get('/students').expect(403);
      expect((await api(user).get('/me').expect(200)).body).toMatchObject({
        suspendedSchool: { id: first.id },
        schoolCount: 2,
      });

      await setActiveOrganization(user, second.id);
      await api(user).get('/students').expect(200);
      expect(
        (await api(user).get('/me').expect(200)).body.suspendedSchool
      ).toBeNull();

      await setActiveOrganization(user, first.id);
      await api(user).get('/students').expect(403);
    }
  );

  consoleTest(
    'a suspended school refuses Better Auth organization writes but keeps reads and switching open',
    async ({ api, createCampus, createUser, kit }) => {
      const { id, org, ownerUser } = await kit.school({ name: 'Paused High' });
      const campus = await createCampus(org, 'Main');
      const hire = await createUser();
      const invite = () =>
        api(ownerUser)
          .post('/api/auth/organization/invite-member')
          .send({
            email: hire.email,
            role: ['bursar'],
            organizationId: id,
            teamId: [campus.id],
          });

      await api(kit.admin).post(`/platform/schools/${id}/suspend`).expect(200);

      const refused = await invite().expect(403);
      expect(refused.body).toMatchObject({ code: 'SchoolSuspended' });
      const renamed = await api(ownerUser)
        .post('/api/auth/organization/update-team')
        .send({ teamId: campus.id, data: { name: 'Renamed' } })
        .expect(403);
      expect(renamed.body).toMatchObject({ code: 'SchoolSuspended' });

      await api(ownerUser).get('/api/auth/organization/list').expect(200);
      await api(ownerUser)
        .post('/api/auth/organization/set-active')
        .send({ organizationId: id })
        .expect(200);

      await api(kit.admin)
        .post(`/platform/schools/${id}/reactivate`)
        .expect(200);
      await invite().expect(200);
    }
  );

  consoleTest.describe('replace owner', () => {
    consoleTest(
      'promotes an existing member, strips administrator and principal and demotes the old owner',
      async ({ api, pool, createUser, addMember, kit }) => {
        const { id, org, ownerUser } = await kit.school();
        const colleague = await addMember(org, await createUser(), {
          roles: ['administrator', 'principal', 'teacher'],
        });
        const memberId = await memberIdOf(api, {
          admin: kit.admin,
          schoolId: id,
          userId: colleague.id,
        });

        const res = await api(kit.admin)
          .put(`/platform/schools/${id}/owner`)
          .send({ newOwner: { memberId }, previousOwner: 'member' })
          .expect(200);
        expect(res.body.temporaryPassword).toBeNull();
        expect(res.body.school.owners).toEqual([
          expect.objectContaining({ id: colleague.id }),
        ]);

        const roles = await pool.query<{ userId: string; role: string }>(
          `SELECT "userId", role FROM member WHERE "organizationId" = $1`,
          [id]
        );
        const byUser = Object.fromEntries(
          roles.rows.map((row) => [
            row.userId,
            row.role.split(',').toSorted((a, b) => a.localeCompare(b)),
          ])
        );
        expect(byUser[colleague.id]).toEqual(['owner', 'teacher']);
        expect(byUser[ownerUser.id]).toEqual(['member']);
        expect(await kit.ownerCount(id)).toBe(1);
      }
    );

    consoleTest(
      'a new person gets a temporary password and the owner role',
      async ({ api, pool, kit }) => {
        const { id, ownerUser } = await kit.school();
        const email = `new-owner-${randomUUID().slice(0, 6)}@example.test`;

        const res = await api(kit.admin)
          .put(`/platform/schools/${id}/owner`)
          .send({
            newOwner: { name: 'Ngozi Eze', email },
            previousOwner: 'member',
          })
          .expect(200);
        expect(res.body.temporaryPassword).toMatch(/^[2-9A-NP-Za-km-z]{12}$/);
        expect(res.body.school.owners).toEqual([
          expect.objectContaining({ email, name: 'Ngozi Eze' }),
        ]);

        const flag = await pool.query<{ mustChangePassword: boolean }>(
          `SELECT "mustChangePassword" FROM "user" WHERE email = $1`,
          [email]
        );
        expect(flag.rows[0]?.mustChangePassword).toBe(true);
        const old = await pool.query<{ role: string }>(
          `SELECT role FROM member WHERE "organizationId" = $1 AND "userId" = $2`,
          [id, ownerUser.id]
        );
        expect(old.rows).toEqual([{ role: 'member' }]);
        await api()
          .post('/api/auth/sign-in/email')
          .send({ email, password: res.body.temporaryPassword })
          .expect(200);
        expect(await kit.ownerCount(id)).toBe(1);
      }
    );

    consoleTest(
      'removing the previous owner deletes their member and campus rows',
      async ({ api, pool, createUser, addMember, createCampus, kit }) => {
        const { id, org, ownerUser } = await kit.school();
        const colleague = await addMember(org, await createUser(), {
          roles: ['administrator'],
        });
        await createCampus(org, 'Main');
        const campusRows = () =>
          pool.query(`SELECT 1 FROM "teamMember" WHERE "userId" = $1`, [
            ownerUser.id,
          ]);
        expect((await campusRows()).rows).toHaveLength(1);

        const memberId = await memberIdOf(api, {
          admin: kit.admin,
          schoolId: id,
          userId: colleague.id,
        });
        await api(kit.admin)
          .put(`/platform/schools/${id}/owner`)
          .send({ newOwner: { memberId }, previousOwner: 'remove' })
          .expect(200);

        const old = await pool.query(
          `SELECT 1 FROM member WHERE "organizationId" = $1 AND "userId" = $2`,
          [id, ownerUser.id]
        );
        expect(old.rows).toEqual([]);
        expect((await campusRows()).rows).toEqual([]);
        const counts = await pool.query<{
          memberCount: number;
          actual: string;
        }>(
          `SELECT t."memberCount", (SELECT count(*) FROM "teamMember" m WHERE m."teamId" = t.id) AS actual
           FROM team t WHERE t."organizationId" = $1`,
          [id]
        );
        for (const row of counts.rows) {
          expect(Number(row.actual)).toBe(row.memberCount);
        }
        expect(await kit.ownerCount(id)).toBe(1);
      }
    );

    consoleTest(
      'refuses with 409 when the person is already the only owner, a super admin email, and 404 for an unknown member',
      async ({ api, kit }) => {
        const { id, ownerUser } = await kit.school();
        const ownerMember = await memberIdOf(api, {
          admin: kit.admin,
          schoolId: id,
          userId: ownerUser.id,
        });

        const only = await api(kit.admin)
          .put(`/platform/schools/${id}/owner`)
          .send({
            newOwner: { memberId: ownerMember },
            previousOwner: 'member',
          })
          .expect(409);
        expect(only.body.message).toBe(
          'That person is already the only owner.'
        );

        await api(kit.admin)
          .put(`/platform/schools/${id}/owner`)
          .send({
            newOwner: { name: 'Root', email: kit.admin.email },
            previousOwner: 'member',
          })
          .expect(409);
        await api(kit.admin)
          .put(`/platform/schools/${id}/owner`)
          .send({
            newOwner: { memberId: 'no-such-member' },
            previousOwner: 'member',
          })
          .expect(404);
        expect(await kit.ownerCount(id)).toBe(1);
      }
    );

    consoleTest(
      'a member of another school is not a member here',
      async ({ api, kit }) => {
        const first = await kit.school();
        const second = await kit.school();
        const foreignMember = await memberIdOf(api, {
          admin: kit.admin,
          schoolId: second.id,
          userId: second.ownerUser.id,
        });
        await api(kit.admin)
          .put(`/platform/schools/${first.id}/owner`)
          .send({
            newOwner: { memberId: foreignMember },
            previousOwner: 'member',
          })
          .expect(404);
      }
    );
  });

  consoleTest(
    'writes a platform audit row for create, suspend, reactivate and replace owner',
    async ({ api, pool, kit }) => {
      const { id, ownerUser } = await kit.school();
      await api(kit.admin).post(`/platform/schools/${id}/suspend`).expect(200);
      await api(kit.admin)
        .post(`/platform/schools/${id}/reactivate`)
        .expect(200);
      await api(kit.admin)
        .put(`/platform/schools/${id}/owner`)
        .send({
          newOwner: {
            name: 'Next Owner',
            email: `next-${randomUUID().slice(0, 6)}@example.test`,
          },
          previousOwner: 'member',
        })
        .expect(200);
      await api(kit.admin).post(`/platform/schools/${id}/suspend`).expect(200);
      await api(kit.admin).post(`/platform/schools/${id}/suspend`).expect(409);

      const rows = await waitForAuditRows(pool, { kind: 'platform' }, 5);
      expect(
        rows.map((row) => [
          row.action,
          row.status,
          row.organization_id,
          row.actor_user_id,
        ])
      ).toEqual([
        ['school.create', 201, id, kit.admin.id],
        ['school.suspend', 200, id, kit.admin.id],
        ['school.reactivate', 200, id, kit.admin.id],
        ['school.replaceOwner', 200, id, kit.admin.id],
        ['school.suspend', 200, id, kit.admin.id],
      ]);
      expect(
        rows.every((row) => row.method === null && row.reason === null)
      ).toBe(true);
      const suspended = await pool.query<{ suspended_by: string | null }>(
        `SELECT suspended_by FROM school_account WHERE organization_id = $1`,
        [id]
      );
      expect(suspended.rows[0]?.suspended_by).toBe(kit.admin.id);
      expect(ownerUser.id).toEqual(expect.any(String));
    }
  );

  consoleTest.describe('isolation', () => {
    consoleTest(
      'every new route answers 401 without a session, 403 for an owner and 200 for a super admin',
      async ({ api, createUser, addMember, kit }) => {
        const { id, ownerUser, org } = await kit.school();
        const colleague = await addMember(org, await createUser(), {
          roles: ['administrator'],
        });
        const memberId = await memberIdOf(api, {
          admin: kit.admin,
          schoolId: id,
          userId: colleague.id,
        });
        const routes = [
          ['get', '/platform/schools/options'],
          ['get', `/platform/schools/${id}`],
          ['get', `/platform/schools/${id}/members`],
          ['post', `/platform/schools/${id}/suspend`],
          ['post', `/platform/schools/${id}/reactivate`],
          ['put', `/platform/schools/${id}/owner`],
          ['get', '/platform/audit'],
        ] as const;
        const send = (
          user: TestUser | undefined,
          [method, path]: (typeof routes)[number]
        ) =>
          api(user)
            [method](path)
            .send(
              method === 'put'
                ? { newOwner: { memberId }, previousOwner: 'member' }
                : undefined
            );

        for (const route of routes) {
          await send(undefined, route).expect(401);
          await send(ownerUser, route).expect(403);
        }
        for (const route of routes) {
          await send(kit.admin, route).expect(200);
        }
      }
    );

    consoleTest(
      'case 5: a school owner cannot reach another school through the platform routes',
      async ({ api, kit }) => {
        const first = await kit.school();
        const second = await kit.school();
        await api(first.ownerUser)
          .get(`/platform/schools/${second.id}`)
          .expect(403);
        await api(first.ownerUser)
          .post(`/platform/schools/${second.id}/suspend`)
          .expect(403);
      }
    );
  });
});
