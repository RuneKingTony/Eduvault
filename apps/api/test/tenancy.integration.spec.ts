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

const ids = (rows: { id: string }[]) =>
  rows.map((row) => row.id).toSorted((a, b) => a.localeCompare(b));

test.describe('students', () => {
  test.describe('isolation', () => {
    test('1: another school reads and updates by id as 404', async ({
      api,
      schools: { ownerB, studentLekki },
    }) => {
      await api(ownerB).get(`/students/${studentLekki.id}`).expect(404);
      await api(ownerB)
        .patch(`/students/${studentLekki.id}`)
        .send({ fullName: 'x' })
        .expect(404);
    });

    test('2: lists hold no other school; a foreign campus filter is 404', async ({
      api,
      schools: { owner, lekkiOnly, campusB, studentLekki, studentIkeja },
    }) => {
      const list = (await api(owner).get('/students').expect(200)).body;
      expect(ids(list)).toEqual(ids([studentLekki, studentIkeja]));

      for (const user of [owner, lekkiOnly]) {
        const res = await api(user)
          .get(`/students?campusId=${campusB.id}`)
          .expect(404);
        expect(res.body.message).toBe('Campus not found');
      }
    });

    test('3: a Lekki-only member gets 404 for Ikeja and cannot write', async ({
      api,
      schools: { lekkiOnly, ikeja, studentLekki, studentIkeja },
    }) => {
      await api(lekkiOnly).get(`/students/${studentIkeja.id}`).expect(404);
      await api(lekkiOnly).get(`/students?campusId=${ikeja.id}`).expect(404);
      await api(lekkiOnly)
        .patch(`/students/${studentLekki.id}`)
        .send({ fullName: 'x' })
        .expect(403);
    });

    test('4: a Lekki-only member lists only Lekki students', async ({
      api,
      schools: { lekkiOnly, studentLekki },
    }) => {
      const list = (await api(lekkiOnly).get('/students').expect(200)).body;
      expect(ids(list)).toEqual([studentLekki.id]);
    });

    test('5: a member without the student permission gets 403', async ({
      api,
      schools: { noPermission, lekki, studentLekki },
    }) => {
      await api(noPermission).get('/students').expect(403);
      await api(noPermission).get(`/students/${studentLekki.id}`).expect(403);
      await api(noPermission)
        .post('/students')
        .send(student(lekki.id, 'N'))
        .expect(403);
      await api(noPermission)
        .patch(`/students/${studentLekki.id}`)
        .send({ fullName: 'x' })
        .expect(403);
    });

    test('6: no session answers 401', async ({
      api,
      schools: { lekki, studentLekki },
    }) => {
      await api().get('/students').expect(401);
      await api().get(`/students/${studentLekki.id}`).expect(401);
      await api().post('/students').send(student(lekki.id, 'N')).expect(401);
      await api()
        .patch(`/students/${studentLekki.id}`)
        .send({ fullName: 'x' })
        .expect(401);
    });

    test('7: a cross-school campus answers 404 and the composite foreign key refuses a bypass', async ({
      api,
      pool,
      schools: { owner, ownerB, orgA, lekki, campusB, studentLekki },
    }) => {
      await api(owner)
        .post('/students')
        .send(student(campusB.id, 'X'))
        .expect(404);
      await api(ownerB)
        .post('/students')
        .send(student(lekki.id, 'Y'))
        .expect(404);
      await api(owner)
        .patch(`/students/${studentLekki.id}`)
        .send({ campusId: campusB.id })
        .expect(404);

      await expect(
        pool.query(
          `INSERT INTO student (organization_id, campus_id, full_name, admission_number)
           VALUES ($1, $2, 'Raw', 'RAW-1')`,
          [orgA.id, campusB.id]
        )
      ).rejects.toMatchObject({ code: '23503' });
    });
  });

  test('a user in both schools sees only the active one', async ({
    api,
    createUser,
    createOrganization,
    createCampus,
    addMember,
    setActiveOrganization,
  }) => {
    const ownerA = await createUser();
    const ownerB = await createUser();
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

    let both = await addMember(orgA, await createUser(), {
      roles: ['administrator'],
    });
    both = await addMember(orgB, both, { roles: ['administrator'] });
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

test.describe('campuses', () => {
  test.describe('isolation', () => {
    test('1: another school reads, updates and deletes by id as 404, and lists hold none of it', async ({
      api,
      schools: { ownerB, lekki },
    }) => {
      await api(ownerB).get(`/campuses/${lekki.id}`).expect(404);
      await api(ownerB)
        .patch(`/campuses/${lekki.id}`)
        .send({ name: 'x' })
        .expect(404);
      await api(ownerB).delete(`/campuses/${lekki.id}`).expect(404);
      const listB = (await api(ownerB).get('/campuses').expect(200)).body;
      expect(listB.map((c: { id: string }) => c.id)).not.toContain(lekki.id);
    });

    test('2: lists hold no other school', async ({
      api,
      schools: { owner, lekki, ikeja },
    }) => {
      const list = (await api(owner).get('/campuses').expect(200)).body;
      expect(ids(list)).toEqual(ids([lekki, ikeja]));
    });

    test('3: a Lekki-only member gets 404 for Ikeja and cannot write', async ({
      api,
      schools: { lekkiOnly, lekki, ikeja },
    }) => {
      await api(lekkiOnly).get(`/campuses/${ikeja.id}`).expect(404);
      await api(lekkiOnly)
        .patch(`/campuses/${lekki.id}`)
        .send({ name: 'x' })
        .expect(403);
      await api(lekkiOnly).delete(`/campuses/${lekki.id}`).expect(403);
    });

    test('4: a Lekki-only member lists only Lekki', async ({
      api,
      schools: { lekkiOnly, lekki },
    }) => {
      const list = (await api(lekkiOnly).get('/campuses').expect(200)).body;
      expect(ids(list)).toEqual([lekki.id]);
    });

    test('5: a member without the team permission cannot write', async ({
      api,
      schools: { noPermission, lekki },
    }) => {
      await api(noPermission).post('/campuses').send({ name: 'x' }).expect(403);
      await api(noPermission)
        .patch(`/campuses/${lekki.id}`)
        .send({ name: 'x' })
        .expect(403);
      await api(noPermission).delete(`/campuses/${lekki.id}`).expect(403);
    });

    test('6: no session answers 401', async ({ api, schools: { lekki } }) => {
      await api().get('/campuses').expect(401);
      await api().get(`/campuses/${lekki.id}`).expect(401);
      await api().post('/campuses').send({ name: 'x' }).expect(401);
      await api()
        .patch(`/campuses/${lekki.id}`)
        .send({ name: 'x' })
        .expect(401);
      await api().delete(`/campuses/${lekki.id}`).expect(401);
    });
  });

  test('fee schedules: school-wide ones reach every campus, campus ones do not leak', async ({
    api,
    createUser,
    createOrganization,
    createCampus,
    withPermissions,
  }) => {
    const owner = await createUser();
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
    const reader = await withPermissions(org, ['feeSchedule:read'], {
      campuses: [campus1],
    });

    const seen = (await api(reader).get('/fee-schedules').expect(200)).body;
    expect(seen.map((f: { name: string }) => f.name)).toEqual([
      'Everyone',
      'Only 1',
    ]);
  });
});

test.describe('fee schedules', () => {
  test.describe('isolation', () => {
    test('1 and 2: another school reads and updates by id as 404 and lists hold none of it', async ({
      api,
      schools: { owner, ownerB },
    }) => {
      const fee = (
        await api(owner)
          .post('/fee-schedules')
          .send({ name: 'Tuition', amountMinor: 1, currency: 'NGN' })
          .expect(201)
      ).body;
      await api(ownerB).get(`/fee-schedules/${fee.id}`).expect(404);
      await api(ownerB)
        .patch(`/fee-schedules/${fee.id}`)
        .send({ name: 'x' })
        .expect(404);
      await api(ownerB).delete(`/fee-schedules/${fee.id}`).expect(404);
      expect(
        (await api(ownerB).get('/fee-schedules').expect(200)).body
      ).toEqual([]);
    });

    test('2: a campus filter naming another school answers 404', async ({
      api,
      schools: { owner, campusB },
    }) => {
      await api(owner).get(`/fee-schedules?campusId=${campusB.id}`).expect(404);
    });

    test('5: members without the feeSchedule permission get 403', async ({
      api,
      schools: { noPermission, lekkiOnly },
    }) => {
      for (const user of [noPermission, lekkiOnly]) {
        await api(user).get('/fee-schedules').expect(403);
      }
    });

    test('6: no session answers 401', async ({ api }) => {
      await api().get('/fee-schedules').expect(401);
    });
  });
});

test.describe('school account', () => {
  test.describe('isolation', () => {
    const account = {
      name: 'A fees',
      currency: 'NGN',
      admissionPrefix: 'AAA',
    };

    test('1: another school sees none of the account and only its own', async ({
      api,
      schools: { owner, ownerB, orgB },
    }) => {
      await api(owner).post('/school-account').send(account).expect(201);
      await api(ownerB).get('/school-account').expect(404);
      await api(ownerB)
        .patch('/school-account')
        .send({ name: 'x' })
        .expect(404);
      await api(ownerB).delete('/school-account').expect(404);

      await api(ownerB)
        .post('/school-account')
        .send({ name: 'B fees', currency: 'NGN', admissionPrefix: 'BBB' })
        .expect(201);
      const own = (await api(ownerB).get('/school-account').expect(200)).body;
      expect(own.organizationId).toBe(orgB.id);
      expect(own.name).toBe('B fees');
    });

    test('5: members without the schoolAccount permission get 403', async ({
      api,
      schools: { owner, noPermission, lekkiOnly },
    }) => {
      await api(owner).post('/school-account').send(account).expect(201);
      for (const user of [noPermission, lekkiOnly]) {
        await api(user).get('/school-account').expect(403);
        await api(user).post('/school-account').send(account).expect(403);
        await api(user)
          .patch('/school-account')
          .send({ name: 'x' })
          .expect(403);
        await api(user).delete('/school-account').expect(403);
      }
    });

    test('6: no session answers 401', async ({ api }) => {
      await api().get('/school-account').expect(401);
      await api().post('/school-account').send(account).expect(401);
      await api().patch('/school-account').send({ name: 'x' }).expect(401);
      await api().delete('/school-account').expect(401);
    });
  });
});

test.describe('role per school', () => {
  test('the same user is a teacher in A and an administrator in B', async ({
    api,
    createUser,
    createOrganization,
    createCampus,
    addMember,
    setActiveOrganization,
  }) => {
    const ownerA = await createUser();
    const ownerB = await createUser();
    const orgA = await createOrganization(ownerA, 'School A');
    const orgB = await createOrganization(ownerB, 'School B');
    const campusA = await createCampus(orgA);
    const campusB = await createCampus(orgB);
    await api(ownerA)
      .post('/school-account')
      .send({ name: 'A', currency: 'NGN', admissionPrefix: 'AAA' })
      .expect(201);
    await api(ownerB)
      .post('/school-account')
      .send({ name: 'B', currency: 'NGN', admissionPrefix: 'BBB' })
      .expect(201);

    let user = await addMember(orgA, await createUser(), {
      roles: ['teacher'],
      campuses: [campusA],
    });
    user = await addMember(orgB, user, { roles: ['administrator'] });

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

  test('the student role holds no staff permission', async ({
    api,
    createUser,
    createOrganization,
    addMember,
  }) => {
    const owner = await createUser();
    const org = await createOrganization(owner);
    const learner = await addMember(org, await createUser(), {
      roles: ['student'],
    });
    await api(learner).get('/fee-schedules').expect(403);
    await api(learner).get('/students').expect(403);
    await api(learner).get('/school-account').expect(403);
  });
});

test.describe('active school and campus', () => {
  test('a new session defaults to the first school and its first campus', async ({
    api,
    createUser,
    signIn,
    createOrganization,
    createCampus,
    addMember,
  }) => {
    const ownerA = await createUser();
    const ownerB = await createUser();
    const orgA = await createOrganization(ownerA, 'School A');
    const orgB = await createOrganization(ownerB, 'School B');
    const campusA = await createCampus(orgA, 'A campus');
    const campusB = await createCampus(orgB, 'B campus');

    const user = await createUser();
    const before = await api(user).get('/api/auth/get-session').expect(200);
    expect(before.body.session.activeOrganizationId ?? null).toBeNull();

    await addMember(orgA, user, { roles: ['teacher'], campuses: [campusA] });
    await addMember(orgB, user, { roles: ['teacher'], campuses: [campusB] });
    await signIn(user);

    const after = await api(user).get('/api/auth/get-session').expect(200);
    expect(after.body.session.activeOrganizationId).toBe(orgA.id);
    expect(after.body.session.activeTeamId).toBe(campusA.id);
  });

  test('setActive switches the school the routes act in', async ({
    api,
    createUser,
    createOrganization,
    createCampus,
    addMember,
    setActiveOrganization,
    setActiveCampus,
  }) => {
    const ownerA = await createUser();
    const ownerB = await createUser();
    const orgA = await createOrganization(ownerA, 'School A');
    const orgB = await createOrganization(ownerB, 'School B');
    const a1 = await createCampus(orgA, 'A1');
    const a2 = await createCampus(orgA, 'A2');
    await createCampus(orgB, 'B1');

    let user = await addMember(orgA, await createUser(), {
      roles: ['teacher'],
      campuses: [a1, a2],
    });
    user = await addMember(orgB, user, { roles: ['teacher'] });

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
