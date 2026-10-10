import { randomUUID } from 'node:crypto';
import { AuthService } from '@thallesp/nestjs-better-auth';
import type { AppAuth } from '../src/app/common/auth';
import { baseTest as test, expect, PASSWORD } from './support/base-test';

test.describe('health', () => {
  test('answers 200 without authentication', async ({ api }) => {
    const res = await api().get('/health').expect(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});

test.describe('authentication', () => {
  test('sign-up is refused over HTTP and through the server API', async ({
    app,
    api,
    pool,
  }) => {
    await api()
      .post('/api/auth/sign-up/email')
      .send({ name: 'Ada', email: 'ada@example.test', password: PASSWORD })
      .expect(400);

    const { api: serverApi } = app.get(AuthService<AppAuth>);
    await expect(
      serverApi.signUpEmail({
        body: { name: 'Ada', email: 'ada@example.test', password: PASSWORD },
      })
    ).rejects.toMatchObject({ statusCode: 400 });

    const { rows } = await pool.query('SELECT id FROM "user"');
    expect(rows).toHaveLength(0);
  });

  test('sign-in sets an httpOnly lax cookie that opens a session', async ({
    api,
    createUser,
  }) => {
    const user = await createUser({ email: 'ada@example.test' });
    const res = await api()
      .post('/api/auth/sign-in/email')
      .send({ email: user.email, password: user.password })
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
    createUser,
  }) => {
    const user = await createUser();
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
      '/school-settings',
      '/campuses/summary',
      '/school/deletable',
    ]) {
      const res = await api().get(path).expect(401);
      expect(res.body).toMatchObject({ code: 'Unauthorized' });
    }
  });

  test('school write and file routes answer 401 without a session', async ({
    api,
  }) => {
    const id = randomUUID();
    const routes = [
      ['post', '/campuses'],
      ['patch', '/school-settings'],
      ['patch', '/school-account'],
      ['put', '/school-account/logo'],
      ['delete', '/school-account/logo'],
      ['delete', '/school'],
      ['get', '/school/handover-candidates'],
      ['post', '/school/handover'],
      ['post', '/files'],
      ['get', `/files/${id}`],
      ['delete', `/files/${id}`],
    ] as const;
    for (const [method, path] of routes) {
      const res = await api()[method](path).expect(401);
      expect(res.body, `${method} ${path}`).toMatchObject({
        code: 'Unauthorized',
      });
    }
  });

  test('/me needs a session but not a school', async ({
    api,
    createUser,
    createOrganization,
  }) => {
    await api().get('/me').expect(401);

    const user = await createUser();
    const bare = await api(user).get('/me').expect(200);
    expect(bare.body).toMatchObject({
      user: { id: user.id, email: user.email },
      activeOrganizationId: null,
    });

    const org = await createOrganization(user);
    const withSchool = await api(user).get('/me').expect(200);
    expect(withSchool.body.activeOrganizationId).toBe(org.id);
  });

  test('a signed-in user with no school gets 403 NoSchool, not data', async ({
    api,
    createUser,
  }) => {
    const user = await createUser();
    for (const path of ['/students', '/me/permissions']) {
      const res = await api(user).get(path).expect(403);
      expect(res.body, path).toMatchObject({
        code: 'NoSchool',
        message: 'No active school for this session',
      });
    }
  });

  test('update-user cannot set the platform role or the password flag', async ({
    api,
    createUser,
    pool,
  }) => {
    const user = await createUser();
    const res = await api(user)
      .post('/api/auth/update-user')
      .send({ name: 'Renamed', role: 'superadmin', mustChangePassword: true });
    expect([200, 400]).toContain(res.status);

    const { rows } = await pool.query<{
      role: string | null;
      mustChangePassword: boolean;
    }>(`SELECT role, "mustChangePassword" FROM "user" WHERE id = $1`, [
      user.id,
    ]);
    expect(rows[0]?.role).not.toBe('superadmin');
    expect(rows[0]?.mustChangePassword).toBe(false);
  });

  test('a school owner cannot reach the platform admin routes', async ({
    api,
    createUser,
    createOrganization,
    pool,
  }) => {
    const owner = await createUser();
    await createOrganization(owner);
    const other = await createUser();

    const setRole = await api(owner)
      .post('/api/auth/admin/set-role')
      .send({ userId: other.id, role: 'superadmin' });
    expect(setRole.status).toBe(403);

    const create = await api(owner).post('/api/auth/admin/create-user').send({
      name: 'Mallory',
      email: 'mallory@example.test',
      password: PASSWORD,
      role: 'superadmin',
    });
    expect(create.status).toBe(403);

    const { rows } = await pool.query(
      `SELECT id FROM "user" WHERE role = 'superadmin' OR email = 'mallory@example.test'`
    );
    expect(rows).toHaveLength(0);
  });

  test('a super admin reaches only the lookup, ban and session admin routes', async ({
    api,
    createUser,
    makeSuperAdmin,
    pool,
  }) => {
    const admin = await makeSuperAdmin(await createUser());
    const other = await createUser();

    await api(admin).get('/api/auth/admin/list-users').expect(200);

    const refused = [
      ['/api/auth/admin/impersonate-user', { userId: other.id }],
      ['/api/auth/admin/set-role', { userId: other.id, role: 'superadmin' }],
      [
        '/api/auth/admin/set-user-password',
        { userId: other.id, newPassword: PASSWORD },
      ],
      [
        '/api/auth/admin/create-user',
        { name: 'Mallory', email: 'mallory@example.test', password: PASSWORD },
      ],
      ['/api/auth/admin/remove-user', { userId: other.id }],
    ] as const;
    for (const [path, body] of refused) {
      const res = await api(admin).post(path).send(body);
      expect(res.status, path).toBe(403);
    }

    const { rows } = await pool.query(
      `SELECT id FROM "user" WHERE role = 'superadmin' AND id <> $1`,
      [admin.id]
    );
    expect(rows).toHaveLength(0);
  });

  test('a signed-in user cannot create a school through Better Auth', async ({
    api,
    createUser,
    pool,
  }) => {
    const user = await createUser();
    const res = await api(user)
      .post('/api/auth/organization/create')
      .send({ name: 'My School', slug: 'my-school' });
    expect(res.status).toBe(403);

    const { rows } = await pool.query('SELECT id FROM "organization"');
    expect(rows).toHaveLength(0);
  });

  test('member, invitation, campus-seat and member-listing routes answer 404 over HTTP', async ({
    api,
    createUser,
    createOrganization,
    createCampus,
  }) => {
    const owner = await createUser();
    const org = await createOrganization(owner);
    const campus = await createCampus(org, 'Lekki');
    const hire = await createUser();
    const body = {
      organizationId: org.id,
      userId: hire.id,
      memberId: hire.id,
      teamId: campus.id,
      email: hire.email,
      role: 'bursar',
      invitationId: randomUUID(),
    };

    for (const path of [
      'update-member-role',
      'add-member',
      'invite-member',
      'accept-invitation',
      'reject-invitation',
      'cancel-invitation',
      'remove-member',
      'add-team-member',
      'remove-team-member',
      'leave',
    ]) {
      await api(owner)
        .post(`/api/auth/organization/${path}`)
        .send(body)
        .expect(404);
    }
    for (const path of [
      'get-invitation',
      'list-invitations',
      'list-user-invitations',
      'list-members',
      'get-full-organization',
      'get-active-member-role',
      'list-user-teams',
    ]) {
      await api(owner).get(`/api/auth/organization/${path}`).expect(404);
    }
  });

  test('banned users are unauthenticated and cannot sign in', async ({
    api,
    createUser,
    makeSuperAdmin,
  }) => {
    const admin = await makeSuperAdmin(await createUser());
    const victim = await createUser();
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
    createUser,
    createOrganization,
    createCampus,
  }) => {
    const owner = await createUser();
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
    createUser,
    createOrganization,
  }) => {
    const owner = await createUser();
    await createOrganization(owner);
    await api(owner).get('/students/not-a-uuid').expect(400);
    const res = await api(owner).get(`/students/${randomUUID()}`).expect(404);
    expect(res.body).toMatchObject({ code: 'NotFound' });
  });
});
