import { randomUUID } from 'node:crypto';
import { baseTest as test, expect, PASSWORD } from './support/base-test';

test.describe('health', () => {
  test('answers 200 without authentication', async ({ api }) => {
    const res = await api().get('/health').expect(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});

test.describe('authentication', () => {
  test('sign-up signs the user in and sets an httpOnly lax cookie', async ({
    api,
  }) => {
    const res = await api()
      .post('/api/auth/sign-up/email')
      .send({ name: 'Ada', email: 'ada@example.test', password: PASSWORD })
      .expect(200);

    const cookies = [res.headers['set-cookie']].flat().join(';');
    expect(cookies).toMatch(/session_token=/);
    expect(cookies).toMatch(/HttpOnly/i);
    expect(cookies).toMatch(/SameSite=Lax/i);

    const session = await api({
      cookie: [res.headers['set-cookie']]
        .flat()
        .map((c) => c?.split(';')[0])
        .join('; '),
    })
      .get('/api/auth/get-session')
      .expect(200);
    expect(session.body.user.email).toBe('ada@example.test');
  });

  test('sign-in works and a wrong password is rejected with 401', async ({
    api,
    signUp,
  }) => {
    const user = await signUp();
    await api()
      .post('/api/auth/sign-in/email')
      .send({ email: user.email, password: user.password })
      .expect(200);
    await api()
      .post('/api/auth/sign-in/email')
      .send({ email: user.email, password: 'wrong-password-123' })
      .expect(401);
  });

  test('school routes answer 401 without a session', async ({ api }) => {
    for (const path of [
      '/students',
      '/campuses',
      '/fee-schedules',
      '/school-account',
    ]) {
      const res = await api().get(path).expect(401);
      expect(res.body).toMatchObject({ code: 'Unauthorized' });
    }
  });

  test('/me needs a session but not a school', async ({
    api,
    signUp,
    createOrganization,
  }) => {
    await api().get('/me').expect(401);

    const user = await signUp();
    const bare = await api(user).get('/me').expect(200);
    expect(bare.body).toMatchObject({
      user: { id: user.id, email: user.email },
      activeOrganizationId: null,
    });

    const org = await createOrganization(user);
    const withSchool = await api(user).get('/me').expect(200);
    expect(withSchool.body.activeOrganizationId).toBe(org.id);
  });

  test('a signed-in user with no school gets 403, not data', async ({
    api,
    signUp,
  }) => {
    const user = await signUp();
    const res = await api(user).get('/students').expect(403);
    expect(res.body).toMatchObject({ code: 'Forbidden' });
  });

  test('banned users are unauthenticated and cannot sign in', async ({
    api,
    signUp,
    promoteToAdmin,
  }) => {
    const admin = await promoteToAdmin(await signUp());
    const victim = await signUp();
    await api(victim).get('/api/auth/get-session').expect(200);

    await api(admin)
      .post('/api/auth/admin/ban-user')
      .send({ userId: victim.id, banReason: 'test' })
      .expect(200);

    await api(victim).get('/campuses').expect(401);
    await api()
      .post('/api/auth/sign-in/email')
      .send({ email: victim.email, password: victim.password })
      .expect(403);
  });
});

test.describe('validation and not found', () => {
  test('rejects a malformed body with 400 and field issues', async ({
    api,
    signUp,
    createOrganization,
    createCampus,
  }) => {
    const owner = await signUp();
    const org = await createOrganization(owner);
    await createCampus(org);

    const res = await api(owner)
      .post('/students')
      .send({ fullName: '', admissionNumber: 42 })
      .expect(400);
    expect(res.body.code).toBe('ValidationError');
    expect(res.body.issues.map((i: { path: string }) => i.path)).toEqual(
      expect.arrayContaining(['fullName', 'admissionNumber'])
    );
  });

  test('rejects a malformed id with 400 and an unknown id with 404', async ({
    api,
    signUp,
    createOrganization,
  }) => {
    const owner = await signUp();
    await createOrganization(owner);
    await api(owner).get('/students/not-a-uuid').expect(400);
    const res = await api(owner).get(`/students/${randomUUID()}`).expect(404);
    expect(res.body).toMatchObject({ code: 'NotFound' });
  });
});
