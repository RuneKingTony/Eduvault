import { AuthService } from '@thallesp/nestjs-better-auth';
import {
  BootstrapRefusedError,
  bootstrapSuperAdmin,
  type AppAuth,
} from '../src/app/common/auth';
import { baseTest as test, expect, PASSWORD } from './support/base-test';

const ADMIN = { email: 'root@eduvault.test', password: PASSWORD };

test.describe('bootstrap-admin', () => {
  test('creates a super admin whose password is already their own', async ({
    app,
    api,
    pool,
  }) => {
    const auth = app.get(AuthService<AppAuth>).instance;
    expect(await bootstrapSuperAdmin(auth, ADMIN)).toBe('created');

    const { rows } = await pool.query<{
      role: string;
      mustChangePassword: boolean;
    }>(`SELECT role, "mustChangePassword" FROM "user" WHERE email = $1`, [
      ADMIN.email,
    ]);
    expect(rows).toEqual([{ role: 'superadmin', mustChangePassword: false }]);

    const session = await api()
      .post('/api/auth/sign-in/email')
      .send(ADMIN)
      .expect(200);
    expect(session.body.user.role).toBe('superadmin');
  });

  test('a rerun returns exists and changes nothing', async ({ app, pool }) => {
    const auth = app.get(AuthService<AppAuth>).instance;
    await bootstrapSuperAdmin(auth, ADMIN);
    const snapshot = () =>
      pool.query(
        `SELECT u.id, u."updatedAt", a.password FROM "user" u
         JOIN account a ON a."userId" = u.id WHERE u.email = $1`,
        [ADMIN.email]
      );
    const before = await snapshot();

    expect(
      await bootstrapSuperAdmin(auth, {
        ...ADMIN,
        password: 'another-password-1',
      })
    ).toBe('exists');
    expect((await snapshot()).rows).toEqual(before.rows);
  });

  test("refuses an ordinary user's email and leaves their role alone", async ({
    app,
    pool,
    createUser,
  }) => {
    const auth = app.get(AuthService<AppAuth>).instance;
    const user = await createUser();

    await expect(
      bootstrapSuperAdmin(auth, { email: user.email, password: PASSWORD })
    ).rejects.toBeInstanceOf(BootstrapRefusedError);

    const { rows } = await pool.query<{ role: string | null }>(
      `SELECT role FROM "user" WHERE id = $1`,
      [user.id]
    );
    expect(rows[0]?.role).toBe('user');
  });

  test('another email adds a second super admin', async ({ app, pool }) => {
    const auth = app.get(AuthService<AppAuth>).instance;
    await bootstrapSuperAdmin(auth, ADMIN);
    expect(
      await bootstrapSuperAdmin(auth, {
        email: 'second@eduvault.test',
        password: PASSWORD,
      })
    ).toBe('created');

    const { rows } = await pool.query(
      `SELECT id FROM "user" WHERE role = 'superadmin'`
    );
    expect(rows).toHaveLength(2);
  });
});
