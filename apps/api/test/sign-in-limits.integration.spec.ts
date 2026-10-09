import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, vi } from 'vitest';
import { baseTest as test, expect, PASSWORD } from './support/base-test';

// The app fixture compiles on first use, so the flag is set before any test.
beforeAll(() => {
  vi.stubEnv('AUTH_RATE_LIMIT', 'true');
});
afterAll(() => {
  vi.unstubAllEnvs();
});

let nextHost = 1;
const freshIp = () => `198.51.100.${nextHost++}`;

test.describe('sign-in limits', () => {
  test('the sixth attempt in a minute from one address answers 429', async ({
    api,
  }) => {
    const ip = freshIp();
    const statuses: number[] = [];
    for (let run = 0; run < 6; run += 1) {
      const res = await api()
        .post('/api/auth/sign-in/email')
        .set('x-forwarded-for', ip)
        .send({
          email: `nobody-${randomUUID()}@example.test`,
          password: PASSWORD,
        });
      statuses.push(res.status);
    }
    expect(statuses).toEqual([401, 401, 401, 401, 401, 429]);
  });

  test('the sixth attempt on one account answers 429 from any address', async ({
    api,
    createUser,
  }) => {
    const user = await createUser();
    const statuses: number[] = [];
    for (let run = 0; run < 6; run += 1) {
      const res = await api()
        .post('/api/auth/sign-in/email')
        .set('x-forwarded-for', freshIp())
        .send({ email: user.email, password: 'not-the-password-1' });
      statuses.push(res.status);
    }
    expect(statuses).toEqual([401, 401, 401, 401, 401, 429]);

    const upper = await api()
      .post('/api/auth/sign-in/email')
      .set('x-forwarded-for', freshIp())
      .send({ email: user.email.toUpperCase(), password: user.password });
    expect(upper.status).toBe(429);
    expect(upper.body).toMatchObject({
      code: 'TOO_MANY_ATTEMPTS',
      message: 'Too many attempts. Wait a minute and try again.',
    });
  });

  test('a successful sign-in clears the account’s count', async ({
    api,
    createUser,
  }) => {
    const user = await createUser();
    const wrong = async () =>
      (
        await api()
          .post('/api/auth/sign-in/email')
          .set('x-forwarded-for', freshIp())
          .send({ email: user.email, password: 'not-the-password-1' })
      ).status;
    const before = [await wrong(), await wrong(), await wrong(), await wrong()];
    const ok = await api()
      .post('/api/auth/sign-in/email')
      .set('x-forwarded-for', freshIp())
      .send({ email: user.email, password: user.password });
    const after = [
      await wrong(),
      await wrong(),
      await wrong(),
      await wrong(),
      await wrong(),
    ];
    expect([before, ok.status, after]).toEqual([
      [401, 401, 401, 401],
      200,
      [401, 401, 401, 401, 401],
    ]);
  });

  test('an unknown email and a wrong password look the same', async ({
    api,
    createUser,
  }) => {
    const user = await createUser();
    const unknown = await api()
      .post('/api/auth/sign-in/email')
      .set('x-forwarded-for', freshIp())
      .send({
        email: `nobody-${randomUUID()}@example.test`,
        password: PASSWORD,
      });
    const wrong = await api()
      .post('/api/auth/sign-in/email')
      .set('x-forwarded-for', freshIp())
      .send({ email: user.email, password: 'not-the-password-1' });

    expect(unknown.status).toBe(wrong.status);
    expect(unknown.body.code).toBe(wrong.body.code);
    expect(unknown.body.message).toBe(wrong.body.message);
  });

  test('a banned user gets the banned answer', async ({
    api,
    createUser,
    makeSuperAdmin,
  }) => {
    const admin = await makeSuperAdmin(await createUser());
    const victim = await createUser();
    await api(admin)
      .post('/api/auth/admin/ban-user')
      .send({ userId: victim.id, banReason: 'test' })
      .expect(200);

    const res = await api()
      .post('/api/auth/sign-in/email')
      .set('x-forwarded-for', freshIp())
      .send({ email: victim.email, password: victim.password })
      .expect(403);
    expect(res.body).toMatchObject({
      code: 'BANNED_USER',
      message: 'This account is switched off. Ask your school owner.',
    });
  });
});
