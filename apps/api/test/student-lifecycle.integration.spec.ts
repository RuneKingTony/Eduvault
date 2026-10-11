import type { Pool } from 'pg';
import type { StudentDetail, StudentList } from '@eduvault/api-contract';
import { expect, type Fixtures } from './support/base-test';
import { assignClassTeacher, createClass } from './support/factories/classes';
import { createStudent } from './support/factories/students';
import { makeCurrent } from './support/factories/terms';
import { schoolsTest } from './support/two-schools';

const test = schoolsTest;

const DAY_MS = 86_400_000;

const addDays = (date: string, days: number): string =>
  new Date(Date.parse(date) + days * DAY_MS).toISOString().slice(0, 10);

const rowsOf = async (pool: Pool, sql: string, values: unknown[]) =>
  (await pool.query(sql, values)).rows;

const memberRoles = async (pool: Pool, studentId: string) =>
  rowsOf(
    pool,
    `SELECT m.role
     FROM student s JOIN member m ON m."userId" = s.user_id AND m."organizationId" = s.organization_id
     WHERE s.id = $1`,
    [studentId]
  );

const enrolmentStatus = async (pool: Pool, studentId: string) =>
  (
    await rowsOf(
      pool,
      'SELECT status FROM student_enrollment WHERE student_id = $1',
      [studentId]
    )
  ).map((row: { status: string }) => row.status);

test.describe('mark not seen since', () => {
  test('stores the date, who marked it and the trimmed note', async ({
    api,
    schools: { owner, studentLekki },
  }) => {
    const res = await api(owner)
      .post(`/students/${studentLekki.id}/not-seen`)
      .send({ date: studentLekki.admittedOn, note: '  Phone unanswered  ' })
      .expect(201);
    const detail = res.body as StudentDetail;

    expect(detail).toMatchObject({
      life: 'active',
      notSeenSince: studentLekki.admittedOn,
      notSeenNote: 'Phone unanswered',
      weeksAway: expect.any(Number),
    });
    expect(detail.notSeenBy?.name).toBe('Test User');
  });

  test('refuses a future date and a date before admission with 400', async ({
    api,
    schools: { owner, studentLekki },
  }) => {
    const future = await api(owner)
      .post(`/students/${studentLekki.id}/not-seen`)
      .send({ date: addDays(studentLekki.admittedOn, 1) })
      .expect(400);
    expect(future.body.message).toBe('Choose a date on or before today.');

    const before = await api(owner)
      .post(`/students/${studentLekki.id}/not-seen`)
      .send({ date: addDays(studentLekki.admittedOn, -1) })
      .expect(400);
    expect(before.body.message).toMatch(/^Choose a date on or after /);
  });

  test('refuses a second mark and a student who has left with 409', async ({
    api,
    schools: { owner, studentLekki, studentIkeja },
  }) => {
    const date = studentLekki.admittedOn;
    await api(owner)
      .post(`/students/${studentLekki.id}/not-seen`)
      .send({ date })
      .expect(201);
    const again = await api(owner)
      .post(`/students/${studentLekki.id}/not-seen`)
      .send({ date })
      .expect(409);
    expect(again.body.message).toMatch(/^Already marked not seen since /);

    await api(owner)
      .post(`/students/${studentIkeja.id}/leave`)
      .send({ reason: 'relocated', lastDay: date })
      .expect(201);
    const gone = await api(owner)
      .post(`/students/${studentIkeja.id}/not-seen`)
      .send({ date })
      .expect(409);
    expect(gone.body.message).toBe(
      `${studentIkeja.firstName} ${studentIkeja.lastName} is no longer on the roll.`
    );
  });

  test('clears the marker on back in school and refuses an unmarked student', async ({
    api,
    schools: { owner, studentLekki },
  }) => {
    await api(owner)
      .post(`/students/${studentLekki.id}/back-in-school`)
      .expect(409);
    await api(owner)
      .post(`/students/${studentLekki.id}/not-seen`)
      .send({ date: studentLekki.admittedOn, note: 'x' })
      .expect(201);
    const res = await api(owner)
      .post(`/students/${studentLekki.id}/back-in-school`)
      .expect(201);

    expect(res.body).toMatchObject({
      life: 'active',
      notSeenSince: null,
      notSeenBy: null,
      notSeenNote: null,
      weeksAway: null,
    });
  });

  test('writes an activity line in the same transaction', async ({
    api,
    pool,
    schools: { owner, studentLekki },
  }) => {
    await api(owner)
      .post(`/students/${studentLekki.id}/not-seen`)
      .send({ date: studentLekki.admittedOn })
      .expect(201);
    const events = await rowsOf(
      pool,
      `SELECT text FROM activity_event WHERE subject_id = $1 AND kind = 'student.marked_away'`,
      [studentLekki.id]
    );
    expect(events).toHaveLength(1);
    expect(events[0].text).toContain(
      `${studentLekki.firstName} ${studentLekki.lastName} marked not seen since`
    );
  });
});

async function marked(
  api: Fixtures['api'],
  input: {
    owner: { cookie: string };
    student: { id: string; admittedOn: string };
  }
) {
  await api(input.owner)
    .post(`/students/${input.student.id}/not-seen`)
    .send({ date: input.student.admittedOn })
    .expect(201);
}

test.describe('derived states', () => {
  test('turns Inactive at day 35, not day 34', async ({
    api,
    clock,
    schools: { owner, studentLekki },
  }) => {
    await marked(api, { owner, student: studentLekki });
    clock.set(addDays(studentLekki.admittedOn, 34));
    const day34 = (
      await api(owner).get(`/students/${studentLekki.id}`).expect(200)
    ).body as StudentDetail;
    expect(day34).toMatchObject({ life: 'active', weeksAway: 4 });

    clock.set(addDays(studentLekki.admittedOn, 35));
    const day35 = (
      await api(owner).get(`/students/${studentLekki.id}`).expect(200)
    ).body as StudentDetail;
    expect(day35).toMatchObject({ life: 'inactive', dueLeft: false });
    const tab = (await api(owner).get('/students?tab=inactive').expect(200))
      .body as StudentList;
    expect(tab.items.map((row) => row.id)).toEqual([studentLekki.id]);
    expect(tab.counts.inactive).toBe(1);
  });

  test('is due to be marked Left at day 133, not day 132', async ({
    api,
    clock,
    schools: { owner, studentLekki },
  }) => {
    await marked(api, { owner, student: studentLekki });
    clock.set(addDays(studentLekki.admittedOn, 132));
    const day132 = (
      await api(owner).get(`/students/${studentLekki.id}`).expect(200)
    ).body as StudentDetail;
    expect(day132).toMatchObject({ life: 'inactive', dueLeft: false });

    clock.set(addDays(studentLekki.admittedOn, 133));
    const day133 = (
      await api(owner).get(`/students/${studentLekki.id}`).expect(200)
    ).body as StudentDetail;
    expect(day133).toMatchObject({ life: 'inactive', dueLeft: true });
  });
});

test.describe('record leaving', () => {
  test('withdraws the enrolment, closes the login and keeps every row', async ({
    api,
    pool,
    schools: { owner, studentLekki },
  }) => {
    const before = await memberRoles(pool, studentLekki.id);
    expect(before).toEqual([{ role: 'student' }]);

    const res = await api(owner)
      .post(`/students/${studentLekki.id}/leave`)
      .send({
        reason: 'relocated',
        lastDay: studentLekki.admittedOn,
        note: '  Moved to Abuja  ',
      })
      .expect(201);
    const detail = res.body as StudentDetail;

    expect(detail).toMatchObject({
      life: 'left',
      archivedBy: { name: 'Test User' },
      canUndoLeaving: true,
      exit: {
        kind: 'left',
        on: studentLekki.admittedOn,
        reason: 'Relocated',
        note: 'Moved to Abuja',
      },
    });
    expect(detail.history[0]?.status).toBe('withdrawn');
    expect(await enrolmentStatus(pool, studentLekki.id)).toEqual(['withdrawn']);
    expect(await memberRoles(pool, studentLekki.id)).toEqual([]);
    const kept = await rowsOf(
      pool,
      `SELECT
         (SELECT count(*)::int FROM student WHERE id = $1) AS students,
         (SELECT count(*)::int FROM enrollment_placement ep JOIN student_enrollment e ON e.id = ep.enrollment_id WHERE e.student_id = $1) AS placements,
         (SELECT count(*)::int FROM guardian_student WHERE student_id = $1) AS guardians,
         (SELECT count(*)::int FROM "user" u JOIN student s ON s.user_id = u.id WHERE s.id = $1) AS users`,
      [studentLekki.id]
    );
    expect(kept[0]).toEqual({
      students: 1,
      placements: 1,
      guardians: 1,
      users: 1,
    });
  });

  test('shows the last day on the Left tab', async ({
    api,
    schools: { owner, studentLekki },
  }) => {
    await api(owner)
      .post(`/students/${studentLekki.id}/leave`)
      .send({ reason: 'fees', lastDay: studentLekki.admittedOn })
      .expect(201);
    const left = (await api(owner).get('/students?tab=left').expect(200))
      .body as StudentList;

    expect(left.items).toHaveLength(1);
    expect(left.items[0]?.exit).toMatchObject({
      kind: 'left',
      on: studentLekki.admittedOn,
      reason: 'Fees',
    });
    expect(left.counts).toMatchObject({ left: 1, active: 1 });
  });

  test('refuses a second leave, a future last day and an unknown reason', async ({
    api,
    schools: { owner, studentLekki, studentIkeja },
  }) => {
    await api(owner)
      .post(`/students/${studentLekki.id}/leave`)
      .send({ reason: 'relocated', lastDay: studentLekki.admittedOn })
      .expect(201);
    await api(owner)
      .post(`/students/${studentLekki.id}/leave`)
      .send({ reason: 'relocated', lastDay: studentLekki.admittedOn })
      .expect(409);

    const future = await api(owner)
      .post(`/students/${studentIkeja.id}/leave`)
      .send({
        reason: 'relocated',
        lastDay: addDays(studentIkeja.admittedOn, 1),
      })
      .expect(400);
    expect(future.body.message).toBe('Choose a last day on or before today.');
    await api(owner)
      .post(`/students/${studentIkeja.id}/leave`)
      .send({ reason: 'completed', lastDay: studentIkeja.admittedOn })
      .expect(400);
  });

  test('refuses with 409 when no term is current', async ({
    api,
    pool,
    schools: { owner, studentLekki },
  }) => {
    await pool.query('UPDATE term SET is_current = false');
    const res = await api(owner)
      .post(`/students/${studentLekki.id}/leave`)
      .send({ reason: 'relocated', lastDay: studentLekki.admittedOn })
      .expect(409);
    expect(res.body.message).toBe(
      'Make a term current before recording a leaving.'
    );
  });
});

test.describe('undo leaving', () => {
  test('restores the enrolment and the login in the term it was recorded', async ({
    api,
    pool,
    schools: { owner, studentLekki },
  }) => {
    await api(owner)
      .post(`/students/${studentLekki.id}/leave`)
      .send({ reason: 'relocated', lastDay: studentLekki.admittedOn })
      .expect(201);
    const res = await api(owner)
      .post(`/students/${studentLekki.id}/undo-leaving`)
      .expect(201);

    expect(res.body).toMatchObject({
      life: 'active',
      exit: null,
      archivedBy: null,
      canUndoLeaving: false,
    });
    expect(await enrolmentStatus(pool, studentLekki.id)).toEqual(['active']);
    expect(await memberRoles(pool, studentLekki.id)).toEqual([
      { role: 'student' },
    ]);
    const cleared = await rowsOf(
      pool,
      `SELECT exit_kind, exit_reason, exit_note, last_day, graduated_session_id, archived_at, archived_by, archived_term_id
       FROM student WHERE id = $1`,
      [studentLekki.id]
    );
    expect(Object.values(cleared[0])).toEqual(
      Array.from({ length: 8 }, () => null)
    );
  });

  test('keeps the other roles a student login holds', async ({
    api,
    pool,
    schools: { owner, studentLekki },
  }) => {
    await pool.query(
      `UPDATE member SET role = 'student,guardian'
       WHERE "userId" = (SELECT user_id FROM student WHERE id = $1)`,
      [studentLekki.id]
    );
    await api(owner)
      .post(`/students/${studentLekki.id}/leave`)
      .send({ reason: 'relocated', lastDay: studentLekki.admittedOn })
      .expect(201);
    expect(await memberRoles(pool, studentLekki.id)).toEqual([
      { role: 'guardian' },
    ]);
    await api(owner)
      .post(`/students/${studentLekki.id}/undo-leaving`)
      .expect(201);
    expect(await memberRoles(pool, studentLekki.id)).toEqual([
      { role: 'guardian,student' },
    ]);
  });

  test('refuses once the term has changed, and for a student still on the roll', async ({
    api,
    schools: { owner, studentLekki, studentIkeja },
  }) => {
    await api(owner)
      .post(`/students/${studentIkeja.id}/undo-leaving`)
      .expect(409);

    await api(owner)
      .post(`/students/${studentLekki.id}/leave`)
      .send({ reason: 'relocated', lastDay: studentLekki.admittedOn })
      .expect(201);
    await makeCurrent(api, owner, { year: '2026/2027', sequence: 2 });
    const detail = (
      await api(owner).get(`/students/${studentLekki.id}`).expect(200)
    ).body as StudentDetail;
    expect(detail.canUndoLeaving).toBe(false);
    const res = await api(owner)
      .post(`/students/${studentLekki.id}/undo-leaving`)
      .expect(409);
    expect(res.body.message).toBe(
      'A leaving can only be undone in the term it was recorded.'
    );
  });
});

test.describe('the leaver’s own login and the guardian', () => {
  test('a left student no longer opens the school while the guardian keeps the child', async ({
    api,
    pool,
    schools: { owner, studentLekki },
  }) => {
    const login = studentLekki.logins[0];
    await pool.query(
      `UPDATE "user" SET "mustChangePassword" = false
       WHERE id = (SELECT user_id FROM student WHERE id = $1)`,
      [studentLekki.id]
    );
    const signedIn = await api()
      .post('/api/auth/sign-in/username')
      .set('x-forwarded-for', '198.51.100.21')
      .send({ username: login?.username, password: login?.temporaryPassword })
      .expect(200);
    const cookie = (signedIn.headers['set-cookie'] as unknown as string[])
      .map((value) => value.split(';')[0])
      .join('; ');
    await api({ cookie }).get('/me/permissions').expect(200);

    await api(owner)
      .post(`/students/${studentLekki.id}/leave`)
      .send({ reason: 'relocated', lastDay: studentLekki.admittedOn })
      .expect(201);

    await api({ cookie }).get('/me/permissions').expect(403);
    const guardian = await rowsOf(
      pool,
      `SELECT gs.guardian_id, m.role
       FROM guardian_student gs
       JOIN guardian g ON g.id = gs.guardian_id
       JOIN member m ON m."userId" = g.user_id AND m."organizationId" = g.organization_id
       WHERE gs.student_id = $1`,
      [studentLekki.id]
    );
    expect(guardian).toHaveLength(1);
    expect(guardian[0].role).toBe('guardian');
    const links = (
      await api(owner).get(`/students/${studentLekki.id}`).expect(200)
    ).body as StudentDetail;
    expect(links.guardians).toHaveLength(1);
  });
});

const lifecycleRoutes = (student: { id: string; admittedOn: string }) =>
  [
    ['not-seen', { date: student.admittedOn }],
    ['back-in-school', undefined],
    ['leave', { reason: 'relocated', lastDay: student.admittedOn }],
    ['undo-leaving', undefined],
  ] as const;

test.describe('isolation', () => {
  test('answers 404 to another school on every lifecycle route', async ({
    api,
    schools: { ownerB, studentLekki },
  }) => {
    for (const [action, body] of lifecycleRoutes(studentLekki)) {
      const request = api(ownerB).post(
        `/students/${studentLekki.id}/${action}`
      );
      await (body === undefined ? request : request.send(body)).expect(404);
    }
  });

  test('answers 401 without a session on every lifecycle route', async ({
    api,
    schools: { studentLekki },
  }) => {
    for (const [action, body] of lifecycleRoutes(studentLekki)) {
      const request = api().post(`/students/${studentLekki.id}/${action}`);
      await (body === undefined ? request : request.send(body)).expect(401);
    }
  });
});

test.describe('permission and scope', () => {
  test('answers 403 for an in-scope student without the permission', async ({
    api,
    withPermissions,
    schools: { orgA, lekki, studentLekki },
  }) => {
    const reader = await withPermissions(orgA, ['student:read'], {
      campuses: [lekki],
    });
    const id = studentLekki.id;
    await api(reader)
      .post(`/students/${id}/not-seen`)
      .send({ date: studentLekki.admittedOn })
      .expect(403);
    await api(reader).post(`/students/${id}/back-in-school`).expect(403);
    await api(reader)
      .post(`/students/${id}/leave`)
      .send({ reason: 'relocated', lastDay: studentLekki.admittedOn })
      .expect(403);
    await api(reader).post(`/students/${id}/undo-leaving`).expect(403);
    await api(reader)
      .post(`/students/${id}/placements`)
      .send({ termId: id, classArmId: id })
      .expect(403);
  });

  test('answers 404 for an out-of-campus student with the permission', async ({
    api,
    withPermissions,
    schools: { orgA, lekki, studentIkeja },
  }) => {
    const holder = await withPermissions(
      orgA,
      [
        'student:read',
        'student:markAway',
        'student:archive',
        'enrollment:place',
      ],
      { campuses: [lekki] }
    );
    const id = studentIkeja.id;
    await api(holder)
      .post(`/students/${id}/not-seen`)
      .send({ date: studentIkeja.admittedOn })
      .expect(404);
    await api(holder).post(`/students/${id}/back-in-school`).expect(404);
    await api(holder)
      .post(`/students/${id}/leave`)
      .send({ reason: 'relocated', lastDay: studentIkeja.admittedOn })
      .expect(404);
    await api(holder).post(`/students/${id}/undo-leaving`).expect(404);
    await api(holder)
      .post(`/students/${id}/placements`)
      .send({ termId: id, classArmId: id })
      .expect(404);
  });

  test('narrows a class-scoped teacher to the classes they teach', async ({
    api,
    app,
    withPermissions,
    schools: { orgA, owner, lekki, studentLekki },
  }) => {
    const teacher = await withPermissions(
      orgA,
      ['student:read', 'student:markAway', 'class:read'],
      { campuses: [lekki] }
    );
    const other = await createClass(app, owner, { campusId: lekki.id });
    const elsewhere = await createStudent(app, owner, {
      campusId: lekki.id,
      classArmId: other.id,
    });
    await assignClassTeacher(app, owner, {
      classId: studentLekki.currentPlacement?.armId ?? '',
      userId: teacher.id,
    });

    await api(teacher)
      .post(`/students/${elsewhere.id}/not-seen`)
      .send({ date: elsewhere.admittedOn })
      .expect(404);
    await api(teacher)
      .post(`/students/${studentLekki.id}/not-seen`)
      .send({ date: studentLekki.admittedOn })
      .expect(201);
  });
});
