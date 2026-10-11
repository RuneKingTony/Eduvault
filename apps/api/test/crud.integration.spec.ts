import { createStudent } from './support/factories/students';
import { baseTest as test, expect } from './support/base-test';

test.describe('campuses', () => {
  test('full CRUD, with details in the domain table and the name in the team', async ({
    api,
    createUser,
    createOrganization,
    pool,
  }) => {
    const owner = await createUser();
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
    app,
    createUser,
    createOrganization,
    createCampus,
  }) => {
    const owner = await createUser();
    const org = await createOrganization(owner);
    const campus = await createCampus(org);
    await createStudent(app, owner, { campusId: campus.id });

    const res = await api(owner).delete(`/campuses/${campus.id}`).expect(409);
    expect(res.body.code).toBe('Conflict');
  });

  test('only roles with the team permission can create or edit campuses', async ({
    api,
    createUser,
    createOrganization,
    createCampus,
    addMember,
  }) => {
    const owner = await createUser();
    const org = await createOrganization(owner);
    const campus = await createCampus(org);
    const teacher = await addMember(org, await createUser(), {
      roles: ['teacher'],
      campuses: [campus],
    });
    const administrator = await addMember(org, await createUser(), {
      roles: ['administrator'],
    });

    await api(teacher).post('/campuses').send({ name: 'X' }).expect(403);
    await api(teacher)
      .patch(`/campuses/${campus.id}`)
      .send({ name: 'Y' })
      .expect(403);
    await api(administrator)
      .post('/campuses')
      .send({ name: 'Annex' })
      .expect(201);
    await api(administrator).delete(`/campuses/${campus.id}`).expect(403);
  });
});

test.describe('school account', () => {
  test('one account per school, readable and editable, with no create or delete', async ({
    api,
    createUser,
    createOrganization,
  }) => {
    const owner = await createUser();
    const org = await createOrganization(owner, 'Fees');

    const read = await api(owner).get('/school-account').expect(200);
    expect(read.body).toMatchObject({
      organizationId: org.id,
      name: 'Fees',
      currency: 'NGN',
      admissionPrefix: 'TST',
      slug: org.slug,
      city: null,
      address: null,
      phone: null,
      email: null,
      logoFileId: null,
      logoUrl: null,
    });

    const updated = await api(owner)
      .patch('/school-account')
      .send({ name: 'Tuition', city: 'Lagos', phone: '0801', email: '' })
      .expect(200);
    expect(updated.body).toMatchObject({
      name: 'Tuition',
      city: 'Lagos',
      phone: '0801',
      email: null,
    });
    expect((await api(owner).get('/school-account').expect(200)).body.id).toBe(
      read.body.id
    );

    await api(owner).post('/school-account').send({}).expect(404);
    await api(owner).delete('/school-account').expect(404);
  });
});

test.describe('fee schedules', () => {
  test('full CRUD; a null campus applies to the whole school', async ({
    api,
    createUser,
    createOrganization,
    createCampus,
  }) => {
    const owner = await createUser();
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
    createUser,
    createOrganization,
    createCampus,
  }) => {
    const ownerA = await createUser();
    const ownerB = await createUser();
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
  test('admit, read and correct a student; there is no delete', async ({
    api,
    app,
    createUser,
    createOrganization,
    createCampus,
  }) => {
    const owner = await createUser();
    const org = await createOrganization(owner);
    const campus = await createCampus(org);

    const student = await createStudent(app, owner, {
      campusId: campus.id,
      firstName: 'Ada',
      lastName: 'Obi',
    });
    expect(student).toMatchObject({
      firstName: 'Ada',
      lastName: 'Obi',
      admissionNumber: 'TST-0001',
      homeCampus: { id: campus.id },
      effectiveCampus: { id: campus.id },
    });
    const second = await createStudent(app, owner, { campusId: campus.id });
    expect(second.admissionNumber).toBe('TST-0002');

    const listed = await api(owner).get('/students').expect(200);
    expect(listed.body.items).toHaveLength(2);
    expect(listed.body.total).toBe(2);
    expect(
      (await api(owner).get(`/students/${student.id}`).expect(200)).body.id
    ).toBe(student.id);

    const changed = await api(owner)
      .patch(`/students/${student.id}`)
      .send({ firstName: 'Adaeze', lastName: 'Okafor' })
      .expect(200);
    expect(changed.body).toMatchObject({
      firstName: 'Adaeze',
      lastName: 'Okafor',
      admissionNumber: 'TST-0001',
    });
    await api(owner)
      .patch(`/students/${student.id}`)
      .send({ campusId: campus.id })
      .expect(400);

    await api(owner).delete(`/students/${student.id}`).expect(404);
    await api(owner).get(`/students/${student.id}`).expect(200);
  });
});
