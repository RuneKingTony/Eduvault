import { ACTING_REASON_HEADER } from '@eduvault/api-contract';
import {
  acting,
  baseTest as test,
  expect,
  waitForAuditRows,
} from './support/base-test';
import { createStudent } from './support/factories/students';
import { twoSchools } from './support/two-schools';

const REASON = 'SUP-2207 fix misspelt surname';

const failStudentUpdates = async (pool: {
  query: (sql: string) => Promise<unknown>;
}) => {
  await pool.query(`
    CREATE FUNCTION fail_student_update() RETURNS trigger AS $$
    BEGIN RAISE EXCEPTION 'student update refused'; END
    $$ LANGUAGE plpgsql`);
  await pool.query(`
    CREATE TRIGGER fail_student_update BEFORE UPDATE ON student
    FOR EACH ROW EXECUTE FUNCTION fail_student_update()`);
};
const repairStudentUpdates = async (pool: {
  query: (sql: string) => Promise<unknown>;
}) => {
  await pool.query(`DROP TRIGGER IF EXISTS fail_student_update ON student`);
  await pool.query(`DROP FUNCTION IF EXISTS fail_student_update()`);
};

test.describe('acting in a school', () => {
  test('headers from a school owner are ignored and leave no audit row', async ({
    api,
    pool,
    app,
    createUser,
    createOrganization,
    createCampus,
    addMember,
    makeSuperAdmin,
  }) => {
    const fixtures = await twoSchools({
      app,
      createUser,
      createOrganization,
      createCampus,
      addMember,
    });
    const { owner, orgA, orgB } = fixtures;
    const listed = await api(owner)
      .get('/students')
      .set(acting(orgB.id, 'sneaky'))
      .expect(200);
    expect(listed.body).toHaveLength(2);

    const admin = await makeSuperAdmin(await createUser());
    await api(admin).get('/students').set(acting(orgA.id)).expect(200);
    const rows = await waitForAuditRows(pool, {}, 1);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.actor_user_id).toBe(admin.id);
  });

  test('a reason with non-Latin-1 text travels percent-encoded and is stored decoded', async ({
    api,
    app,
    pool,
    createUser,
    createOrganization,
    createCampus,
    addMember,
    makeSuperAdmin,
  }) => {
    const { orgA, studentLekki } = await twoSchools({
      app,
      createUser,
      createOrganization,
      createCampus,
      addMember,
    });
    const admin = await makeSuperAdmin(await createUser());
    const reason = 'Parent request – fix surname 👍';
    await api(admin)
      .patch(`/students/${studentLekki.id}`)
      .set(acting(orgA.id, reason))
      .send({ fullName: 'Ada Okafor' })
      .expect(200);
    const [row] = await waitForAuditRows(pool, { kind: 'acting' }, 1);
    expect(row?.reason).toBe(reason);
  });

  test('a malformed percent-encoded reason answers 400', async ({
    api,
    app,
    pool,
    createUser,
    createOrganization,
    createCampus,
    addMember,
    makeSuperAdmin,
  }) => {
    const { orgA } = await twoSchools({
      app,
      createUser,
      createOrganization,
      createCampus,
      addMember,
    });
    const admin = await makeSuperAdmin(await createUser());
    await api(admin)
      .get('/students')
      .set({ ...acting(orgA.id), [ACTING_REASON_HEADER]: '50% off' })
      .expect(400);
    await waitForAuditRows(pool, { kind: 'acting' }, 1);
  });

  test('a reason over 200 characters answers 400 and is still audited without it', async ({
    api,
    app,
    pool,
    createUser,
    createOrganization,
    createCampus,
    addMember,
    makeSuperAdmin,
  }) => {
    const { orgA } = await twoSchools({
      app,
      createUser,
      createOrganization,
      createCampus,
      addMember,
    });
    const admin = await makeSuperAdmin(await createUser());
    const res = await api(admin)
      .get('/students')
      .set(acting(orgA.id, 'a'.repeat(201)))
      .expect(400);
    expect(res.body).toMatchObject({ code: 'ValidationError' });
    const rows = await waitForAuditRows(pool, { kind: 'acting' }, 1);
    expect(rows.map((row) => [row.method, row.status, row.reason])).toEqual([
      ['GET', 400, null],
    ]);
  });

  test('an unknown school answers 404 and writes no audit row', async ({
    api,
    pool,
    createUser,
    makeSuperAdmin,
  }) => {
    const admin = await makeSuperAdmin(await createUser());
    const res = await api(admin)
      .get('/students')
      .set(acting('no-such-school'))
      .expect(404);
    expect(res.body).toMatchObject({
      code: 'NotFound',
      message: 'School not found',
    });
    expect(await waitForAuditRows(pool, {}, 1)).toEqual([]);
  });

  test('read-only acting sees every campus and holds no write permission', async ({
    api,
    app,
    pool,
    createUser,
    createOrganization,
    createCampus,
    addMember,
    makeSuperAdmin,
  }) => {
    const { orgA } = await twoSchools({
      app,
      createUser,
      createOrganization,
      createCampus,
      addMember,
    });
    const admin = await makeSuperAdmin(await createUser());

    const students = await api(admin)
      .get('/students')
      .set(acting(orgA.id))
      .expect(200);
    expect(students.body).toHaveLength(2);

    const access = await api(admin)
      .get('/me/permissions')
      .set(acting(orgA.id))
      .expect(200);
    expect(access.body).toMatchObject({
      organizationId: orgA.id,
      roles: [],
      campusScope: 'all',
      acting: { organizationId: orgA.id, writes: false },
    });
    const actions = Object.values(
      access.body.permissions as Record<string, string[]>
    ).flat();
    expect(actions.length).toBeGreaterThan(0);
    expect(
      actions.filter((action) => action !== 'read' && action !== 'readAll')
    ).toEqual([]);

    const rows = await waitForAuditRows(pool, { kind: 'acting' }, 2);
    expect(rows.map((row) => [row.method, row.path, row.status])).toEqual([
      ['GET', '/students', 200],
      ['GET', '/me/permissions', 200],
    ]);
  });

  test('a write without a reason answers 403 ActingReadOnly and is audited', async ({
    api,
    app,
    pool,
    createUser,
    createOrganization,
    createCampus,
    addMember,
    makeSuperAdmin,
  }) => {
    const { orgA, studentLekki } = await twoSchools({
      app,
      createUser,
      createOrganization,
      createCampus,
      addMember,
    });
    const admin = await makeSuperAdmin(await createUser());

    const res = await api(admin)
      .patch(`/students/${studentLekki.id}`)
      .set(acting(orgA.id))
      .send({ fullName: 'Changed' })
      .expect(403);
    expect(res.body).toMatchObject({
      code: 'ActingReadOnly',
      message: 'Acting read-only. A write needs a reason.',
    });

    const [row] = await waitForAuditRows(pool, { organizationId: orgA.id }, 1);
    expect(row).toMatchObject({
      kind: 'acting',
      method: 'PATCH',
      path: `/students/${studentLekki.id}`,
      status: 403,
      reason: null,
    });
    const unchanged = await api(admin)
      .get(`/students/${studentLekki.id}`)
      .set(acting(orgA.id))
      .expect(200);
    expect(unchanged.body.fullName).toBe(studentLekki.fullName);
  });

  test('a write with a reason succeeds and the row carries the reason', async ({
    api,
    app,
    pool,
    createUser,
    createOrganization,
    createCampus,
    addMember,
    makeSuperAdmin,
  }) => {
    const { orgA, studentLekki } = await twoSchools({
      app,
      createUser,
      createOrganization,
      createCampus,
      addMember,
    });
    const admin = await makeSuperAdmin(await createUser());

    const res = await api(admin)
      .patch(`/students/${studentLekki.id}`)
      .set(acting(orgA.id, REASON))
      .send({ fullName: 'Corrected Name' })
      .expect(200);
    expect(res.body.fullName).toBe('Corrected Name');

    const access = await api(admin)
      .get('/me/permissions')
      .set(acting(orgA.id, REASON))
      .expect(200);
    expect(access.body.acting).toEqual({
      organizationId: orgA.id,
      writes: true,
    });

    const rows = await waitForAuditRows(pool, { method: 'PATCH' }, 1);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      actor_user_id: admin.id,
      organization_id: orgA.id,
      status: 200,
      reason: REASON,
    });
  });

  test('a reason over 200 characters answers 400', async ({
    api,
    app,
    createUser,
    createOrganization,
    createCampus,
    addMember,
    makeSuperAdmin,
  }) => {
    const { orgA } = await twoSchools({
      app,
      createUser,
      createOrganization,
      createCampus,
      addMember,
    });
    const admin = await makeSuperAdmin(await createUser());
    const res = await api(admin)
      .get('/students')
      .set(acting(orgA.id, 'a'.repeat(201)))
      .expect(400);
    expect(res.body).toMatchObject({ code: 'ValidationError' });
  });

  test('creating a student needs a campus because acting has no active one', async ({
    api,
    app,
    createUser,
    createOrganization,
    createCampus,
    addMember,
    makeSuperAdmin,
  }) => {
    const { orgA, lekki } = await twoSchools({
      app,
      createUser,
      createOrganization,
      createCampus,
      addMember,
    });
    const admin = await makeSuperAdmin(await createUser());
    const student = { fullName: 'New Pupil', admissionNumber: 'ADM-900' };

    await api(admin)
      .post('/students')
      .set(acting(orgA.id, REASON))
      .send(student)
      .expect(400);
    const created = await api(admin)
      .post('/students')
      .set(acting(orgA.id, REASON))
      .send({ ...student, campusId: lekki.id })
      .expect(201);
    expect(created.body).toMatchObject({
      organizationId: orgA.id,
      campusId: lekki.id,
    });
  });

  test('a handler that throws still writes one row with status 500', async ({
    api,
    app,
    pool,
    createUser,
    createOrganization,
    createCampus,
    addMember,
    makeSuperAdmin,
  }) => {
    const { orgA, studentLekki } = await twoSchools({
      app,
      createUser,
      createOrganization,
      createCampus,
      addMember,
    });
    const admin = await makeSuperAdmin(await createUser());
    await failStudentUpdates(pool);
    try {
      await api(admin)
        .patch(`/students/${studentLekki.id}`)
        .set(acting(orgA.id, REASON))
        .send({ fullName: 'Never saved' })
        .expect(500);
    } finally {
      await repairStudentUpdates(pool);
    }
    const rows = await waitForAuditRows(pool, { method: 'PATCH' }, 1);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: 500, reason: REASON });
  });

  test('campus create, rename and delete work with a reason and never enrol the super admin', async ({
    api,
    app,
    pool,
    createUser,
    createOrganization,
    createCampus,
    addMember,
    makeSuperAdmin,
  }) => {
    const { orgA } = await twoSchools({
      app,
      createUser,
      createOrganization,
      createCampus,
      addMember,
    });
    const admin = await makeSuperAdmin(await createUser());
    const headers = acting(orgA.id, REASON);

    const created = await api(admin)
      .post('/campuses')
      .set(headers)
      .send({ name: 'Annex' })
      .expect(201);
    const renamed = await api(admin)
      .patch(`/campuses/${created.body.id}`)
      .set(headers)
      .send({ name: 'Annex East' })
      .expect(200);
    expect(renamed.body.name).toBe('Annex East');
    await api(admin)
      .delete(`/campuses/${created.body.id}`)
      .set(headers)
      .expect(200);

    const memberships = await pool.query(
      `SELECT 1 FROM member WHERE "userId" = $1
       UNION ALL SELECT 1 FROM "teamMember" WHERE "userId" = $1`,
      [admin.id]
    );
    expect(memberships.rows).toEqual([]);
  });

  test('acting works in a suspended school', async ({
    api,
    app,
    createUser,
    createCampus,
    createSchoolViaPlatform,
    makeSuperAdmin,
  }) => {
    const admin = await makeSuperAdmin(await createUser());
    const owner = await createUser();
    const { school } = await createSchoolViaPlatform(admin, {
      ownerEmail: owner.email,
    });
    const campus = await createCampus({
      id: school.id,
      name: school.name,
      slug: school.slug,
      owner,
    });
    await createStudent(app, owner, { campusId: campus.id });
    await api(admin).post(`/platform/schools/${school.id}/suspend`).expect(200);

    await api(owner).get('/students').expect(403);
    const listed = await api(admin)
      .get('/students')
      .set(acting(school.id))
      .expect(200);
    expect(listed.body).toHaveLength(1);
  });

  test.describe('isolation', () => {
    test('case 1: another school’s student answers 404 while acting in A', async ({
      api,
      app,
      createUser,
      createOrganization,
      createCampus,
      addMember,
      makeSuperAdmin,
    }) => {
      const { orgA, studentB } = await twoSchools({
        app,
        createUser,
        createOrganization,
        createCampus,
        addMember,
      });
      const admin = await makeSuperAdmin(await createUser());
      await api(admin)
        .get(`/students/${studentB.id}`)
        .set(acting(orgA.id))
        .expect(404);
      await api(admin)
        .patch(`/students/${studentB.id}`)
        .set(acting(orgA.id, REASON))
        .send({ fullName: 'Nope' })
        .expect(404);
    });

    test('case 5: a member without the permission is refused, acting or not', async ({
      api,
      app,
      createUser,
      createOrganization,
      createCampus,
      addMember,
      makeSuperAdmin,
    }) => {
      const { orgA, noPermission, studentLekki } = await twoSchools({
        app,
        createUser,
        createOrganization,
        createCampus,
        addMember,
      });
      const admin = await makeSuperAdmin(await createUser());
      await api(noPermission)
        .get(`/students/${studentLekki.id}`)
        .set(acting(orgA.id))
        .expect(403);
      await api(admin)
        .get(`/students/${studentLekki.id}`)
        .set(acting(orgA.id))
        .expect(200);
    });

    test('case 6: no session answers 401 even with acting headers', async ({
      api,
      app,
      createUser,
      createOrganization,
      createCampus,
      addMember,
    }) => {
      const { orgA } = await twoSchools({
        app,
        createUser,
        createOrganization,
        createCampus,
        addMember,
      });
      await api().get('/students').set(acting(orgA.id)).expect(401);
    });

    test('case 7: another school’s campus answers 404 while acting in A', async ({
      api,
      app,
      pool,
      createUser,
      createOrganization,
      createCampus,
      addMember,
      makeSuperAdmin,
    }) => {
      const { orgA, campusB } = await twoSchools({
        app,
        createUser,
        createOrganization,
        createCampus,
        addMember,
      });
      const admin = await makeSuperAdmin(await createUser());
      const filtered = await api(admin)
        .get(`/students?campusId=${campusB.id}`)
        .set(acting(orgA.id))
        .expect(404);
      expect(filtered.body.message).toBe('Campus not found');
      const created = await api(admin)
        .post('/students')
        .set(acting(orgA.id, REASON))
        .send({
          campusId: campusB.id,
          fullName: 'Across Schools',
          admissionNumber: 'ADM-2000',
        })
        .expect(404);
      expect(created.body.message).toBe('Campus not found');
      await waitForAuditRows(pool, { kind: 'acting' }, 2);
    });

    test('case 12: acting writes without a reason answer 403', async ({
      api,
      app,
      createUser,
      createOrganization,
      createCampus,
      addMember,
      makeSuperAdmin,
    }) => {
      const { orgA, lekki } = await twoSchools({
        app,
        createUser,
        createOrganization,
        createCampus,
        addMember,
      });
      const admin = await makeSuperAdmin(await createUser());
      const res = await api(admin)
        .post('/students')
        .set(acting(orgA.id))
        .send({
          campusId: lekki.id,
          fullName: 'No Reason',
          admissionNumber: 'ADM-1000',
        })
        .expect(403);
      expect(res.body).toMatchObject({ code: 'ActingReadOnly' });
    });
  });
});
