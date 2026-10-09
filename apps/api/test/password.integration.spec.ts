import { baseTest as test, expect, PASSWORD } from './support/base-test';

const NEW_PASSWORD = 'a-brand-new-password';

test.describe('temporary password', () => {
  test('holds a flagged user off school routes but not /me, the password change or sign-out', async ({
    api,
    createUser,
    createOrganization,
  }) => {
    const owner = await createUser({ mustChangePassword: true });
    const org = await createOrganization(owner);

    for (const path of ['/students', '/campuses']) {
      const res = await api(owner).get(path).expect(403);
      expect(res.body, path).toMatchObject({ code: 'MustChangePassword' });
    }
    const setActive = await api(owner)
      .post('/api/auth/organization/set-active')
      .send({ organizationId: org.id })
      .expect(403);
    expect(setActive.body).toMatchObject({ code: 'MustChangePassword' });

    const change = await api(owner)
      .post('/api/auth/change-password')
      .send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD })
      .expect(403);
    expect(change.body).toMatchObject({ code: 'MustChangePassword' });
    await api(owner).get('/api/auth/list-sessions').expect(403);

    await api(owner).get('/me').expect(200);
    await api(owner).get('/api/auth/get-session').expect(200);
    await api(owner)
      .post('/me/password')
      .send({ newPassword: 'short' })
      .expect(400);
    await api(owner).post('/api/auth/sign-out').send({}).expect(200);
  });

  test('changing it clears the flag, revokes other sessions and opens the school routes', async ({
    api,
    createUser,
    createOrganization,
    signIn,
  }) => {
    const user = await createUser({ mustChangePassword: true });
    await createOrganization(user);
    const other = await signIn({ ...user });

    await api(user)
      .post('/me/password')
      .send({ newPassword: NEW_PASSWORD })
      .expect(204);

    const me = await api(user).get('/me').expect(200);
    expect(me.body).toMatchObject({ mustChangePassword: false });
    await api(user).get('/students').expect(200);

    const revoked = await api(other).get('/api/auth/get-session').expect(200);
    expect(revoked.body).toBeNull();

    await api()
      .post('/api/auth/sign-in/email')
      .send({ email: user.email, password: NEW_PASSWORD })
      .expect(200);
    await api()
      .post('/api/auth/sign-in/email')
      .send({ email: user.email, password: PASSWORD })
      .expect(401);
  });

  test('answers 401 without a session', async ({ api }) => {
    await api()
      .post('/me/password')
      .send({ newPassword: NEW_PASSWORD })
      .expect(401);
  });

  test('answers 409 when there is nothing to change', async ({
    api,
    createUser,
  }) => {
    const user = await createUser();
    const res = await api(user)
      .post('/me/password')
      .send({ newPassword: NEW_PASSWORD })
      .expect(409);
    expect(res.body).toMatchObject({ code: 'PasswordAlreadySet' });
  });

  test('refuses a short password and the temporary one', async ({
    api,
    createUser,
  }) => {
    const user = await createUser({ mustChangePassword: true });

    const short = await api(user)
      .post('/me/password')
      .send({ newPassword: 'nine-char' })
      .expect(400);
    expect(short.body).toMatchObject({ code: 'ValidationError' });

    const same = await api(user)
      .post('/me/password')
      .send({ newPassword: PASSWORD })
      .expect(400);
    expect(same.body.issues).toEqual([
      {
        path: 'newPassword',
        message: 'Choose a password different from the temporary one.',
      },
    ]);
    const me = await api(user).get('/me').expect(200);
    expect(me.body.mustChangePassword).toBe(true);
  });

  test('/me reports the flag, the platform role and the school count', async ({
    api,
    createUser,
    createOrganization,
    makeSuperAdmin,
  }) => {
    const user = await createUser();
    const bare = await api(user).get('/me').expect(200);
    expect(bare.body).toMatchObject({
      mustChangePassword: false,
      platformRole: null,
      schoolCount: 0,
    });

    await createOrganization(user);
    const owner = await api(user).get('/me').expect(200);
    expect(owner.body.schoolCount).toBe(1);

    const admin = await makeSuperAdmin(await createUser());
    const platform = await api(admin).get('/me').expect(200);
    expect(platform.body).toMatchObject({
      platformRole: 'superadmin',
      schoolCount: 0,
    });
  });
});
