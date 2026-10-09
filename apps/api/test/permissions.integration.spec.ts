import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import {
  ALL_PERMISSIONS,
  STARTER_ROLES,
  parsePermissionMap,
  toPermissionMap,
  toPermissions,
} from '@eduvault/policy';
import {
  syncAllStarterRoles,
  syncStarterRoles,
} from '../src/app/common/auth/starter-roles';
import { baseTest, expect } from './support/base-test';
import { twoSchools, type TwoSchools } from './support/two-schools';

const test = baseTest.extend<{ schools: TwoSchools }>({
  schools: async (
    { app, createUser, createOrganization, createCampus, addMember },
    use
  ) => {
    await use(
      await twoSchools({
        app,
        createUser,
        createOrganization,
        createCampus,
        addMember,
      })
    );
  },
});

const student = (campusId: string, n: string) => ({
  campusId,
  fullName: `Student ${n}`,
  admissionNumber: `ADM-${n}`,
});

const FEE = { name: 'Tuition', amountMinor: 1, currency: 'NGN' };

const rolesOf = async (pool: Pool, organizationId: string) => {
  const { rows } = await pool.query(
    `SELECT role, label, description, permission, source, "editedAt"
     FROM "organizationRole" WHERE "organizationId" = $1 ORDER BY role`,
    [organizationId]
  );
  return rows as {
    role: string;
    label: string;
    description: string;
    permission: string;
    source: string;
    editedAt: Date | null;
  }[];
};

test.describe('guard order', () => {
  test('401 without a session, 403 naming the permission, 404 for a missing row', async ({
    api,
    schools: { owner, noPermission, lekki },
  }) => {
    const routes = [
      { path: '/students', permission: 'student:read' },
      { path: '/fee-schedules', permission: 'feeSchedule:read' },
      { path: '/school-account', permission: 'schoolAccount:read' },
    ];
    for (const { path, permission } of routes) {
      const unauthenticated = await api().get(path).expect(401);
      expect(unauthenticated.body.code).toBe('Unauthorized');

      const forbidden = await api(noPermission).get(path).expect(403);
      expect(forbidden.body).toEqual({
        code: 'Forbidden',
        message: `Missing permission ${permission}`,
      });
    }

    await api().post('/campuses').send({ name: 'x' }).expect(401);
    const campus = await api(noPermission)
      .post('/campuses')
      .send({ name: 'x' })
      .expect(403);
    expect(campus.body.message).toBe('Missing permission team:create');

    await api(owner).get(`/students/${randomUUID()}`).expect(404);
    await api(owner).get(`/campuses/${randomUUID()}`).expect(404);
    await api(owner).get(`/fee-schedules/${randomUUID()}`).expect(404);
    await api(owner).get('/school-account').expect(404);
    await api(noPermission).get(`/campuses/${lekki.id}`).expect(404);
  });

  test('a member with no roles gets 403 on every gated endpoint', async ({
    api,
    schools: { noPermission, lekki, studentLekki },
  }) => {
    const id = studentLekki.id;
    const gated = [
      ['get', '/students'],
      ['get', `/students/${id}`],
      ['post', '/students'],
      ['patch', `/students/${id}`],
      ['post', '/campuses'],
      ['patch', `/campuses/${lekki.id}`],
      ['delete', `/campuses/${lekki.id}`],
      ['get', '/fee-schedules'],
      ['get', `/fee-schedules/${id}`],
      ['post', '/fee-schedules'],
      ['patch', `/fee-schedules/${id}`],
      ['delete', `/fee-schedules/${id}`],
      ['get', '/school-account'],
      ['post', '/school-account'],
      ['patch', '/school-account'],
      ['delete', '/school-account'],
    ] as const;
    for (const [method, path] of gated) {
      const res = await api(noPermission)[method](path).send({});
      expect(res.status, `${method} ${path}`).toBe(403);
      expect(res.body.code).toBe('Forbidden');
    }
  });

  test('the owner passes every gated route and /me/permissions lists every permission', async ({
    api,
    schools: { owner, orgA, lekki, studentLekki },
  }) => {
    await api(owner).get('/students').expect(200);
    await api(owner).get(`/students/${studentLekki.id}`).expect(200);
    await api(owner).post('/students').send(student(lekki.id, 'O')).expect(201);
    await api(owner)
      .patch(`/students/${studentLekki.id}`)
      .send({ fullName: 'Renamed' })
      .expect(200);
    await api(owner).get('/campuses').expect(200);
    await api(owner).post('/campuses').send({ name: 'Annex' }).expect(201);
    await api(owner).get('/fee-schedules').expect(200);
    await api(owner).post('/fee-schedules').send(FEE).expect(201);
    await api(owner)
      .post('/school-account')
      .send({ name: 'Fees', currency: 'NGN', admissionPrefix: 'FEE' })
      .expect(201);
    await api(owner).get('/school-account').expect(200);

    const res = await api(owner).get('/me/permissions').expect(200);
    expect(res.body).toEqual({
      organizationId: orgA.id,
      roles: ['owner'],
      permissions: toPermissionMap(ALL_PERMISSIONS),
      campusScope: 'all',
      classScope: 'all',
      acting: null,
    });
  });
});

test.describe('role union', () => {
  test('permissions from two custom roles are combined', async ({
    api,
    createUser,
    addMember,
    createRole,
    schools: { orgA, lekki },
  }) => {
    await createRole(orgA, { slug: 'reader', permissions: ['student:read'] });
    await createRole(orgA, {
      slug: 'enroller',
      permissions: ['student:create'],
    });
    const reader = await addMember(orgA, await createUser(), {
      roles: ['reader'],
      campuses: [lekki],
    });
    await api(reader)
      .post('/students')
      .send(student(lekki.id, 'U'))
      .expect(403);

    const both = await addMember(orgA, await createUser(), {
      roles: ['reader', 'enroller'],
      campuses: [lekki],
    });
    await api(both).get('/students').expect(200);
    await api(both).post('/students').send(student(lekki.id, 'U')).expect(201);
  });

  test('a role change applies on the next request', async ({
    api,
    pool,
    schools: { lekkiOnly, orgA },
  }) => {
    await api(lekkiOnly).get('/campuses').expect(200);
    await api(lekkiOnly).get('/school-account').expect(403);
    await pool.query(
      `UPDATE "organizationRole" SET permission = $2
       WHERE "organizationId" = $1 AND role = 'bursar'`,
      [orgA.id, JSON.stringify({ student: ['read'], schoolAccount: ['read'] })]
    );
    await api(lekkiOnly).get('/school-account').expect(404);
  });
});

test.describe('campus scope', () => {
  test('a cross-campus row answers the same 404 as a missing id', async ({
    api,
    schools: { lekkiOnly, studentIkeja },
  }) => {
    const crossCampus = await api(lekkiOnly)
      .get(`/students/${studentIkeja.id}`)
      .expect(404);
    const missing = await api(lekkiOnly)
      .get(`/students/${randomUUID()}`)
      .expect(404);
    expect(crossCampus.body).toEqual(missing.body);
  });

  test('a campusId filter outside the scope answers 404 "Campus not found"', async ({
    api,
    schools: { lekkiOnly, ikeja },
  }) => {
    const res = await api(lekkiOnly)
      .get(`/students?campusId=${ikeja.id}`)
      .expect(404);
    expect(res.body.message).toBe('Campus not found');
  });

  test('creating or moving a student onto a campus outside the scope answers 404 "Campus not found"', async ({
    api,
    withPermissions,
    schools: { orgA, lekki, ikeja, studentLekki },
  }) => {
    const clerk = await withPermissions(
      orgA,
      ['student:create', 'student:read', 'student:update'],
      { campuses: [lekki] }
    );
    const create = await api(clerk)
      .post('/students')
      .send(student(ikeja.id, 'X'))
      .expect(404);
    expect(create.body.message).toBe('Campus not found');
    const move = await api(clerk)
      .patch(`/students/${studentLekki.id}`)
      .send({ campusId: ikeja.id })
      .expect(404);
    expect(move.body.message).toBe('Campus not found');
    await api(clerk).post('/students').send(student(lekki.id, 'Y')).expect(201);
  });

  test('a fee-schedule campusId filter outside the scope answers 404 "Campus not found"', async ({
    api,
    withPermissions,
    schools: { orgA, lekki, ikeja },
  }) => {
    const reader = await withPermissions(orgA, ['feeSchedule:read'], {
      campuses: [lekki],
    });
    const res = await api(reader)
      .get(`/fee-schedules?campusId=${ikeja.id}`)
      .expect(404);
    expect(res.body.message).toBe('Campus not found');
  });

  test('creating or moving a fee schedule onto a campus outside the scope answers 404 "Campus not found"', async ({
    api,
    withPermissions,
    schools: { owner, orgA, lekki, ikeja },
  }) => {
    const clerk = await withPermissions(
      orgA,
      ['feeSchedule:create', 'feeSchedule:read', 'feeSchedule:update'],
      { campuses: [lekki] }
    );
    const own = await api(clerk)
      .post('/fee-schedules')
      .send({ ...FEE, campusId: lekki.id })
      .expect(201);
    const create = await api(clerk)
      .post('/fee-schedules')
      .send({ ...FEE, campusId: ikeja.id })
      .expect(404);
    expect(create.body.message).toBe('Campus not found');
    const move = await api(clerk)
      .patch(`/fee-schedules/${own.body.id}`)
      .send({ campusId: ikeja.id })
      .expect(404);
    expect(move.body.message).toBe('Campus not found');
    await api(owner)
      .post('/fee-schedules')
      .send({ ...FEE, campusId: ikeja.id })
      .expect(201);
  });

  test('DELETE /students/:id no longer exists', async ({
    api,
    schools: { owner, studentLekki },
  }) => {
    await api(owner).delete(`/students/${studentLekki.id}`).expect(404);
    await api(owner).get(`/students/${studentLekki.id}`).expect(200);
  });
});

test.describe('/me/permissions', () => {
  test('lists the union for a member with two roles', async ({
    api,
    createUser,
    addMember,
    schools: { orgA, lekki },
  }) => {
    const grace = await addMember(orgA, await createUser(), {
      roles: ['teacher', 'principal'],
      campuses: [lekki],
    });
    const res = await api(grace).get('/me/permissions').expect(200);
    expect(res.body).toEqual({
      organizationId: orgA.id,
      roles: ['teacher', 'principal'],
      permissions: {
        student: ['read'],
        team: ['read'],
        campus: ['readAll'],
      },
      campusScope: 'all',
      classScope: 'all',
      acting: null,
    });
  });

  test('answers an empty map for a member with no roles', async ({
    api,
    schools: { noPermission, orgA },
  }) => {
    const res = await api(noPermission).get('/me/permissions').expect(200);
    expect(res.body).toEqual({
      organizationId: orgA.id,
      roles: ['member'],
      permissions: {},
      campusScope: [],
      classScope: 'all',
      acting: null,
    });
  });

  test('scopes a campus member to their campuses', async ({
    api,
    schools: { lekkiOnly, lekki },
  }) => {
    const res = await api(lekkiOnly).get('/me/permissions').expect(200);
    expect(res.body.campusScope).toEqual([lekki.id]);
    expect(res.body.permissions).toEqual({ student: ['read'] });
  });

  test('401 without a session and 403 NoSchool without a school', async ({
    api,
    createUser,
  }) => {
    await api().get('/me/permissions').expect(401);
    const user = await createUser();
    const res = await api(user).get('/me/permissions').expect(403);
    expect(res.body).toEqual({
      code: 'NoSchool',
      message: 'No active school for this session',
    });
  });
});

test.describe('isolation', () => {
  const editedBursar = {
    student: ['read', 'create'],
  };

  const editBursarInA = (pool: Pool, organizationId: string) =>
    pool.query(
      `UPDATE "organizationRole"
       SET permission = $2, "editedAt" = now()
       WHERE "organizationId" = $1 AND role = 'bursar'`,
      [organizationId, JSON.stringify(editedBursar)]
    );

  test('a same-slug role edited in one school leaves the other school unchanged', async ({
    api,
    pool,
    createUser,
    addMember,
    schools: { orgA, orgB, campusB, lekkiOnly },
  }) => {
    const bursarB = await addMember(orgB, await createUser(), {
      roles: ['bursar'],
      campuses: [campusB],
    });
    await editBursarInA(pool, orgA.id);

    const inA = await api(lekkiOnly).get('/me/permissions').expect(200);
    expect(inA.body.permissions.student).toEqual(
      expect.arrayContaining(['read', 'create'])
    );
    const inB = await api(bursarB).get('/me/permissions').expect(200);
    expect(inB.body).toMatchObject({
      organizationId: orgB.id,
      roles: ['bursar'],
      permissions: { student: ['read'] },
      campusScope: [campusB.id],
    });
    await api(bursarB)
      .post('/students')
      .send(student(campusB.id, 'B1'))
      .expect(403);
  });

  test("the owner of one school sees only that school's roles and scope", async ({
    api,
    schools: { ownerB, orgB, campusB },
  }) => {
    const res = await api(ownerB).get('/me/permissions').expect(200);
    expect(res.body).toMatchObject({
      organizationId: orgB.id,
      roles: ['owner'],
      campusScope: 'all',
    });
    const campuses = await api(ownerB).get('/campuses').expect(200);
    expect(campuses.body.map((campus: { id: string }) => campus.id)).toEqual([
      campusB.id,
    ]);
  });

  test("syncStarterRoles for one school leaves the other school's rows alone", async ({
    pool,
    schools: { orgA, orgB },
  }) => {
    await pool.query(
      `UPDATE "organizationRole" SET permission = '{}'
       WHERE "organizationId" = ANY($1) AND role = 'teacher'`,
      [[orgA.id, orgB.id]]
    );
    const before = await rolesOf(pool, orgB.id);

    await syncStarterRoles(pool, orgA.id);

    expect(await rolesOf(pool, orgB.id)).toEqual(before);
    const teacherA = (await rolesOf(pool, orgA.id)).find(
      (row) => row.role === 'teacher'
    );
    expect(parsePermissionMap(teacherA?.permission ?? '')).toEqual({
      student: ['read'],
    });
  });
});

test.describe('starter roles', () => {
  test('a new school has the six starter roles with their permission sets', async ({
    pool,
    schools: { orgA },
  }) => {
    const rows = await rolesOf(pool, orgA.id);
    expect(rows.map((row) => row.role)).toEqual(
      STARTER_ROLES.map((role) => role.slug).toSorted((a, b) =>
        a.localeCompare(b)
      )
    );
    for (const row of rows) {
      const expected = STARTER_ROLES.find((role) => role.slug === row.role);
      expect(row.source).toBe('starter');
      expect(row.editedAt).toBeNull();
      expect(row.label).toBe(expected?.label);
      expect(row.description).toBe(expected?.description);
      expect(toPermissions(parsePermissionMap(row.permission))).toEqual(
        toPermissions(toPermissionMap(expected?.permissions ?? []))
      );
    }
  });

  test('syncStarterRoles updates an unedited role, restores a missing one and leaves an edited one', async ({
    pool,
    schools: { orgA },
  }) => {
    await pool.query(
      `UPDATE "organizationRole" SET permission = '{}'
       WHERE "organizationId" = $1 AND role IN ('teacher', 'bursar')`,
      [orgA.id]
    );
    await pool.query(
      `UPDATE "organizationRole" SET "editedAt" = now()
       WHERE "organizationId" = $1 AND role = 'bursar'`,
      [orgA.id]
    );
    await pool.query(
      `DELETE FROM "organizationRole"
       WHERE "organizationId" = $1 AND role = 'guardian'`,
      [orgA.id]
    );

    await syncStarterRoles(pool, orgA.id);

    const rows = await rolesOf(pool, orgA.id);
    const permissionOf = (slug: string) =>
      rows.find((row) => row.role === slug)?.permission;
    expect(parsePermissionMap(permissionOf('teacher') ?? '')).toEqual({
      student: ['read'],
    });
    expect(permissionOf('bursar')).toBe('{}');
    expect(permissionOf('guardian')).toBeDefined();
    expect(rows).toHaveLength(STARTER_ROLES.length);
  });
  test('syncAllStarterRoles gives every existing school the six roles and is safe to repeat', async ({
    pool,
    schools: { orgA, orgB },
  }) => {
    await pool.query(
      `DELETE FROM "organizationRole" WHERE "organizationId" = ANY($1)`,
      [[orgA.id, orgB.id]]
    );

    await syncAllStarterRoles(pool);
    await syncAllStarterRoles(pool);

    for (const org of [orgA, orgB]) {
      expect(await rolesOf(pool, org.id)).toHaveLength(STARTER_ROLES.length);
    }
  });

  test('a school cannot hold two rows for one role slug', async ({
    pool,
    schools: { orgA },
  }) => {
    await expect(
      pool.query(
        `INSERT INTO "organizationRole"
           ("organizationId", role, permission, label, source)
         VALUES ($1, 'bursar', '{}', 'Bursar', 'custom')`,
        [orgA.id]
      )
    ).rejects.toMatchObject({ code: '23505' });
  });
});
