import { baseTest as test, expect } from './support/base-test';

const student = (campusId: string, n: string) => ({
  campusId,
  fullName: `Student ${n}`,
  admissionNumber: `ADM-${n}`,
});

test.describe('school isolation', () => {
  test('school A cannot read or change school B data', async ({
    api,
    signUp,
    createOrganization,
    createCampus,
  }) => {
    const ownerA = await signUp();
    const ownerB = await signUp();
    const orgA = await createOrganization(ownerA, 'School A');
    const orgB = await createOrganization(ownerB, 'School B');
    const campusA = await createCampus(orgA);
    const campusB = await createCampus(orgB);
    const studentB = (
      await api(ownerB)
        .post('/students')
        .send(student(campusB.id, 'B1'))
        .expect(201)
    ).body;
    const feeB = (
      await api(ownerB)
        .post('/fee-schedules')
        .send({ name: 'B fee', amountMinor: 10, currency: 'NGN' })
        .expect(201)
    ).body;
    await api(ownerB)
      .post('/school-account')
      .send({ name: 'B account', currency: 'NGN' })
      .expect(201);
    await api(ownerA)
      .post('/students')
      .send(student(campusA.id, 'A1'))
      .expect(201);

    expect((await api(ownerA).get('/students').expect(200)).body).toHaveLength(
      1
    );
    await api(ownerA).get(`/students/${studentB.id}`).expect(404);
    await api(ownerA)
      .patch(`/students/${studentB.id}`)
      .send({ fullName: 'x' })
      .expect(404);
    await api(ownerA).delete(`/students/${studentB.id}`).expect(404);
    await api(ownerA).get(`/campuses/${campusB.id}`).expect(404);
    await api(ownerA).get(`/fee-schedules/${feeB.id}`).expect(404);
    await api(ownerA).get('/school-account').expect(404);
    expect((await api(ownerA).get('/campuses').expect(200)).body).toHaveLength(
      1
    );
    expect(
      (await api(ownerA).get('/fee-schedules').expect(200)).body
    ).toHaveLength(0);

    await api(ownerB).get(`/students/${studentB.id}`).expect(200);
  });

  test('a user in both schools sees only the active one', async ({
    api,
    signUp,
    createOrganization,
    createCampus,
    addMember,
    setActiveOrganization,
  }) => {
    const ownerA = await signUp();
    const ownerB = await signUp();
    const orgA = await createOrganization(ownerA, 'School A');
    const orgB = await createOrganization(ownerB, 'School B');
    const campusA = await createCampus(orgA);
    const campusB = await createCampus(orgB);
    const studentA = (
      await api(ownerA)
        .post('/students')
        .send(student(campusA.id, 'A1'))
        .expect(201)
    ).body;
    const studentB = (
      await api(ownerB)
        .post('/students')
        .send(student(campusB.id, 'B1'))
        .expect(201)
    ).body;

    let both = await addMember(orgA, await signUp(), 'admin');
    both = await addMember(orgB, both, 'admin');
    await setActiveOrganization(both, orgA.id);

    const list = (await api(both).get('/students').expect(200)).body;
    expect(list.map((s: { id: string }) => s.id)).toEqual([studentA.id]);
    await api(both).get(`/students/${studentB.id}`).expect(404);
    await api(both)
      .post('/students')
      .send(student(campusB.id, 'X'))
      .expect(404);

    await setActiveOrganization(both, orgB.id);
    const switched = (await api(both).get('/students').expect(200)).body;
    expect(switched.map((s: { id: string }) => s.id)).toEqual([studentB.id]);
    await api(both).get(`/students/${studentA.id}`).expect(404);
  });
});

test.describe('campus isolation', () => {
  test('a teacher sees only their campus; owners and admins see all', async ({
    api,
    signUp,
    createOrganization,
    createCampus,
    addMember,
  }) => {
    const owner = await signUp();
    const org = await createOrganization(owner);
    const campus1 = await createCampus(org, 'Campus 1');
    const campus2 = await createCampus(org, 'Campus 2');
    const s1 = (
      await api(owner)
        .post('/students')
        .send(student(campus1.id, '1'))
        .expect(201)
    ).body;
    const s2 = (
      await api(owner)
        .post('/students')
        .send(student(campus2.id, '2'))
        .expect(201)
    ).body;
    const teacher = await addMember(org, await signUp(), 'teacher', {
      campuses: [campus1],
    });
    const admin = await addMember(org, await signUp(), 'admin');

    const own = (await api(teacher).get('/students').expect(200)).body;
    expect(own.map((s: { id: string }) => s.id)).toEqual([s1.id]);
    await api(teacher).get(`/students/${s1.id}`).expect(200);
    await api(teacher).get(`/students/${s2.id}`).expect(404);
    await api(teacher).get(`/students?campusId=${campus2.id}`).expect(404);
    await api(teacher).get(`/campuses/${campus2.id}`).expect(404);
    const campuses = (await api(teacher).get('/campuses').expect(200)).body;
    expect(campuses.map((c: { id: string }) => c.id)).toEqual([campus1.id]);

    for (const user of [owner, admin]) {
      const all = (await api(user).get('/students').expect(200)).body;
      expect(all).toHaveLength(2);
      await api(user).get(`/students/${s2.id}`).expect(200);
    }
  });

  test('fee schedules: school-wide ones reach every campus, campus ones do not leak', async ({
    api,
    signUp,
    createOrganization,
    createCampus,
    addMember,
  }) => {
    const owner = await signUp();
    const org = await createOrganization(owner);
    const campus1 = await createCampus(org, 'Campus 1');
    const campus2 = await createCampus(org, 'Campus 2');
    const post = (body: object) =>
      api(owner).post('/fee-schedules').send(body).expect(201);
    await post({ name: 'Everyone', amountMinor: 1, currency: 'NGN' });
    await post({
      name: 'Only 1',
      amountMinor: 2,
      currency: 'NGN',
      campusId: campus1.id,
    });
    await post({
      name: 'Only 2',
      amountMinor: 3,
      currency: 'NGN',
      campusId: campus2.id,
    });
    const teacher = await addMember(org, await signUp(), 'teacher', {
      campuses: [campus1],
    });

    const seen = (await api(teacher).get('/fee-schedules').expect(200)).body;
    expect(seen.map((f: { name: string }) => f.name)).toEqual([
      'Everyone',
      'Only 1',
    ]);
  });
});

test.describe('role per school', () => {
  test('the same user is a teacher in A and an admin in B', async ({
    api,
    signUp,
    createOrganization,
    createCampus,
    addMember,
    setActiveOrganization,
  }) => {
    const ownerA = await signUp();
    const ownerB = await signUp();
    const orgA = await createOrganization(ownerA, 'School A');
    const orgB = await createOrganization(ownerB, 'School B');
    const campusA = await createCampus(orgA);
    const campusB = await createCampus(orgB);
    await api(ownerA)
      .post('/school-account')
      .send({ name: 'A', currency: 'NGN' })
      .expect(201);
    await api(ownerB)
      .post('/school-account')
      .send({ name: 'B', currency: 'NGN' })
      .expect(201);

    let user = await addMember(orgA, await signUp(), 'teacher', {
      campuses: [campusA],
    });
    user = await addMember(orgB, user, 'admin');

    await setActiveOrganization(user, orgA.id);
    await api(user).get('/students').expect(200);
    await api(user)
      .post('/students')
      .send(student(campusA.id, 'T'))
      .expect(403);
    await api(user).get('/school-account').expect(403);

    await setActiveOrganization(user, orgB.id);
    await api(user)
      .post('/students')
      .send(student(campusB.id, 'T'))
      .expect(201);
    await api(user).get('/school-account').expect(200);

    await setActiveOrganization(user, orgA.id);
    await api(user)
      .post('/students')
      .send(student(campusA.id, 'T2'))
      .expect(403);
  });

  test('the student role reads fee schedules but nothing about students', async ({
    api,
    signUp,
    createOrganization,
    addMember,
  }) => {
    const owner = await signUp();
    const org = await createOrganization(owner);
    const learner = await addMember(org, await signUp(), 'student');
    await api(learner).get('/fee-schedules').expect(200);
    await api(learner).get('/students').expect(403);
    await api(learner).get('/school-account').expect(403);
  });
});

test.describe('active school and campus', () => {
  test('a new session defaults to the first school and its first campus', async ({
    api,
    signUp,
    signIn,
    createOrganization,
    createCampus,
    addMember,
  }) => {
    const ownerA = await signUp();
    const ownerB = await signUp();
    const orgA = await createOrganization(ownerA, 'School A');
    const orgB = await createOrganization(ownerB, 'School B');
    const campusA = await createCampus(orgA, 'A campus');
    const campusB = await createCampus(orgB, 'B campus');

    const user = await signUp();
    const before = await api(user).get('/api/auth/get-session').expect(200);
    expect(before.body.session.activeOrganizationId ?? null).toBeNull();

    await addMember(orgA, user, 'teacher', { campuses: [campusA] });
    await addMember(orgB, user, 'teacher', { campuses: [campusB] });
    await signIn(user);

    const after = await api(user).get('/api/auth/get-session').expect(200);
    expect(after.body.session.activeOrganizationId).toBe(orgA.id);
    expect(after.body.session.activeTeamId).toBe(campusA.id);
  });

  test('setActive switches the school the routes act in', async ({
    api,
    signUp,
    createOrganization,
    createCampus,
    addMember,
    setActiveOrganization,
    setActiveCampus,
  }) => {
    const ownerA = await signUp();
    const ownerB = await signUp();
    const orgA = await createOrganization(ownerA, 'School A');
    const orgB = await createOrganization(ownerB, 'School B');
    const a1 = await createCampus(orgA, 'A1');
    const a2 = await createCampus(orgA, 'A2');
    await createCampus(orgB, 'B1');

    let user = await addMember(orgA, await signUp(), 'teacher', {
      campuses: [a1, a2],
    });
    user = await addMember(orgB, user, 'teacher');

    expect((await api(user).get('/campuses').expect(200)).body).toHaveLength(2);

    await setActiveCampus(user, a2.id);
    const active = await api(user).get('/api/auth/get-session').expect(200);
    expect(active.body.session.activeTeamId).toBe(a2.id);

    await setActiveOrganization(user, orgB.id);
    const campusesB = (await api(user).get('/campuses').expect(200)).body;
    expect(campusesB).toEqual([]);
    const switched = await api(user).get('/api/auth/get-session').expect(200);
    expect(switched.body.session.activeOrganizationId).toBe(orgB.id);
  });
});
