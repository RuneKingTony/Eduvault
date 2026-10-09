import { runSeed } from '../scripts/seed/run-seed';
import { emailOf, personas, SEED_PASSWORD } from '../scripts/seed/members';
import { visibleStudents } from '../scripts/seed/seed-check';
import { baseTest as test, expect } from './support/base-test';

test.describe('dev seed', () => {
  test('seeds the three schools, passes its check and is idempotent', async ({
    app,
    api,
    pool,
  }) => {
    const lines: string[] = [];
    const log = (line: string) => lines.push(line);
    const counts = async () => {
      const { rows } = await pool.query<Record<string, string>>(
        `SELECT (SELECT count(*) FROM organization) AS organization,
                (SELECT count(*) FROM team) AS team,
                (SELECT count(*) FROM "user") AS "user",
                (SELECT count(*) FROM student) AS student`
      );
      return rows[0];
    };

    const first = await runSeed(app, {
      log,
      now: new Date('2026-10-20T10:00:00Z'),
    });
    expect(first).toEqual({ seeded: true, failures: [] });
    expect(lines.join('\n')).toContain('seed "today" is 2026-10-14');
    expect(await counts()).toEqual({
      organization: '3',
      team: '6',
      user: String(personas.length),
      student: '28',
    });

    for (const [key, expected] of Object.entries(visibleStudents)) {
      const res = await api()
        .post('/api/auth/sign-in/email')
        .send({ email: emailOf(key), password: SEED_PASSWORD })
        .expect(200);
      const cookie = (res.headers['set-cookie'] as unknown as string[])
        .map((c) => c.split(';')[0])
        .join('; ');
      const list = await api({ cookie }).get('/students').expect(200);
      expect(list.body, key).toHaveLength(expected);
    }

    const before = await counts();
    lines.length = 0;
    const second = await runSeed(app, { log });
    expect(second).toEqual({ seeded: false, failures: [] });
    expect(lines).toEqual(['Already seeded; nothing to do.']);
    expect(await counts()).toEqual(before);
  });
});
