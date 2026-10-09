import { randomUUID } from 'node:crypto';
import { baseTest as test, expect } from './support/base-test';

test.describe('campuses', () => {
  test('full CRUD, with details in the domain table and the name in the team', async ({
    api,
    signUp,
    createOrganization,
    pool,
  }) => {
    const owner = await signUp();
    const org = await createOrganization(owner);

    const created = await api(owner)
      .post('/campuses')
      .send({ name: 'Main', address: '1 School Road' })
      .expect(201);
    expect(created.body).toMatchObject({
      name: 'Main',
      address: '1 School Road',
      organizationId: org.id,
    });
    const id = created.body.id as string;

    const team = await pool.query('SELECT name FROM team WHERE id = $1', [id]);
    expect(team.rows[0]).toEqual({ name: 'Main' });

    expect((await api(owner).get('/campuses').expect(200)).body).toHaveLength(
      1
    );
    expect((await api(owner).get(`/campuses/${id}`).expect(200)).body.id).toBe(
      id
    );

    const updated = await api(owner)
      .patch(`/campuses/${id}`)
      .send({ name: 'Main Campus', address: null })
      .expect(200);
    expect(updated.body).toMatchObject({ name: 'Main Campus', address: null });

    await api(owner).delete(`/campuses/${id}`).expect(200);
    await api(owner).get(`/campuses/${id}`).expect(404);
  });

  test('refuses to delete a campus that still has students', async ({
    api,
    signUp,
    createOrganization,
    createCampus,
  }) => {
    const owner = await signUp();
    const org = await createOrganization(owner);
    const campus = await createCampus(org);
    await api(owner)
      .post('/students')
      .send({ campusId: campus.id, fullName: 'Ada', admissionNumber: 'A1' })
      .expect(201);

    const res = await api(owner).delete(`/campuses/${campus.id}`).expect(409);
    expect(res.body.code).toBe('Conflict');
  });

  test('only roles with the team permission can create or edit campuses', async ({
    api,
    signUp,
    createOrganization,
    createCampus,
    addMember,
  }) => {
    const owner = await signUp();
    const org = await createOrganization(owner);
    const campus = await createCampus(org);
    const teacher = await addMember(org, await signUp(), {
      role: 'teacher',
      campuses: [campus],
    });
    const admin = await addMember(org, await signUp(), { role: 'admin' });

    await api(teacher).post('/campuses').send({ name: 'X' }).expect(403);
    await api(teacher)
      .patch(`/campuses/${campus.id}`)
      .send({ name: 'Y' })
      .expect(403);
    await api(admin).post('/campuses').send({ name: 'Annex' }).expect(201);
  });
});

test.describe('school account', () => {
  test('full CRUD, one account per school', async ({
    api,
    signUp,
    createOrganization,
  }) => {
    const owner = await signUp();
    await createOrganization(owner);

    await api(owner).get('/school-account').expect(404);
    const created = await api(owner)
      .post('/school-account')
      .send({ name: 'Fees', currency: 'ngn' })
      .expect(201);
    expect(created.body).toMatchObject({ name: 'Fees', currency: 'NGN' });

    await api(owner)
      .post('/school-account')
      .send({ name: 'Second', currency: 'NGN' })
      .expect(409);

    const updated = await api(owner)
      .patch('/school-account')
      .send({ name: 'Tuition' })
      .expect(200);
    expect(updated.body.name).toBe('Tuition');
    expect((await api(owner).get('/school-account').expect(200)).body.id).toBe(
      created.body.id
    );

    await api(owner).delete('/school-account').expect(200);
    await api(owner).get('/school-account').expect(404);
  });
});

test.describe('fee schedules', () => {
  test('full CRUD; a null campus applies to the whole school', async ({
    api,
    signUp,
    createOrganization,
    createCampus,
  }) => {
    const owner = await signUp();
    const org = await createOrganization(owner);
    const campus = await createCampus(org);

    const everywhere = await api(owner)
      .post('/fee-schedules')
      .send({ name: 'Tuition', amountMinor: 150_000, currency: 'NGN' })
      .expect(201);
    expect(everywhere.body.campusId).toBeNull();

    const scoped = await api(owner)
      .post('/fee-schedules')
      .send({
        name: 'Lab',
        amountMinor: 2500,
        currency: 'NGN',
        campusId: campus.id,
      })
      .expect(201);
    expect(scoped.body.campusId).toBe(campus.id);

    const list = await api(owner)
      .get(`/fee-schedules?campusId=${campus.id}`)
      .expect(200);
    expect(list.body.map((f: { name: string }) => f.name)).toEqual([
      'Lab',
      'Tuition',
    ]);

    const updated = await api(owner)
      .patch(`/fee-schedules/${scoped.body.id}`)
      .send({ amountMinor: 3000, campusId: null })
      .expect(200);
    expect(updated.body).toMatchObject({ amountMinor: 3000, campusId: null });

    await api(owner).delete(`/fee-schedules/${scoped.body.id}`).expect(200);
    await api(owner).get(`/fee-schedules/${scoped.body.id}`).expect(404);
  });

  test('rejects a campus from another school', async ({
    api,
    signUp,
    createOrganization,
    createCampus,
  }) => {
    const ownerA = await signUp();
    const ownerB = await signUp();
    await createOrganization(ownerA);
    const orgB = await createOrganization(ownerB);
    const campusB = await createCampus(orgB);

    await api(ownerA)
      .post('/fee-schedules')
      .send({
        name: 'Sneaky',
        amountMinor: 1,
        currency: 'NGN',
        campusId: campusB.id,
      })
      .expect(404);
  });
});

test.describe('students', () => {
  test('full CRUD; the active campus is the default for new students', async ({
    api,
    signUp,
    createOrganization,
    createCampus,
    setActiveCampus,
  }) => {
    const owner = await signUp();
    const org = await createOrganization(owner);
    const campus = await createCampus(org);
    const other = await createCampus(org, 'Annex');

    await api(owner)
      .post('/students')
      .send({ fullName: 'No Campus', admissionNumber: 'N0' })
      .expect(400);

    await setActiveCampus(owner, campus.id);
    const defaulted = await api(owner)
      .post('/students')
      .send({ fullName: 'Default Campus', admissionNumber: 'D1' })
      .expect(201);
    expect(defaulted.body.campusId).toBe(campus.id);
    await api(owner).delete(`/students/${defaulted.body.id}`).expect(200);

    const created = await api(owner)
      .post('/students')
      .send({ campusId: campus.id, fullName: 'Ada Obi', admissionNumber: 'A1' })
      .expect(201);
    expect(created.body).toMatchObject({
      fullName: 'Ada Obi',
      campusId: campus.id,
      organizationId: org.id,
    });
    const id = created.body.id as string;

    await api(owner)
      .post('/students')
      .send({ campusId: campus.id, fullName: 'Dup', admissionNumber: 'A1' })
      .expect(409);

    expect((await api(owner).get('/students').expect(200)).body).toHaveLength(
      1
    );
    expect((await api(owner).get(`/students/${id}`).expect(200)).body.id).toBe(
      id
    );

    const moved = await api(owner)
      .patch(`/students/${id}`)
      .send({ campusId: other.id, fullName: 'Ada Okafor' })
      .expect(200);
    expect(moved.body).toMatchObject({
      campusId: other.id,
      fullName: 'Ada Okafor',
    });

    await api(owner).delete(`/students/${id}`).expect(200);
    await api(owner).get(`/students/${id}`).expect(404);
    await api(owner).delete(`/students/${randomUUID()}`).expect(404);
  });
});
