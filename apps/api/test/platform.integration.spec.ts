import { randomUUID } from 'node:crypto';
import { baseTest as test, expect, PASSWORD } from './support/base-test';

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
    expect(list.body).toEqual({ items: [] });
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

  // Of the twelve isolation cases only 5 (an owner is refused, 403) and 6 (no
  // session, 401) apply: platform routes read across schools by design.
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
