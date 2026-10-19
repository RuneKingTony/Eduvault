import type { Pool } from 'pg';
import { expect } from './support/base-test';
import { schoolsTest } from './support/two-schools';

const test = schoolsTest;

const studentLogin = (student: { logins: { who: string }[] }) => {
  const login = student.logins.find((entry) => entry.who === 'student') as
    { username: string; temporaryPassword: string } | undefined;
  if (login === undefined) {
    throw new Error('the student has no login');
  }
  return login;
};

const passwordOf = async (pool: Pool, studentId: string) =>
  (
    await pool.query<{ password: string }>(
      `SELECT a.password FROM account a JOIN student s ON s.user_id = a."userId"
       WHERE s.id = $1 AND a."providerId" = 'credential'`,
      [studentId]
    )
  ).rows[0]?.password;

test.describe('resetting a student’s login', () => {
  test('ends sessions, makes the old password fail, flags the account and records the reset without the password', async ({
    api,
    pool,
    schools: { owner, orgA, studentLekki },
  }) => {
    const { username, temporaryPassword } = studentLogin(studentLekki);
    const signedIn = await api()
      .post('/api/auth/sign-in/username')
      .set('x-forwarded-for', '198.51.100.31')
      .send({ username, password: temporaryPassword })
      .expect(200);
    const cookie = (signedIn.headers['set-cookie'] as unknown as string[])
      .map((value) => value.split(';')[0])
      .join('; ');
    const before = await api({ cookie })
      .get('/api/auth/get-session')
      .expect(200);
    expect(before.body.user.id).toEqual(expect.any(String));

    const reset = await api(owner)
      .post(`/students/${studentLekki.id}/reset-login`)
      .expect(201);

    expect(reset.body.username).toBe(username);
    expect(reset.body.temporaryPassword).toHaveLength(12);
    expect(reset.body.temporaryPassword).not.toBe(temporaryPassword);
    const after = await api({ cookie })
      .get('/api/auth/get-session')
      .expect(200);
    expect(after.body).toBeNull();
    await api()
      .post('/api/auth/sign-in/username')
      .set('x-forwarded-for', '198.51.100.32')
      .send({ username, password: temporaryPassword })
      .expect(401);
    await api()
      .post('/api/auth/sign-in/username')
      .set('x-forwarded-for', '198.51.100.33')
      .send({ username, password: reset.body.temporaryPassword })
      .expect(200);
    const flagged = await pool.query(
      `SELECT "mustChangePassword" FROM "user" WHERE username = $1`,
      [username]
    );
    expect(flagged.rows[0].mustChangePassword).toBe(true);
    const events = await pool.query<{ text: string; data: string }>(
      `SELECT text, data::text AS data FROM activity_event
       WHERE organization_id = $1 AND kind = 'student.login_reset'`,
      [orgA.id]
    );
    expect(events.rows).toHaveLength(1);
    expect(events.rows[0]?.text).toContain('reset');
    const [event] = events.rows;
    expect(`${event?.text ?? ''}${event?.data ?? ''}`).not.toContain(
      reset.body.temporaryPassword
    );
    const again = JSON.stringify(
      (await api(owner).get(`/students/${studentLekki.id}`).expect(200)).body
    );
    expect(again).not.toContain(reset.body.temporaryPassword);
  });

  test('answers 404 for another school’s student, in both directions, and keeps the password', async ({
    api,
    pool,
    schools: { owner, ownerB, studentLekki, studentB },
  }) => {
    const lekkiBefore = await passwordOf(pool, studentLekki.id);
    const theirsBefore = await passwordOf(pool, studentB.id);

    const foreign = await api(owner)
      .post(`/students/${studentB.id}/reset-login`)
      .expect(404);
    await api(ownerB)
      .post(`/students/${studentLekki.id}/reset-login`)
      .expect(404);
    const unknown = await api(owner)
      .post(`/students/${crypto.randomUUID()}/reset-login`)
      .expect(404);

    expect(foreign.body).toEqual(unknown.body);
    expect(await passwordOf(pool, studentLekki.id)).toBe(lekkiBefore);
    expect(await passwordOf(pool, studentB.id)).toBe(theirsBefore);
  });

  test('answers 403 without student:update, and 404 for a campus the caller does not see', async ({
    api,
    withPermissions,
    pool,
    schools: { orgA, lekki, studentLekki, studentIkeja },
  }) => {
    const reader = await withPermissions(orgA, ['student:read']);
    const lekkiClerk = await withPermissions(
      orgA,
      ['student:read', 'student:update'],
      { campuses: [lekki] }
    );
    const ikejaBefore = await passwordOf(pool, studentIkeja.id);

    await api(reader)
      .post(`/students/${studentLekki.id}/reset-login`)
      .expect(403);
    await api(lekkiClerk)
      .post(`/students/${studentIkeja.id}/reset-login`)
      .expect(404);
    await api(lekkiClerk)
      .post(`/students/${studentLekki.id}/reset-login`)
      .expect(201);

    expect(await passwordOf(pool, studentIkeja.id)).toBe(ikejaBefore);
  });

  test('answers 409 for a student who has left, because the login is closed', async ({
    api,
    pool,
    schools: { owner, orgA, studentLekki },
  }) => {
    await pool.query(
      `UPDATE student SET exit_kind = 'left', exit_reason = 'other', archived_at = now(),
         archived_term_id = (SELECT id FROM term WHERE organization_id = $2 AND is_current)
       WHERE id = $1`,
      [studentLekki.id, orgA.id]
    );
    const before = await passwordOf(pool, studentLekki.id);

    const res = await api(owner)
      .post(`/students/${studentLekki.id}/reset-login`)
      .expect(409);

    expect(res.body.message).toContain('is no longer on the roll');
    expect(await passwordOf(pool, studentLekki.id)).toBe(before);
  });

  test('answers 409 for a student with no login', async ({
    api,
    pool,
    schools: { owner, studentLekki },
  }) => {
    await pool.query(`UPDATE student SET user_id = NULL WHERE id = $1`, [
      studentLekki.id,
    ]);

    const res = await api(owner)
      .post(`/students/${studentLekki.id}/reset-login`)
      .expect(409);

    expect(res.body.message).toBe('This student has no portal login to reset.');
  });

  test('answers 409 and keeps the password when the login also belongs to another school', async ({
    api,
    pool,
    schools: { owner, orgB, studentLekki },
  }) => {
    await pool.query(
      `INSERT INTO member ("organizationId", "userId", role, "createdAt")
       SELECT $2, s.user_id, 'student', now() FROM student s WHERE s.id = $1`,
      [studentLekki.id, orgB.id]
    );
    const before = await passwordOf(pool, studentLekki.id);

    const res = await api(owner)
      .post(`/students/${studentLekki.id}/reset-login`)
      .expect(409);

    expect(res.body.message).toContain('also used for something else');
    expect(await passwordOf(pool, studentLekki.id)).toBe(before);
    const events = await pool.query(
      `SELECT 1 FROM activity_event WHERE kind = 'student.login_reset'`
    );
    expect(events.rows).toHaveLength(0);
  });
});
