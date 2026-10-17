import type {
  ClassDetail,
  ElectiveList,
  ElectiveTakers,
  LevelSubject,
  SchoolYearList,
  Subject,
} from '@eduvault/api-contract';
import {
  acting,
  expect,
  type Fixtures,
  type TestUser,
} from './support/base-test';
import {
  YEAR_2026,
  YEAR_2027,
  createSchoolYear,
} from './support/factories/calendar';
import { assignClassTeacher, createClass } from './support/factories/classes';
import { createStudent } from './support/factories/students';
import { makeCurrent } from './support/factories/terms';
import {
  bareSchoolsTest,
  type TwoSchoolsWithoutStudents as Schools,
} from './support/two-schools';

const test = bareSchoolsTest;

type Api = Fixtures['api'];
type Kind = 'core' | 'elective';

const FIRST = { year: YEAR_2026.name, sequence: 1 };

const createSubject = async (
  api: Api,
  user: TestUser,
  input: { code: string; name: string }
): Promise<Subject> =>
  (await api(user).post('/subjects').send(input).expect(201)).body as Subject;

const levelIdOf = async (
  pool: Fixtures['pool'],
  organizationId: string,
  code: string
): Promise<string> => {
  const { rows } = await pool.query<{ id: string }>(
    `SELECT id FROM class_level WHERE organization_id = $1 AND code = $2`,
    [organizationId, code]
  );
  const id = rows[0]?.id;
  if (id === undefined) {
    throw new Error(`no level ${code}`);
  }
  return id;
};

const putLevel =
  (api: Api, user: TestUser) =>
  (levelId: string, subjects: { subjectId: string; kind: Kind }[]) =>
    api(user).put(`/class-levels/${levelId}/subjects`).send({ subjects });

const putTakers =
  (api: Api, user: TestUser) =>
  (subjectId: string, body: { sessionId: string; studentIds: string[] }) =>
    api(user).put(`/electives/${subjectId}`).send(body);

const electivesOf = async (
  api: Api,
  user: TestUser,
  query = ''
): Promise<ElectiveList> =>
  (await api(user).get(`/electives${query}`).expect(200)).body as ElectiveList;

const takersOfSubject = (list: ElectiveList, subjectId: string): string[] =>
  list.electives.find((entry) => entry.subjectId === subjectId)?.studentIds ??
  [];

async function arrange({
  api,
  app,
  pool,
  addMember,
  createUser,
  withPermissions,
  schools,
}: Pick<
  Fixtures,
  'api' | 'app' | 'pool' | 'addMember' | 'createUser' | 'withPermissions'
> & {
  schools: Schools;
}) {
  const { owner, orgA, lekki, ikeja } = schools;
  await createSchoolYear(app, owner);
  await createSchoolYear(app, owner, YEAR_2027);
  await makeCurrent(api, owner, FIRST);
  const [jss1, jss2, jss3] = await Promise.all(
    ['JSS1', 'JSS2', 'JSS3'].map((code) => levelIdOf(pool, orgA.id, code))
  );
  if (jss1 === undefined || jss2 === undefined || jss3 === undefined) {
    throw new Error('levels missing');
  }
  const goldOne = await createClass(app, owner, {
    campusId: lekki.id,
    levelCode: 'JSS1',
    name: 'Gold',
  });
  const emeraldOne = await createClass(app, owner, {
    campusId: ikeja.id,
    levelCode: 'JSS1',
    name: 'Emerald',
  });
  const blueTwo = await createClass(app, owner, {
    campusId: lekki.id,
    levelCode: 'JSS2',
    name: 'Blue',
  });
  const redThree = await createClass(app, owner, {
    campusId: lekki.id,
    levelCode: 'JSS3',
    name: 'Red',
  });
  const maths = await createSubject(api, owner, {
    code: 'MTH',
    name: 'Mathematics',
  });
  const french = await createSubject(api, owner, {
    code: 'FRE',
    name: 'French',
  });
  const agr = await createSubject(api, owner, {
    code: 'AGR',
    name: 'Agriculture',
  });
  await api(owner)
    .patch(`/subjects/${agr.id}`)
    .send({ retired: true })
    .expect(200);
  await putLevel(api, owner)(jss1, [
    { subjectId: maths.id, kind: 'core' },
    { subjectId: french.id, kind: 'elective' },
  ]).expect(200);
  await putLevel(api, owner)(jss2, [
    { subjectId: maths.id, kind: 'core' },
    { subjectId: french.id, kind: 'core' },
  ]).expect(200);
  await putLevel(api, owner)(jss3, [
    { subjectId: maths.id, kind: 'core' },
  ]).expect(200);
  const ada = await createStudent(app, owner, {
    campusId: lekki.id,
    classArmId: goldOne.id,
  });
  const bola = await createStudent(app, owner, {
    campusId: ikeja.id,
    classArmId: emeraldOne.id,
  });
  const chi = await createStudent(app, owner, {
    campusId: lekki.id,
    classArmId: blueTwo.id,
  });
  const dayo = await createStudent(app, owner, {
    campusId: lekki.id,
    classArmId: redThree.id,
  });
  const lekkiAdmin = await withPermissions(
    orgA,
    [
      'subject:read',
      'subject:update',
      'student:read',
      'class:read',
      'class:readAll',
    ],
    { campuses: [lekki] }
  );
  const teacher = await addMember(orgA, await createUser(), {
    roles: ['teacher'],
    campuses: [lekki],
  });
  await assignClassTeacher(app, owner, {
    classId: goldOne.id,
    userId: teacher.id,
  });
  const session = (await electivesOf(api, owner)).session;
  if (session === null) {
    throw new Error('no current school year');
  }
  return {
    levels: { jss1, jss2, jss3 },
    goldOne,
    emeraldOne,
    maths,
    french,
    agr,
    ada,
    bola,
    chi,
    dayo,
    lekkiAdmin,
    teacher,
    sessionId: session.id,
  };
}

test.describe('level lists', () => {
  test('replaces a list with sequence 1..n in the order given and refuses a retired or repeated subject with 400', async ({
    api,
    app,
    pool,
    addMember,
    createUser,
    withPermissions,
    schools,
  }) => {
    const w = await arrange({
      api,
      app,
      pool,
      addMember,
      createUser,
      withPermissions,
      schools,
    });
    const { owner } = schools;
    const saved = (
      await putLevel(api, owner)(w.levels.jss1, [
        { subjectId: w.french.id, kind: 'elective' },
        { subjectId: w.maths.id, kind: 'core' },
      ]).expect(200)
    ).body as LevelSubject[];
    expect(
      saved.map((row) => [row.subjectName, row.kind, row.sequence])
    ).toEqual([
      ['French', 'elective', 1],
      ['Mathematics', 'core', 2],
    ]);
    const listed = (
      await api(owner)
        .get(`/level-subjects?classLevelId=${w.levels.jss1}`)
        .expect(200)
    ).body as LevelSubject[];
    expect(listed.map((row) => row.subjectId)).toEqual([
      w.french.id,
      w.maths.id,
    ]);

    const retired = await putLevel(api, owner)(w.levels.jss1, [
      { subjectId: w.agr.id, kind: 'core' },
    ]).expect(400);
    expect(retired.body.message).toBe(
      'Agriculture is retired. Restore it before assigning it.'
    );
    const repeated = await putLevel(api, owner)(w.levels.jss1, [
      { subjectId: w.maths.id, kind: 'core' },
      { subjectId: w.maths.id, kind: 'elective' },
    ]).expect(400);
    expect(JSON.stringify(repeated.body)).toContain(
      'Each subject can be on a level once.'
    );
    expect(
      (
        (
          await api(owner)
            .get(`/level-subjects?classLevelId=${w.levels.jss1}`)
            .expect(200)
        ).body as LevelSubject[]
      ).map((row) => row.subjectId)
    ).toEqual([w.french.id, w.maths.id]);
  });

  test('clears this school year’s takers when an elective is removed, at that level only, and when it switches to Core', async ({
    api,
    app,
    pool,
    addMember,
    createUser,
    withPermissions,
    schools,
  }) => {
    const w = await arrange({
      api,
      app,
      pool,
      addMember,
      createUser,
      withPermissions,
      schools,
    });
    const { owner } = schools;
    await putLevel(api, owner)(w.levels.jss2, [
      { subjectId: w.maths.id, kind: 'core' },
      { subjectId: w.french.id, kind: 'elective' },
    ]).expect(200);
    await putTakers(api, owner)(w.french.id, {
      sessionId: w.sessionId,
      studentIds: [w.ada.id, w.bola.id, w.chi.id],
    }).expect(200);

    await putLevel(api, owner)(w.levels.jss1, [
      { subjectId: w.maths.id, kind: 'core' },
    ]).expect(200);
    expect(takersOfSubject(await electivesOf(api, owner), w.french.id)).toEqual(
      [w.chi.id]
    );

    const switched = (
      await putLevel(api, owner)(w.levels.jss2, [
        { subjectId: w.maths.id, kind: 'core' },
        { subjectId: w.french.id, kind: 'core' },
      ]).expect(200)
    ).body as LevelSubject[];
    expect(switched.map((row) => row.takerCount)).toEqual([0, 0]);
    const { rows } = await pool.query<{ total: string }>(
      `SELECT count(*) AS total FROM student_subject WHERE organization_id = $1`,
      [schools.orgA.id]
    );
    expect(Number(rows[0]?.total)).toBe(0);
  });

  test('clears takers on every campus when a Lekki-only administrator removes an elective', async ({
    api,
    app,
    pool,
    addMember,
    createUser,
    withPermissions,
    schools,
  }) => {
    const w = await arrange({
      api,
      app,
      pool,
      addMember,
      createUser,
      withPermissions,
      schools,
    });
    const { owner } = schools;
    await putTakers(api, owner)(w.french.id, {
      sessionId: w.sessionId,
      studentIds: [w.ada.id, w.bola.id],
    }).expect(200);
    const seen = (
      await api(w.lekkiAdmin)
        .get(`/level-subjects?classLevelId=${w.levels.jss1}`)
        .expect(200)
    ).body as LevelSubject[];
    expect(seen.find((row) => row.subjectId === w.french.id)?.takerCount).toBe(
      2
    );
    await putLevel(api, w.lekkiAdmin)(w.levels.jss1, [
      { subjectId: w.maths.id, kind: 'core' },
    ]).expect(200);
    expect(takersOfSubject(await electivesOf(api, owner), w.french.id)).toEqual(
      []
    );
  });

  test('counts only active enrolments in takerCount', async ({
    api,
    app,
    pool,
    addMember,
    createUser,
    withPermissions,
    schools,
  }) => {
    const w = await arrange({
      api,
      app,
      pool,
      addMember,
      createUser,
      withPermissions,
      schools,
    });
    const { owner } = schools;
    await putTakers(api, owner)(w.french.id, {
      sessionId: w.sessionId,
      studentIds: [w.ada.id, w.bola.id],
    }).expect(200);
    await pool.query(
      `UPDATE student_enrollment SET status = 'withdrawn' WHERE organization_id = $1 AND student_id = $2`,
      [schools.orgA.id, w.ada.id]
    );
    const rows = (
      await api(owner)
        .get(`/level-subjects?classLevelId=${w.levels.jss1}`)
        .expect(200)
    ).body as LevelSubject[];
    expect(rows.find((row) => row.subjectId === w.french.id)?.takerCount).toBe(
      1
    );
  });

  test('reports takerCount for the current school year', async ({
    api,
    app,
    pool,
    addMember,
    createUser,
    withPermissions,
    schools,
  }) => {
    const w = await arrange({
      api,
      app,
      pool,
      addMember,
      createUser,
      withPermissions,
      schools,
    });
    const { owner } = schools;
    await putTakers(api, owner)(w.french.id, {
      sessionId: w.sessionId,
      studentIds: [w.ada.id, w.bola.id],
    }).expect(200);
    const counts = async () =>
      (
        (
          await api(owner)
            .get(`/level-subjects?classLevelId=${w.levels.jss1}`)
            .expect(200)
        ).body as LevelSubject[]
      ).map((row) => [row.subjectName, row.takerCount]);
    expect(await counts()).toEqual([
      ['Mathematics', 0],
      ['French', 2],
    ]);
    await makeCurrent(api, owner, { year: YEAR_2027.name, sequence: 1 });
    expect(await counts()).toEqual([
      ['Mathematics', 0],
      ['French', 0],
    ]);
  });
});

test.describe('elective takers', () => {
  test('refuses a student whose level has the subject as Core or lacks it, with 400', async ({
    api,
    app,
    pool,
    addMember,
    createUser,
    withPermissions,
    schools,
  }) => {
    const w = await arrange({
      api,
      app,
      pool,
      addMember,
      createUser,
      withPermissions,
      schools,
    });
    const { owner } = schools;
    const core = await putTakers(api, owner)(w.french.id, {
      sessionId: w.sessionId,
      studentIds: [w.chi.id],
    }).expect(400);
    expect(core.body.message).toContain('is not an elective for');
    await putTakers(api, owner)(w.french.id, {
      sessionId: w.sessionId,
      studentIds: [w.dayo.id],
    }).expect(400);
    const saved = (
      await putTakers(api, owner)(w.french.id, {
        sessionId: w.sessionId,
        studentIds: [w.ada.id],
      }).expect(200)
    ).body as ElectiveTakers;
    expect(saved).toEqual({ subjectId: w.french.id, studentIds: [w.ada.id] });
  });

  test('leaves an Ikeja taker untouched when a Lekki-only administrator saves, and answers 404 for an Ikeja student', async ({
    api,
    app,
    pool,
    addMember,
    createUser,
    withPermissions,
    schools,
  }) => {
    const w = await arrange({
      api,
      app,
      pool,
      addMember,
      createUser,
      withPermissions,
      schools,
    });
    const { owner } = schools;
    await putTakers(api, owner)(w.french.id, {
      sessionId: w.sessionId,
      studentIds: [w.bola.id],
    }).expect(200);
    await putTakers(api, w.lekkiAdmin)(w.french.id, {
      sessionId: w.sessionId,
      studentIds: [w.ada.id],
    }).expect(200);
    expect(takersOfSubject(await electivesOf(api, owner), w.french.id)).toEqual(
      expect.arrayContaining([w.ada.id, w.bola.id])
    );
    await putTakers(api, w.lekkiAdmin)(w.french.id, {
      sessionId: w.sessionId,
      studentIds: [],
    }).expect(200);
    expect(takersOfSubject(await electivesOf(api, owner), w.french.id)).toEqual(
      [w.bola.id]
    );
    await putTakers(api, w.lekkiAdmin)(w.french.id, {
      sessionId: w.sessionId,
      studentIds: [w.bola.id],
    }).expect(404);
    const lekki = await electivesOf(api, w.lekkiAdmin);
    expect(takersOfSubject(lekki, w.french.id)).toEqual([]);
    expect(lekki.students.map((student) => student.id)).not.toContain(
      w.bola.id
    );
  });

  test('lists only the takers in a teacher’s class scope', async ({
    api,
    app,
    pool,
    addMember,
    createUser,
    withPermissions,
    schools,
  }) => {
    const w = await arrange({
      api,
      app,
      pool,
      addMember,
      createUser,
      withPermissions,
      schools,
    });
    const { owner } = schools;
    await putLevel(api, owner)(w.levels.jss2, [
      { subjectId: w.maths.id, kind: 'core' },
      { subjectId: w.french.id, kind: 'elective' },
    ]).expect(200);
    await putTakers(api, owner)(w.french.id, {
      sessionId: w.sessionId,
      studentIds: [w.ada.id, w.bola.id, w.chi.id],
    }).expect(200);
    const mine = await electivesOf(api, w.teacher);
    expect(takersOfSubject(mine, w.french.id)).toEqual([w.ada.id]);
    expect(mine.students.map((student) => student.id)).toEqual([w.ada.id]);
    expect(mine.students[0]).toMatchObject({
      classId: w.goldOne.id,
      classLevelId: w.levels.jss1,
    });
  });

  test('lists no takers for a new school year', async ({
    api,
    app,
    pool,
    addMember,
    createUser,
    withPermissions,
    schools,
  }) => {
    const w = await arrange({
      api,
      app,
      pool,
      addMember,
      createUser,
      withPermissions,
      schools,
    });
    const { owner } = schools;
    await putTakers(api, owner)(w.french.id, {
      sessionId: w.sessionId,
      studentIds: [w.ada.id],
    }).expect(200);
    const years = (await api(owner).get('/school-years').expect(200))
      .body as SchoolYearList;
    const next = years.items.find((year) => year.name === YEAR_2027.name);
    const later = await electivesOf(api, owner, `?sessionId=${next?.id}`);
    expect(later.session?.name).toBe(YEAR_2027.name);
    expect(takersOfSubject(later, w.french.id)).toEqual([]);
    expect(later.students).toEqual([]);
  });
});

test.describe('class roster', () => {
  test('carries each student’s electives for the current school year', async ({
    api,
    app,
    pool,
    addMember,
    createUser,
    withPermissions,
    schools,
  }) => {
    const w = await arrange({
      api,
      app,
      pool,
      addMember,
      createUser,
      withPermissions,
      schools,
    });
    const { owner } = schools;
    await putTakers(api, owner)(w.french.id, {
      sessionId: w.sessionId,
      studentIds: [w.ada.id],
    }).expect(200);
    const gold = (await api(owner).get(`/classes/${w.goldOne.id}`).expect(200))
      .body as ClassDetail;
    expect(gold.roster?.map((row) => [row.studentId, row.electives])).toEqual([
      [w.ada.id, ['French']],
    ]);
    const emerald = (
      await api(owner).get(`/classes/${w.emeraldOne.id}`).expect(200)
    ).body as ClassDetail;
    expect(emerald.roster?.map((row) => row.electives)).toEqual([[]]);
  });
});

test.describe('isolation', () => {
  test('answers 404 to another school for the level, the subject, the student and the school year, and shows it none of this school’s rows', async ({
    api,
    app,
    pool,
    addMember,
    createUser,
    withPermissions,
    schools,
  }) => {
    const w = await arrange({
      api,
      app,
      pool,
      addMember,
      createUser,
      withPermissions,
      schools,
    });
    const { owner, ownerB } = schools;
    await createSchoolYear(app, ownerB);
    const subjectB = await createSubject(api, ownerB, {
      code: 'MTH',
      name: 'Maths B',
    });
    const levelB = await levelIdOf(pool, schools.orgB.id, 'JSS1');
    await putLevel(api, ownerB)(w.levels.jss1, [
      { subjectId: subjectB.id, kind: 'core' },
    ]).expect(404);
    await putLevel(api, ownerB)(levelB, [
      { subjectId: w.maths.id, kind: 'core' },
    ]).expect(404);
    await putLevel(api, ownerB)(levelB, [
      { subjectId: subjectB.id, kind: 'elective' },
    ]).expect(200);

    const sessionB = (await electivesOf(api, ownerB)).session;
    expect(sessionB).not.toBeNull();
    await putTakers(api, ownerB)(w.french.id, {
      sessionId: sessionB?.id ?? '',
      studentIds: [],
    }).expect(404);
    await putTakers(api, ownerB)(subjectB.id, {
      sessionId: w.sessionId,
      studentIds: [],
    }).expect(404);
    await putTakers(api, ownerB)(subjectB.id, {
      sessionId: sessionB?.id ?? '',
      studentIds: [w.ada.id],
    }).expect(404);
    await api(ownerB).get(`/electives?sessionId=${w.sessionId}`).expect(404);

    await putTakers(api, owner)(w.french.id, {
      sessionId: w.sessionId,
      studentIds: [w.ada.id],
    }).expect(200);
    const seenByB = await electivesOf(api, ownerB);
    expect(seenByB.students).toEqual([]);
    expect(seenByB.electives.map((entry) => entry.subjectId)).toEqual([
      subjectB.id,
    ]);
    expect(
      (
        (await api(ownerB).get('/level-subjects').expect(200))
          .body as LevelSubject[]
      ).map((row) => row.subjectId)
    ).toEqual([subjectB.id]);
  });

  test('answers 403 to a caller without subject:update, or without student:read on the list, and 401 with no session', async ({
    api,
    app,
    pool,
    addMember,
    createUser,
    withPermissions,
    schools,
  }) => {
    const w = await arrange({
      api,
      app,
      pool,
      addMember,
      createUser,
      withPermissions,
      schools,
    });
    const { lekkiOnly } = schools;
    const body = { sessionId: w.sessionId, studentIds: [] };
    for (const user of [w.teacher, lekkiOnly]) {
      await putLevel(api, user)(w.levels.jss1, []).expect(403);
      await putTakers(api, user)(w.french.id, body).expect(403);
    }
    await api(lekkiOnly).get('/electives').expect(403);
    const readOnly = await withPermissions(schools.orgA, ['subject:read'], {
      campuses: [schools.lekki],
    });
    await api(readOnly).get('/electives').expect(403);
    await api(readOnly).get('/level-subjects').expect(200);
    await api()
      .put(`/class-levels/${w.levels.jss1}/subjects`)
      .send({ subjects: [] })
      .expect(401);
    await api().get('/electives').expect(401);
    expect((await electivesOf(api, w.teacher)).session?.id).toBe(w.sessionId);
  });

  test('refuses both writes from an acting super admin with no reason, and lets one with a reason through', async ({
    api,
    app,
    pool,
    addMember,
    createUser,
    makeSuperAdmin,
    withPermissions,
    schools,
  }) => {
    const w = await arrange({
      api,
      app,
      pool,
      addMember,
      createUser,
      withPermissions,
      schools,
    });
    const admin = await makeSuperAdmin(await createUser());
    const orgId = schools.orgA.id;
    await api(admin).get('/electives').set(acting(orgId)).expect(200);
    const list = await api(admin)
      .put(`/class-levels/${w.levels.jss1}/subjects`)
      .set(acting(orgId))
      .send({ subjects: [] })
      .expect(403);
    expect(list.body.code).toBe('ActingReadOnly');
    const takers = await api(admin)
      .put(`/electives/${w.french.id}`)
      .set(acting(orgId))
      .send({ sessionId: w.sessionId, studentIds: [] })
      .expect(403);
    expect(takers.body.code).toBe('ActingReadOnly');
    await api(admin)
      .put(`/electives/${w.french.id}`)
      .set(acting(orgId, 'SUP-1 fix the electives'))
      .send({ sessionId: w.sessionId, studentIds: [w.ada.id] })
      .expect(200);
  });
});
