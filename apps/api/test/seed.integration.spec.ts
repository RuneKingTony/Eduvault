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
                (SELECT count(*) FROM student) AS student,
                (SELECT count(*) FROM academic_session) AS academic_session,
                (SELECT count(*) FROM term) AS term,
                (SELECT count(*) FROM school_holiday) AS school_holiday,
                (SELECT count(*) FROM term WHERE is_current) AS current_term,
                (SELECT count(*) FROM class_level) AS class_level,
                (SELECT count(*) FROM class_arm) AS class_arm,
                (SELECT count(*) FROM class_arm WHERE retired_at IS NOT NULL) AS retired_class_arm,
                (SELECT count(*) FROM class_arm_teacher) AS class_arm_teacher,
                (SELECT count(*) FROM student_enrollment) AS student_enrollment,
                (SELECT count(*) FROM enrollment_placement) AS enrollment_placement,
                (SELECT count(*) FROM guardian) AS guardian,
                (SELECT count(*) FROM guardian_student) AS guardian_student,
                (SELECT count(*) FROM activity_event) AS activity_event,
                (SELECT count(*) FROM announcement) AS announcement,
                (SELECT count(*) FROM announcement WHERE status = 'published') AS published_announcement,
                (SELECT count(*) FROM announcement WHERE pinned) AS pinned_announcement,
                (SELECT count(*) FROM announcement WHERE campus_id IS NULL) AS everyone_announcement,
                (SELECT count(*) FROM ledger_account) AS ledger_account,
                (SELECT count(*) FROM money_account) AS money_account,
                (SELECT count(*) FROM journal_entry) AS journal_entry,
                (SELECT count(*) FROM journal_line) AS journal_line`
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
      user: String(personas.length + 1 + 28 + 4 + 2),
      student: '28',
      academic_session: '2',
      term: '6',
      school_holiday: '11',
      current_term: '1',
      class_level: '36',
      class_arm: '10',
      retired_class_arm: '1',
      class_arm_teacher: '5',
      student_enrollment: '36',
      enrollment_placement: '68',
      guardian: '6',
      guardian_student: '8',
      activity_event: '43',
      announcement: '8',
      published_announcement: '4',
      pinned_announcement: '1',
      everyone_announcement: '4',
      ledger_account: '59',
      money_account: '2',
      journal_entry: '5',
      journal_line: '10',
    });

    const scopeOf = async (key: string) => {
      const res = await api()
        .post('/api/auth/sign-in/email')
        .send({ email: emailOf(key), password: SEED_PASSWORD })
        .expect(200);
      const cookie = (res.headers['set-cookie'] as unknown as string[])
        .map((c) => c.split(';')[0])
        .join('; ');
      const me = await api({ cookie }).get('/me/permissions').expect(200);
      return (me.body as { classScope: 'all' | string[] }).classScope;
    };
    const { rows: jss3 } = await pool.query<{ id: string }>(
      `SELECT a.id FROM class_arm a JOIN class_level l ON l.id = a.class_level_id
       WHERE l.name = 'JSS 3' AND a.name = 'Gold'`
    );
    expect(await scopeOf('emeka')).toEqual([jss3[0]?.id]);
    expect(await scopeOf('tunde')).toBe('all');
    expect(await scopeOf('grace')).toBe('all');
    const { rows: jss2 } = await pool.query<{ id: string }>(
      `SELECT a.id FROM class_arm a JOIN class_level l ON l.id = a.class_level_id
       WHERE l.name = 'JSS 2' AND a.name = 'Gold'`
    );
    expect(await scopeOf('ayo')).toEqual([jss2[0]?.id]);

    const { rows: titled } = await pool.query<{ title: string | null }>(
      `SELECT m.title FROM member m JOIN "user" u ON u.id = m."userId"
       WHERE u.email = $1`,
      [emailOf('tunde')]
    );
    expect(titled[0]?.title).toBe('School administrator');

    for (const [key, expected] of Object.entries(visibleStudents)) {
      const res = await api()
        .post('/api/auth/sign-in/email')
        .send({ email: emailOf(key), password: SEED_PASSWORD })
        .expect(200);
      const cookie = (res.headers['set-cookie'] as unknown as string[])
        .map((c) => c.split(';')[0])
        .join('; ');
      const list = await api({ cookie }).get('/students').expect(200);
      expect(list.body.total, key).toBe(expected);
    }

    const kemi = await api()
      .post('/api/auth/sign-in/email')
      .send({ email: emailOf('kemi'), password: SEED_PASSWORD })
      .expect(200);
    const kemiCookie = (kemi.headers['set-cookie'] as unknown as string[])
      .map((c) => c.split(';')[0])
      .join('; ');
    const kemiMe = await api({ cookie: kemiCookie }).get('/me').expect(200);
    expect(kemiMe.body).toMatchObject({ mustChangePassword: true });
    const held = await api({ cookie: kemiCookie }).get('/students').expect(403);
    expect(held.body).toMatchObject({ code: 'MustChangePassword' });

    const admin = await api()
      .post('/api/auth/sign-in/email')
      .send({ email: 'admin@eduvault.test', password: SEED_PASSWORD })
      .expect(200);
    const adminCookie = (admin.headers['set-cookie'] as unknown as string[])
      .map((c) => c.split(';')[0])
      .join('; ');
    const schoolsList = await api({ cookie: adminCookie })
      .get('/platform/schools')
      .expect(200);
    expect(
      (schoolsList.body as { items: { admissionPrefix: string }[] }).items
        .map((school) => school.admissionPrefix)
        .toSorted((a, b) => a.localeCompare(b))
    ).toEqual(['GF', 'HA', 'SB']);

    const joined = await pool.query<{
      slug: string;
      created: string;
      suspended: boolean;
    }>(
      `SELECT o.slug,
              to_char(o."createdAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS created,
              sa.suspended_at IS NOT NULL AS suspended
       FROM organization o JOIN school_account sa ON sa.organization_id = o.id
       ORDER BY o.slug`
    );
    expect(joined.rows).toEqual([
      { slug: 'greenfield', created: '2026-08-19', suspended: false },
      { slug: 'hilltop', created: '2026-08-27', suspended: false },
      { slug: 'stbrendan', created: '2026-09-09', suspended: true },
    ]);

    const audit = await pool.query<{
      kind: string;
      method: string | null;
      action: string | null;
      reason: string | null;
      slug: string | null;
    }>(
      `SELECT a.kind, a.method, a.action, a.reason, o.slug
       FROM audit_log a LEFT JOIN organization o ON o.id = a.organization_id
       ORDER BY a.created_at, a.id`
    );
    expect(audit.rows.filter((row) => row.kind === 'acting')).toEqual([
      {
        kind: 'acting',
        method: 'GET',
        action: null,
        reason: null,
        slug: 'hilltop',
      },
      {
        kind: 'acting',
        method: 'GET',
        action: null,
        reason: null,
        slug: 'hilltop',
      },
      {
        kind: 'acting',
        method: 'PATCH',
        action: null,
        reason: 'SUP-2207',
        slug: 'hilltop',
      },
    ]);
    expect(
      audit.rows
        .filter((row) => row.kind === 'platform')
        .map((row) => [row.action, row.slug])
    ).toEqual([
      ['school.create', 'greenfield'],
      ['school.create', 'hilltop'],
      ['school.create', 'stbrendan'],
      ['school.suspend', 'stbrendan'],
    ]);

    const platform = await api({ cookie: adminCookie })
      .get('/platform/schools')
      .expect(200);
    expect(platform.body.totals).toEqual({
      schools: 3,
      active: 2,
      students: 28,
      actingRequests: 3,
    });

    const mary = await api()
      .post('/api/auth/sign-in/email')
      .send({ email: emailOf('mary'), password: SEED_PASSWORD })
      .expect(200);
    const maryCookie = (mary.headers['set-cookie'] as unknown as string[])
      .map((c) => c.split(';')[0])
      .join('; ');
    const paused = await api({ cookie: maryCookie })
      .get('/students')
      .expect(403);
    expect(paused.body).toMatchObject({ code: 'SchoolSuspended' });

    for (const username of ['greenfield-0123', 'okeke-father', 'etim-family']) {
      const res = await api()
        .post('/api/auth/sign-in/username')
        .send({ username, password: SEED_PASSWORD })
        .expect(200);
      const cookie = (res.headers['set-cookie'] as unknown as string[])
        .map((c) => c.split(';')[0])
        .join('; ');
      const me = await api({ cookie }).get('/me').expect(200);
      expect(me.body, username).toMatchObject({ mustChangePassword: false });
    }
    await api()
      .post('/api/auth/sign-in/email')
      .send({ email: 'ngozi.okeke@greenfield.test', password: SEED_PASSWORD })
      .expect(200);
    const links = await pool.query<{ guardian: string; children: string }>(
      `SELECT g.full_name AS guardian,
              string_agg(s.first_name, ',' ORDER BY s.first_name) AS children
       FROM guardian g
       JOIN guardian_student gs ON gs.guardian_id = g.id
       JOIN student s ON s.id = gs.student_id
       GROUP BY g.full_name ORDER BY g.full_name`
    );
    expect(links.rows).toEqual([
      { guardian: 'Bayo Adewale', children: 'Tobi' },
      { guardian: 'Emmanuel Etim', children: 'Samuel' },
      { guardian: 'Grace Johnson', children: 'Bola' },
      { guardian: 'Hauwa Bello', children: 'Zainab' },
      { guardian: 'Ifeanyi Okeke', children: 'Ada' },
      { guardian: 'Ngozi Okeke', children: 'Ada,Chidi,Kelechi' },
    ]);

    const lifecycle = await pool.query<{
      first_name: string;
      exit_kind: string | null;
      exit_reason: string | null;
      last_day: string | null;
      not_seen_since: string | null;
      graduated_session: string | null;
      statuses: string;
      has_member: boolean;
    }>(
      `SELECT s.first_name, s.exit_kind, s.exit_reason,
              to_char(s.last_day, 'YYYY-MM-DD') AS last_day,
              to_char(s.not_seen_since, 'YYYY-MM-DD') AS not_seen_since,
              g.name AS graduated_session,
              (SELECT string_agg(a.name || ':' || e.status, ',' ORDER BY a.starts_on)
                 FROM student_enrollment e JOIN academic_session a ON a.id = e.session_id
                WHERE e.student_id = s.id) AS statuses,
              EXISTS (SELECT 1 FROM member m WHERE m."userId" = s.user_id) AS has_member
       FROM student s LEFT JOIN academic_session g ON g.id = s.graduated_session_id
       WHERE s.first_name IN ('Uche', 'Musa', 'Kunle', 'Bola', 'Tayo', 'Tolu', 'Ibrahim', 'Ese')
       ORDER BY s.first_name`
    );
    const byFirstName = (name: string) =>
      lifecycle.rows.find((row) => row.first_name === name);
    expect(byFirstName('Uche')?.not_seen_since).toBe('2026-07-17');
    expect(byFirstName('Musa')?.not_seen_since).toBe('2026-09-28');
    expect(byFirstName('Kunle')?.not_seen_since).toBe('2026-05-29');
    expect(byFirstName('Bola')).toMatchObject({
      exit_kind: 'left',
      exit_reason: 'relocated',
      last_day: '2026-10-02',
      statuses: '2026/2027:withdrawn',
      has_member: false,
    });
    expect(byFirstName('Tayo')).toMatchObject({
      exit_kind: 'left',
      exit_reason: 'transferred',
      last_day: '2026-09-25',
      statuses: '2026/2027:withdrawn',
      has_member: false,
    });
    for (const name of ['Tolu', 'Ibrahim', 'Ese']) {
      expect(byFirstName(name), name).toMatchObject({
        exit_kind: 'graduated',
        exit_reason: 'completed',
        graduated_session: '2025/2026',
        statuses: '2025/2026:completed',
        has_member: false,
      });
    }

    const before = await counts();
    lines.length = 0;
    const second = await runSeed(app, { log });
    expect(second).toEqual({ seeded: false, failures: [] });
    expect(lines).toEqual(['Already seeded; nothing to do.']);
    expect(await counts()).toEqual(before);
  });
});
