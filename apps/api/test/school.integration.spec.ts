import { splitRoles } from '@eduvault/policy';
import {
  acting,
  expect,
  type Fixtures,
  type TestUser,
} from './support/base-test';
import { schoolsTest } from './support/two-schools';

const test = schoolsTest;

const REASON = 'SUP-4004 close the school';

const rolesOf = async (pool: Fixtures['pool'], user: TestUser) => {
  const { rows } = await pool.query<{ role: string }>(
    `SELECT role FROM member WHERE "userId" = $1`,
    [user.id]
  );
  return splitRoles(rows[0]?.role);
};

test.describe('handing the school over', () => {
  test('gives the new owner owner in place of administrator and leaves the caller a member', async ({
    api,
    pool,
    createUser,
    addMember,
    schools: { owner, orgA },
  }) => {
    const tunde = await addMember(orgA, await createUser(), {
      roles: ['administrator', 'teacher'],
    });

    const res = await api(owner)
      .post('/school/handover')
      .send({ userId: tunde.id })
      .expect(201);

    expect(res.body).toEqual({ ownerUserId: tunde.id });
    expect(
      (await rolesOf(pool, tunde)).toSorted((a, b) => a.localeCompare(b))
    ).toEqual(['member', 'owner', 'teacher']);
    expect(await rolesOf(pool, owner)).toEqual(['member']);
    await api(owner)
      .post('/school/handover')
      .send({ userId: tunde.id })
      .expect(403);
    await api(tunde).get('/school/handover-candidates').expect(200);
  });

  test('replaces principal too and lists the candidates with the senior role held', async ({
    api,
    pool,
    createUser,
    addMember,
    schools: { owner, orgA, orgB },
  }) => {
    const grace = await addMember(orgA, await createUser({ name: 'Grace' }), {
      roles: ['principal'],
    });
    await addMember(orgA, await createUser({ name: 'Learner' }), {
      roles: ['student'],
    });
    const outsider = await addMember(
      orgB,
      await createUser({ name: 'Outsider' }),
      { roles: ['administrator'] }
    );

    const candidates = (
      await api(owner).get('/school/handover-candidates').expect(200)
    ).body;

    const byUser = Object.fromEntries(
      candidates.map((entry: { userId: string }) => [entry.userId, entry])
    );
    expect(byUser[grace.id]).toMatchObject({
      name: 'Grace',
      heldSenior: ['principal'],
    });
    expect(
      candidates.some((entry: { userId: string }) => entry.userId === owner.id)
    ).toBe(false);
    expect(
      candidates.every((entry: { name: string }) => entry.name !== 'Learner')
    ).toBe(true);
    expect(
      candidates.some(
        (entry: { userId: string }) => entry.userId === outsider.id
      )
    ).toBe(false);

    await api(owner)
      .post('/school/handover')
      .send({ userId: grace.id })
      .expect(201);
    expect(
      (await rolesOf(pool, grace)).toSorted((a, b) => a.localeCompare(b))
    ).toEqual(['member', 'owner']);
  });

  test('lets one of two simultaneous handovers from the same owner win', async ({
    api,
    pool,
    createUser,
    addMember,
    schools: { owner, orgA },
  }) => {
    const first = await addMember(orgA, await createUser(), {
      roles: ['administrator'],
    });
    const second = await addMember(orgA, await createUser(), {
      roles: ['administrator'],
    });

    const statuses = (
      await Promise.all(
        [first, second].map((target) =>
          api(owner).post('/school/handover').send({ userId: target.id })
        )
      )
    ).map((res) => res.status);

    expect(statuses.toSorted((a, b) => a - b)).toEqual([201, 403]);
    const { rows } = await pool.query(
      `SELECT 1 FROM member WHERE "organizationId" = $1 AND role ~ '(^|,)owner(,|$)'`,
      [orgA.id]
    );
    expect(rows).toHaveLength(1);
  });

  test('is refused to a custom role with organization:update but no owner role, and to an acting super admin', async ({
    api,
    createUser,
    makeSuperAdmin,
    withPermissions,
    schools: { orgA, noPermission },
  }) => {
    const custom = await withPermissions(orgA, [
      'organization:update',
      'organization:delete',
    ]);
    const admin = await makeSuperAdmin(await createUser());

    const attempts = [
      () =>
        api(custom).post('/school/handover').send({ userId: noPermission.id }),
      () => api(custom).get('/school/handover-candidates'),
      () =>
        api(admin)
          .post('/school/handover')
          .set(acting(orgA.id, REASON))
          .send({ userId: noPermission.id }),
    ];
    for (const attempt of attempts) {
      const res = await attempt().expect(403);
      expect(res.body.message).toBe('Only an owner can hand over the school.');
    }
    const removal = await api(custom)
      .delete('/school')
      .send({ confirmName: 'School A' })
      .expect(403);
    expect(removal.body.message).toBe('Only an owner can delete the school.');
  });

  test('answers 403 without organization:update and 401 without a session', async ({
    api,
    schools: { noPermission, lekkiOnly },
  }) => {
    for (const user of [noPermission, lekkiOnly]) {
      await api(user)
        .post('/school/handover')
        .send({ userId: user.id })
        .expect(403);
      await api(user).get('/school/handover-candidates').expect(403);
      await api(user).get('/school/deletable').expect(403);
      await api(user).delete('/school').send({ confirmName: 'x' }).expect(403);
    }
    await api().post('/school/handover').send({ userId: 'x' }).expect(401);
  });

  test('answers 404 for a user who is not a member and 409 for an owner or a portal account', async ({
    api,
    createUser,
    addMember,
    schools: { owner, ownerB, orgA },
  }) => {
    const second = await addMember(orgA, await createUser(), {
      roles: ['owner'],
    });
    const guardian = await addMember(orgA, await createUser(), {
      roles: ['guardian'],
    });

    await api(owner)
      .post('/school/handover')
      .send({ userId: ownerB.id })
      .expect(404);
    const already = await api(owner)
      .post('/school/handover')
      .send({ userId: second.id })
      .expect(409);
    expect(already.body.message).toBe(
      'Choose someone who is not already an owner.'
    );
    await api(owner)
      .post('/school/handover')
      .send({ userId: guardian.id })
      .expect(409);
  });

  test('keeps the original owner when the second write fails', async ({
    api,
    pool,
    createUser,
    addMember,
    schools: { owner, orgA },
  }) => {
    const tunde = await addMember(orgA, await createUser(), {
      roles: ['administrator'],
    });
    await pool.query(`
      CREATE FUNCTION fail_owner_demotion() RETURNS trigger AS $$
      BEGIN RAISE EXCEPTION 'owner demotion refused'; END
      $$ LANGUAGE plpgsql`);
    await pool.query(`
      CREATE TRIGGER fail_owner_demotion BEFORE UPDATE ON member
      FOR EACH ROW WHEN (OLD.role = 'owner') EXECUTE FUNCTION fail_owner_demotion()`);
    try {
      const res = await api(owner)
        .post('/school/handover')
        .send({ userId: tunde.id });
      expect(res.status).toBeGreaterThanOrEqual(500);
    } finally {
      await pool.query(`DROP TRIGGER fail_owner_demotion ON member`);
      await pool.query(`DROP FUNCTION fail_owner_demotion()`);
    }

    expect(await rolesOf(pool, owner)).toEqual(['owner']);
    expect(await rolesOf(pool, tunde)).toEqual(['administrator']);
  });

  test('cannot be done through Better Auth’s own member-role route', async ({
    api,
    pool,
    createUser,
    addMember,
    schools: { owner, orgA },
  }) => {
    const tunde = await addMember(orgA, await createUser(), {
      roles: ['administrator'],
    });
    const { rows } = await pool.query<{ id: string }>(
      `SELECT id FROM member WHERE "userId" = $1`,
      [tunde.id]
    );

    await api(owner)
      .post('/api/auth/organization/update-member-role')
      .send({
        memberId: rows[0]?.id,
        role: ['owner'],
        organizationId: orgA.id,
      })
      .expect(404);

    expect(await rolesOf(pool, tunde)).toEqual(['administrator']);
  });
});

test.describe('the owner rule at Better Auth’s boundary', () => {
  test('strips the senior roles when owner is added and keeps the last owner', async ({
    app,
    pool,
    createUser,
    addMember,
    schools: { owner, orgA },
  }) => {
    const { AuthService } = await import('@thallesp/nestjs-better-auth');
    const { api: authApi } = app.get(AuthService);
    const tunde = await addMember(orgA, await createUser(), {
      roles: ['administrator', 'teacher'],
    });
    const headers = new Headers({
      cookie: owner.cookie,
      origin: 'http://localhost:4200',
    });
    const members = await pool.query<{ id: string; userId: string }>(
      `SELECT id, "userId" FROM member WHERE "organizationId" = $1`,
      [orgA.id]
    );
    const memberId = (user: TestUser) =>
      members.rows.find((row) => row.userId === user.id)?.id ?? '';

    await authApi.updateMemberRole({
      body: {
        memberId: memberId(tunde),
        role: ['administrator', 'teacher', 'owner'] as ('owner' | 'member')[],
        organizationId: orgA.id,
      },
      headers,
    });
    expect(
      (await rolesOf(pool, tunde)).toSorted((a, b) => a.localeCompare(b))
    ).toEqual(['member', 'owner', 'teacher']);

    await authApi.updateMemberRole({
      body: {
        memberId: memberId(tunde),
        role: ['member'] as ('owner' | 'member')[],
        organizationId: orgA.id,
      },
      headers,
    });
    await expect(
      authApi.updateMemberRole({
        body: {
          memberId: memberId(owner),
          role: ['member'] as ('owner' | 'member')[],
          organizationId: orgA.id,
        },
        headers,
      })
    ).rejects.toThrow();
    expect(await rolesOf(pool, owner)).toEqual(['owner']);
  });
});

test.describe('deleting the school', () => {
  test('says whether it can be deleted and why not', async ({
    api,
    createUser,
    createOrganization,
    schools: { owner },
  }) => {
    expect(
      (await api(owner).get('/school/deletable').expect(200)).body
    ).toEqual({
      ok: false,
      reason: 'Not allowed: the school has students and money records.',
    });

    const empty = await createUser();
    await createOrganization(empty, 'Empty School');
    expect(
      (await api(empty).get('/school/deletable').expect(200)).body
    ).toEqual({
      ok: true,
    });
  });

  test('answers 400 for a wrong name and 409 while a student exists', async ({
    api,
    schools: { owner },
  }) => {
    await api(owner)
      .delete('/school')
      .send({ confirmName: 'School B' })
      .expect(400);
    await api(owner).delete('/school').send({ confirmName: '' }).expect(400);
    await api(owner)
      .delete('/school')
      .send({ confirmName: 'School A' })
      .expect(409);
    await api(owner).get('/school-account').expect(200);
  });

  test('removes a school with no students, with its configuration, and leaves other schools alone', async ({
    api,
    pool,
    createUser,
    createOrganization,
    createCampus,
    addMember,
    schools: { orgA, ownerB },
  }) => {
    const doomedOwner = await createUser();
    const doomed = await createOrganization(doomedOwner, 'Doomed School');
    const campus = await createCampus(doomed, 'Only');
    await addMember(doomed, await createUser(), {
      roles: ['teacher'],
      campuses: [campus],
    });

    const res = await api(doomedOwner)
      .delete('/school')
      .send({ confirmName: '  Doomed School ' })
      .expect(200);

    expect(res.body).toEqual({ id: doomed.id });
    for (const [table, column] of [
      ['organization', 'id'],
      ['school_account', 'organization_id'],
      ['school_setting', 'organization_id'],
      ['campus', 'organization_id'],
      ['team', '"organizationId"'],
      ['member', '"organizationId"'],
      ['"organizationRole"', '"organizationId"'],
      ['class_level', 'organization_id'],
    ]) {
      const { rows } = await pool.query(
        `SELECT 1 FROM ${table} WHERE ${column} = $1`,
        [doomed.id]
      );
      expect(rows, table).toHaveLength(0);
    }
    expect(
      (await api(ownerB).get('/school-account').expect(200)).body.name
    ).toBe('School B');
    const { rows } = await pool.query(
      `SELECT 1 FROM organization WHERE id = $1`,
      [orgA.id]
    );
    expect(rows).toHaveLength(1);
  });

  test('cannot be done through Better Auth’s own organization routes', async ({
    api,
    pool,
    schools: { owner, orgA },
  }) => {
    await api(owner)
      .post('/api/auth/organization/delete')
      .send({ organizationId: orgA.id })
      .expect(404);
    await api(owner)
      .post('/api/auth/organization/update')
      .send({ organizationId: orgA.id, data: { name: 'Renamed' } })
      .expect(404);

    const { rows } = await pool.query(
      `SELECT name FROM organization WHERE id = $1`,
      [orgA.id]
    );
    expect(rows[0].name).toBe('School A');
  });
});
