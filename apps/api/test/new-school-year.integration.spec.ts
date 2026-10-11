import type { Pool } from 'pg';
import type {
  NewSchoolYearPreview,
  StartNewSchoolYearResult,
  StudentList,
} from '@eduvault/api-contract';
import { expect, type Fixtures } from './support/base-test';
import { YEAR_2027, createSchoolYear } from './support/factories/calendar';
import { createClass } from './support/factories/classes';
import { createStudent } from './support/factories/students';
import { makeCurrent, termOf } from './support/factories/terms';
import {
  bareSchoolsTest,
  type TwoSchoolsWithoutStudents as Schools,
} from './support/two-schools';

const test = bareSchoolsTest;

type Api = Fixtures['api'];

const THIRD = { year: '2026/2027', sequence: 3 };

async function world(
  app: Parameters<typeof createStudent>[0],
  api: Api,
  schools: Schools
) {
  const { owner, lekki, ikeja } = schools;
  const gold1 = await createClass(app, owner, {
    campusId: lekki.id,
    levelCode: 'JSS1',
    name: 'Gold',
  });
  const gold2 = await createClass(app, owner, {
    campusId: lekki.id,
    levelCode: 'JSS2',
    name: 'Gold',
  });
  const blue = await createClass(app, owner, {
    campusId: ikeja.id,
    levelCode: 'SS3',
    name: 'Blue',
  });
  const ada = await createStudent(app, owner, {
    campusId: lekki.id,
    classArmId: gold1.id,
    firstName: 'Ada',
    lastName: 'Okeke',
  });
  const tobi = await createStudent(app, owner, {
    campusId: lekki.id,
    classArmId: gold1.id,
    firstName: 'Tobi',
    lastName: 'Lawal',
  });
  const efe = await createStudent(app, owner, {
    campusId: ikeja.id,
    classArmId: blue.id,
    firstName: 'Efe',
    lastName: 'Ade',
  });
  const next = await createSchoolYear(app, owner, YEAR_2027);
  await makeCurrent(api, owner, THIRD);
  return { gold1, gold2, blue, ada, tobi, efe, next };
}

type World = Awaited<ReturnType<typeof world>>;

const rows = (w: World) => [
  { studentId: w.ada.id, outcome: 'move', classArmId: w.gold2.id },
  { studentId: w.tobi.id, outcome: 'repeat', classArmId: w.gold1.id },
  { studentId: w.efe.id, outcome: 'graduate' },
];

const enrolments = async (pool: Pool, studentId: string) =>
  (
    await pool.query(
      `SELECT s.name AS year, e.status, e.is_new_student, lvl.code AS level,
              (SELECT count(*)::int FROM enrollment_placement ep WHERE ep.enrollment_id = e.id) AS placements
       FROM student_enrollment e
       JOIN academic_session s ON s.id = e.session_id
       JOIN class_level lvl ON lvl.id = e.class_level_id
       WHERE e.student_id = $1
       ORDER BY s.starts_on`,
      [studentId]
    )
  ).rows;

const total = async (pool: Pool, table: string) =>
  (await pool.query(`SELECT count(*)::int AS total FROM ${table}`)).rows[0]
    .total as number;

test.describe('the preview', () => {
  test('groups the waiting students by class with the same-name target and Graduate', async ({
    api,
    app,
    schools,
  }) => {
    const w = await world(app, api, schools);
    const res = await api(schools.owner)
      .get('/students/new-school-year')
      .expect(200);
    const preview = res.body as NewSchoolYearPreview;

    expect(preview).toMatchObject({
      targetYear: { id: w.next.id, name: '2027/2028' },
      leavingYear: { name: '2026/2027' },
      canGraduate: true,
      alreadyInTargetYear: 0,
    });
    expect(preview.targetYear.firstTerm).toMatchObject({
      name: 'First term',
      isCurrent: false,
    });
    expect(preview.groups).toHaveLength(2);
    const [gold, blue] = preview.groups;
    expect(gold?.fromClass).toMatchObject({
      name: 'JSS 1 Gold',
      campusName: 'Lekki',
    });
    expect(gold?.toClass).toMatchObject({ id: w.gold2.id, name: 'JSS 2 Gold' });
    expect(gold?.students.map((student) => student.lastName)).toEqual([
      'Lawal',
      'Okeke',
    ]);
    expect(blue?.level.isFinalYear).toBe(true);
    expect(blue?.toClass).toBeNull();
    expect(blue?.nextLevel).toBeNull();
  });

  test('lists only the caller’s campuses and leaves class scope out of it', async ({
    api,
    app,
    withPermissions,
    schools,
  }) => {
    await world(app, api, schools);
    const lekkiHead = await withPermissions(
      schools.orgA,
      ['enrollment:place', 'student:read', 'class:read'],
      { campuses: [schools.lekki] }
    );
    const preview = (
      await api(lekkiHead).get('/students/new-school-year').expect(200)
    ).body as NewSchoolYearPreview;

    expect(preview.canGraduate).toBe(false);
    expect(preview.groups).toHaveLength(1);
    expect(preview.groups[0]?.fromClass?.campusName).toBe('Lekki');
    expect(preview.groups[0]?.students).toHaveLength(2);
  });

  test('names inactive students without a checkbox row and counts those already moved', async ({
    api,
    app,
    clock,
    schools,
  }) => {
    const w = await world(app, api, schools);
    await api(schools.owner)
      .post(`/students/${w.tobi.id}/not-seen`)
      .send({ date: w.tobi.admittedOn })
      .expect(201);
    const day = new Date(Date.parse(w.tobi.admittedOn) + 40 * 86_400_000);
    clock.set(day.toISOString().slice(0, 10));
    await api(schools.owner)
      .post('/students/new-school-year')
      .send({
        targetYearId: w.next.id,
        rows: [
          { studentId: w.ada.id, outcome: 'move', classArmId: w.gold2.id },
        ],
      })
      .expect(201);

    const preview = (
      await api(schools.owner).get('/students/new-school-year').expect(200)
    ).body as NewSchoolYearPreview;
    const gold = preview.groups.find(
      (group) => group.fromClass?.id === w.gold1.id
    );

    expect(preview.alreadyInTargetYear).toBe(1);
    expect(gold?.students).toEqual([]);
    expect(gold?.inactive).toEqual([{ id: w.tobi.id, name: 'Tobi Lawal' }]);
  });

  test('answers 409 with no target year and in a middle term, 403 without enrollment:place', async ({
    api,
    schools,
    app,
  }) => {
    await createStudent(app, schools.owner, { campusId: schools.lekki.id });
    const res = await api(schools.owner)
      .get('/students/new-school-year')
      .expect(409);
    expect(res.body.message).toBe(
      'There is no school year to start. Create the next school year first.'
    );

    await createSchoolYear(app, schools.owner, YEAR_2027);
    await api(schools.owner).get('/students/new-school-year').expect(409);
    await makeCurrent(api, schools.owner, THIRD);
    await api(schools.owner).get('/students/new-school-year').expect(200);
    await makeCurrent(api, schools.owner, { year: '2026/2027', sequence: 2 });
    await api(schools.owner).get('/students/new-school-year').expect(409);

    await api(schools.lekkiOnly).get('/students/new-school-year').expect(403);
    await api(schools.noPermission)
      .get('/students/new-school-year')
      .expect(403);
    await api().get('/students/new-school-year').expect(401);
  });
});

test.describe('starting the year', () => {
  test('moves, repeats and graduates, and leaves the old year and the current term alone', async ({
    api,
    app,
    pool,
    schools,
  }) => {
    const w = await world(app, api, schools);
    const res = await api(schools.owner)
      .post('/students/new-school-year')
      .send({ targetYearId: w.next.id, rows: rows(w) })
      .expect(201);
    expect(res.body as StartNewSchoolYearResult).toEqual({
      moved: 1,
      repeating: 1,
      graduated: 1,
      skipped: 0,
    });

    expect(await enrolments(pool, w.ada.id)).toEqual([
      expect.objectContaining({ year: '2026/2027', status: 'active' }),
      {
        year: '2027/2028',
        status: 'active',
        is_new_student: false,
        level: 'JSS2',
        placements: 1,
      },
    ]);
    expect(await enrolments(pool, w.tobi.id)).toEqual([
      expect.objectContaining({ year: '2026/2027', status: 'active' }),
      {
        year: '2027/2028',
        status: 'active',
        is_new_student: false,
        level: 'JSS1',
        placements: 1,
      },
    ]);
    const efe = await enrolments(pool, w.efe.id);
    expect(efe).toEqual([
      expect.objectContaining({ year: '2026/2027', status: 'completed' }),
    ]);
    const placed = await pool.query(
      `SELECT ep.class_arm_id, ep.campus_id, t.name AS term
       FROM enrollment_placement ep
       JOIN student_enrollment e ON e.id = ep.enrollment_id
       JOIN term t ON t.id = ep.term_id
       JOIN academic_session s ON s.id = t.session_id AND s.name = '2027/2028'
       WHERE e.student_id = $1`,
      [w.ada.id]
    );
    expect(placed.rows).toEqual([
      {
        class_arm_id: w.gold2.id,
        campus_id: schools.lekki.id,
        term: 'First term',
      },
    ]);
    const graduate = await pool.query(
      `SELECT s.exit_kind, s.exit_reason, a.name AS year,
              EXISTS (SELECT 1 FROM member m WHERE m."userId" = s.user_id) AS has_member
       FROM student s JOIN academic_session a ON a.id = s.graduated_session_id
       WHERE s.id = $1`,
      [w.efe.id]
    );
    expect(graduate.rows).toEqual([
      {
        exit_kind: 'graduated',
        exit_reason: 'completed',
        year: '2026/2027',
        has_member: false,
      },
    ]);
    const current = await pool.query('SELECT name FROM term WHERE is_current');
    expect(current.rows).toEqual([{ name: 'Third term' }]);
    const activity = await pool.query(
      `SELECT text FROM activity_event WHERE kind = 'school_year.started'`
    );
    expect(activity.rows).toEqual([
      {
        text: 'Test User started 2027/2028: 1 moved up, 1 repeating, 1 graduated.',
      },
    ]);
  });

  test('is idempotent: a replay creates nothing and reports every row as skipped', async ({
    api,
    app,
    pool,
    schools,
  }) => {
    const w = await world(app, api, schools);
    const send = () =>
      api(schools.owner)
        .post('/students/new-school-year')
        .send({ targetYearId: w.next.id, rows: rows(w) });
    await send().expect(201);
    const before = await total(pool, 'student_enrollment');
    const again = await send().expect(201);

    expect(again.body).toEqual({
      moved: 0,
      repeating: 0,
      graduated: 0,
      skipped: 3,
    });
    expect(await total(pool, 'student_enrollment')).toBe(before);
    const reopened = (
      await api(schools.owner).get('/students/new-school-year').expect(200)
    ).body as NewSchoolYearPreview;
    expect(reopened.groups).toEqual([]);
    expect(reopened.alreadyInTargetYear).toBe(2);
  });

  test('writes nothing when one row names a class at the wrong level', async ({
    api,
    app,
    pool,
    schools,
  }) => {
    const w = await world(app, api, schools);
    const before = await total(pool, 'student_enrollment');
    const res = await api(schools.owner)
      .post('/students/new-school-year')
      .send({
        targetYearId: w.next.id,
        rows: [
          { studentId: w.ada.id, outcome: 'move', classArmId: w.gold2.id },
          { studentId: w.tobi.id, outcome: 'move', classArmId: w.gold1.id },
          { studentId: w.efe.id, outcome: 'graduate' },
        ],
      })
      .expect(400);

    expect(res.body.message).toBe('Choose a JSS 2 class.');
    expect(await total(pool, 'student_enrollment')).toBe(before);
    const archived = await pool.query(
      'SELECT count(*)::int AS total FROM student WHERE exit_kind IS NOT NULL'
    );
    expect(archived.rows[0].total).toBe(0);
  });

  test('refuses an archived class, a missing class and the wrong outcome for the level with 400', async ({
    api,
    app,
    schools,
  }) => {
    const w = await world(app, api, schools);
    await api(schools.owner)
      .patch(`/classes/${w.gold2.id}`)
      .send({ archived: true })
      .expect(200);
    const post = (body: unknown[]) =>
      api(schools.owner)
        .post('/students/new-school-year')
        .send({ targetYearId: w.next.id, rows: body });

    const archived = await post([
      { studentId: w.ada.id, outcome: 'move', classArmId: w.gold2.id },
    ]).expect(400);
    expect(archived.body.message).toBe(
      'JSS 2 Gold is archived. Choose another class.'
    );
    const missing = await post([
      { studentId: w.ada.id, outcome: 'move' },
    ]).expect(400);
    expect(missing.body.issues[0]).toMatchObject({
      message: 'Choose a class.',
    });
    await post([{ studentId: w.ada.id, outcome: 'graduate' }]).expect(400);
    await post([
      { studentId: w.efe.id, outcome: 'move', classArmId: w.gold1.id },
    ]).expect(400);
  });

  test('answers 403 without enrollment:place, and for a graduate row without student:archive, writing nothing', async ({
    api,
    app,
    pool,
    withPermissions,
    schools,
  }) => {
    const w = await world(app, api, schools);
    const placer = await withPermissions(
      schools.orgA,
      ['enrollment:place', 'student:read'],
      { campuses: [schools.lekki, schools.ikeja] }
    );
    const before = await total(pool, 'student_enrollment');
    await api(schools.lekkiOnly)
      .post('/students/new-school-year')
      .send({ targetYearId: w.next.id, rows: rows(w) })
      .expect(403);
    await api(placer)
      .post('/students/new-school-year')
      .send({ targetYearId: w.next.id, rows: rows(w) })
      .expect(403);
    expect(await total(pool, 'student_enrollment')).toBe(before);

    const partial = await api(placer)
      .post('/students/new-school-year')
      .send({ targetYearId: w.next.id, rows: rows(w).slice(0, 2) })
      .expect(201);
    expect(partial.body).toEqual({
      moved: 1,
      repeating: 1,
      graduated: 0,
      skipped: 0,
    });
  });

  test('answers 404 for a student outside the caller’s campus scope', async ({
    api,
    app,
    pool,
    withPermissions,
    schools,
  }) => {
    const w = await world(app, api, schools);
    const lekkiHead = await withPermissions(
      schools.orgA,
      ['enrollment:place', 'student:read', 'student:archive'],
      { campuses: [schools.lekki] }
    );
    const before = await total(pool, 'student_enrollment');
    await api(lekkiHead)
      .post('/students/new-school-year')
      .send({ targetYearId: w.next.id, rows: rows(w) })
      .expect(404);
    expect(await total(pool, 'student_enrollment')).toBe(before);
  });

  test('skips an inactive student who sent in a row, and moves them after Back in school', async ({
    api,
    app,
    clock,
    schools,
  }) => {
    const w = await world(app, api, schools);
    await api(schools.owner)
      .post(`/students/${w.tobi.id}/not-seen`)
      .send({ date: w.tobi.admittedOn })
      .expect(201);
    clock.set(
      new Date(Date.parse(w.tobi.admittedOn) + 40 * 86_400_000)
        .toISOString()
        .slice(0, 10)
    );
    const first = await api(schools.owner)
      .post('/students/new-school-year')
      .send({ targetYearId: w.next.id, rows: rows(w) })
      .expect(201);
    expect(first.body).toEqual({
      moved: 1,
      repeating: 0,
      graduated: 1,
      skipped: 1,
    });

    await api(schools.owner)
      .post(`/students/${w.tobi.id}/back-in-school`)
      .expect(201);
    const reopened = (
      await api(schools.owner).get('/students/new-school-year').expect(200)
    ).body as NewSchoolYearPreview;
    expect(
      reopened.groups.flatMap((group) => group.students.map((s) => s.id))
    ).toEqual([w.tobi.id]);
  });

  test('is still offered once the new year’s first term is current, placing students in it', async ({
    api,
    app,
    schools,
  }) => {
    const w = await world(app, api, schools);
    await makeCurrent(api, schools.owner, { year: '2027/2028', sequence: 1 });
    const preview = (
      await api(schools.owner).get('/students/new-school-year').expect(200)
    ).body as NewSchoolYearPreview;
    expect(preview.targetYear.firstTerm.isCurrent).toBe(true);
    expect(preview.groups).toHaveLength(2);

    await api(schools.owner)
      .post('/students/new-school-year')
      .send({ targetYearId: w.next.id, rows: rows(w) })
      .expect(201);
    const detail = (
      await api(schools.owner).get(`/students/${w.ada.id}`).expect(200)
    ).body;
    expect(detail.currentPlacement).toMatchObject({
      armId: w.gold2.id,
      className: 'JSS 2 Gold',
    });
    expect(
      (await termOf(api, schools.owner, { year: '2027/2028', sequence: 1 }))
        .isCurrent
    ).toBe(true);
  });
});

test.describe('the Start button on the Students list', () => {
  test('offers the target year to a placer while someone in scope is waiting', async ({
    api,
    app,
    withPermissions,
    schools,
  }) => {
    const w = await world(app, api, schools);
    const placer = await withPermissions(
      schools.orgA,
      ['enrollment:place', 'student:read'],
      { campuses: [schools.lekki] }
    );
    const offered = (await api(schools.owner).get('/students').expect(200))
      .body as StudentList;
    expect(offered.startYear).toEqual({
      targetYearId: w.next.id,
      name: '2027/2028',
    });
    expect(
      ((await api(placer).get('/students').expect(200)).body as StudentList)
        .startYear?.name
    ).toBe('2027/2028');
    expect(
      (
        (await api(schools.lekkiOnly).get('/students').expect(200))
          .body as StudentList
      ).startYear
    ).toBeNull();

    await api(schools.owner)
      .post('/students/new-school-year')
      .send({ targetYearId: w.next.id, rows: rows(w) })
      .expect(201);
    expect(
      (
        (await api(schools.owner).get('/students').expect(200))
          .body as StudentList
      ).startYear
    ).toBeNull();
  });
});

test.describe('leaving after the year has started', () => {
  test('withdraws the next-year enrolment with the current one, and undo restores both', async ({
    api,
    app,
    pool,
    schools,
  }) => {
    const w = await world(app, api, schools);
    await api(schools.owner)
      .post('/students/new-school-year')
      .send({ targetYearId: w.next.id, rows: rows(w) })
      .expect(201);

    await api(schools.owner)
      .post(`/students/${w.ada.id}/leave`)
      .send({ reason: 'relocated', lastDay: w.ada.admittedOn })
      .expect(201);
    expect((await enrolments(pool, w.ada.id)).map((row) => row.status)).toEqual(
      ['withdrawn', 'withdrawn']
    );

    await api(schools.owner)
      .post(`/students/${w.ada.id}/undo-leaving`)
      .expect(201);
    expect((await enrolments(pool, w.ada.id)).map((row) => row.status)).toEqual(
      ['active', 'active']
    );
  });

  test('completes the old year and withdraws the next year when a final-year repeater graduates', async ({
    api,
    app,
    pool,
    schools,
  }) => {
    const w = await world(app, api, schools);
    await api(schools.owner)
      .post('/students/new-school-year')
      .send({
        targetYearId: w.next.id,
        rows: [
          { studentId: w.efe.id, outcome: 'repeat', classArmId: w.blue.id },
        ],
      })
      .expect(201);
    expect((await enrolments(pool, w.efe.id)).map((row) => row.status)).toEqual(
      ['active', 'active']
    );

    await api(schools.owner)
      .post(`/classes/${w.blue.id}/graduate`)
      .send({ studentIds: [w.efe.id] })
      .expect(201);
    expect((await enrolments(pool, w.efe.id)).map((row) => row.status)).toEqual(
      ['completed', 'withdrawn']
    );
  });
});

test.describe('isolation', () => {
  test('answers 409 for a year that is not the target and 404 for another school’s year, class or student', async ({
    api,
    app,
    schools,
  }) => {
    const w = await world(app, api, schools);
    const foreignYear = await createSchoolYear(app, schools.ownerB, YEAR_2027);
    const foreignClass = await createClass(app, schools.ownerB, {
      campusId: schools.campusB.id,
      levelCode: 'JSS2',
    });
    const post = (body: { targetYearId: string; rows: unknown[] }) =>
      api(schools.owner).post('/students/new-school-year').send(body);
    const move = {
      studentId: w.ada.id,
      outcome: 'move',
      classArmId: w.gold2.id,
    };

    const wrongYear = await post({
      targetYearId: crypto.randomUUID(),
      rows: [move],
    }).expect(404);
    expect(wrongYear.body.message).toBe('School year not found');
    await post({ targetYearId: foreignYear.id, rows: [move] }).expect(404);
    const current = (
      await api(schools.owner).get('/school-years').expect(200)
    ).body.items.find((year: { name: string }) => year.name === '2026/2027');
    const notTarget = await post({
      targetYearId: current.id,
      rows: [move],
    }).expect(409);
    expect(notTarget.body.message).toBe(
      'That is not the school year to start now.'
    );
    const foreignArm = await post({
      targetYearId: w.next.id,
      rows: [{ ...move, classArmId: foreignClass.id }],
    }).expect(404);
    expect(foreignArm.body.message).toBe('Class not found');
    const foreignStudent = await createStudent(app, schools.ownerB, {
      campusId: schools.campusB.id,
    });
    const student = await post({
      targetYearId: w.next.id,
      rows: [{ ...move, studentId: foreignStudent.id }],
    }).expect(404);
    expect(student.body.message).toBe('Student not found');
  });

  test('answers 401 without a session when starting the year', async ({
    api,
    app,
    schools,
  }) => {
    const w = await world(app, api, schools);
    await api()
      .post('/students/new-school-year')
      .send({ targetYearId: w.next.id, rows: rows(w) })
      .expect(401);
  });
});
