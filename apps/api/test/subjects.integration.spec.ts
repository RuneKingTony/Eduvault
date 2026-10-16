import type {
  MyClass,
  StudentList,
  Subject,
  SubjectList,
  SubjectTeachers,
  SubjectTeachersCopied,
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

const FIRST = { year: YEAR_2026.name, sequence: 1 };
const THIRD = { year: YEAR_2026.name, sequence: 3 };
const NEXT_FIRST = { year: YEAR_2027.name, sequence: 1 };

const createSubject = async (
  api: Api,
  user: TestUser,
  input: { code: string; name: string }
): Promise<Subject> =>
  (await api(user).post('/subjects').send(input).expect(201)).body as Subject;

async function putOnLevel(
  fixtures: Pick<Fixtures, 'pool'>,
  input: {
    organizationId: string;
    levelCode: string;
    subjectId: string;
    sequence: number;
  }
) {
  await fixtures.pool.query(
    `INSERT INTO level_subject (organization_id, class_level_id, subject_id, kind, sequence)
     SELECT $1, id, $3, 'core', $4 FROM class_level WHERE organization_id = $1 AND code = $2`,
    [input.organizationId, input.levelCode, input.subjectId, input.sequence]
  );
}

const scopeOf = async (api: Api, user: TestUser) =>
  (
    (await api(user).get('/me/permissions').expect(200)).body as {
      classScope: 'all' | string[];
    }
  ).classScope;

const assign = (
  api: Api,
  actor: TestUser,
  target: { classId: string; subjectId: string; userId: string }
) =>
  api(actor)
    .put(`/classes/${target.classId}/subject-teachers/${target.subjectId}`)
    .send({ userId: target.userId });

async function arrange({
  api,
  app,
  pool,
  addMember,
  createUser,
  schools,
}: Pick<Fixtures, 'api' | 'app' | 'pool' | 'addMember' | 'createUser'> & {
  schools: Schools;
}) {
  const { owner, orgA, lekki, ikeja } = schools;
  await createSchoolYear(app, owner);
  await createSchoolYear(app, owner, YEAR_2027);
  await makeCurrent(api, owner, FIRST);
  const gold = await createClass(app, owner, {
    campusId: lekki.id,
    levelCode: 'JSS2',
    name: 'Gold',
  });
  const emerald = await createClass(app, owner, {
    campusId: ikeja.id,
    levelCode: 'JSS2',
    name: 'Emerald',
  });
  const maths = await createSubject(api, owner, {
    code: 'MTH',
    name: 'Mathematics',
  });
  const english = await createSubject(api, owner, {
    code: 'ENG',
    name: 'English',
  });
  const agr = await createSubject(api, owner, {
    code: 'AGR',
    name: 'Agriculture',
  });
  for (const [index, subject] of [maths, english].entries()) {
    await putOnLevel(
      { pool },
      {
        organizationId: orgA.id,
        levelCode: 'JSS2',
        subjectId: subject.id,
        sequence: index + 1,
      }
    );
  }
  await api(owner)
    .patch(`/subjects/${agr.id}`)
    .send({ retired: true })
    .expect(200);
  const emeka = await addMember(orgA, await createUser(), {
    roles: ['teacher'],
    campuses: [lekki],
  });
  return { gold, emerald, maths, english, agr, emeka };
}

test.describe('subject catalogue', () => {
  test('adds a subject upper-cased and trimmed, refuses bad codes with 400 and duplicates with 409 even against a retired one', async ({
    api,
    schools: { owner },
  }) => {
    const geo = await createSubject(api, owner, {
      code: ' geo ',
      name: ' Geography ',
    });
    expect(geo).toMatchObject({
      code: 'GEO',
      name: 'Geography',
      levelCodes: [],
    });
    for (const code of ['AB1', 'ABCDEF', '', '  ']) {
      await api(owner).post('/subjects').send({ code, name: 'X' }).expect(400);
    }
    await api(owner)
      .post('/subjects')
      .send({ code: 'XYZ', name: '  ' })
      .expect(400);
    await api(owner)
      .patch(`/subjects/${geo.id}`)
      .send({ retired: true })
      .expect(200);
    const clash = await api(owner)
      .post('/subjects')
      .send({ code: 'geo', name: 'Again' })
      .expect(409);
    expect(clash.body.message).toBe(
      'A subject with code GEO already exists. Codes are unique per school.'
    );
  });

  test('renames with the code fixed, retires and restores, and refuses to retire a subject on a level list', async ({
    api,
    pool,
    schools: { owner, orgA },
  }) => {
    const french = await createSubject(api, owner, {
      code: 'FRE',
      name: 'French',
    });
    await putOnLevel(
      { pool },
      {
        organizationId: orgA.id,
        levelCode: 'JSS1',
        subjectId: french.id,
        sequence: 1,
      }
    );
    const refused = await api(owner)
      .patch(`/subjects/${french.id}`)
      .send({ retired: true })
      .expect(409);
    expect(refused.body.message).toBe(
      'Take French off every class level first.'
    );

    const renamed = await api(owner)
      .patch(`/subjects/${french.id}`)
      .send({ name: 'French Language', code: 'XXX' })
      .expect(200);
    expect(renamed.body).toMatchObject({
      code: 'FRE',
      name: 'French Language',
      levelCodes: ['JSS1'],
    });

    const spare = await createSubject(api, owner, {
      code: 'AGR',
      name: 'Agriculture',
    });
    const retired = await api(owner)
      .patch(`/subjects/${spare.id}`)
      .send({ retired: true })
      .expect(200);
    expect((retired.body as Subject).retiredAt).not.toBeNull();
    const restored = await api(owner)
      .patch(`/subjects/${spare.id}`)
      .send({ retired: false })
      .expect(200);
    expect((restored.body as Subject).retiredAt).toBeNull();
  });

  test('lists active subjects by name before retired ones, ten to a page', async ({
    api,
    schools: { owner },
  }) => {
    const codes = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K'];
    for (const [index, letter] of codes.entries()) {
      await createSubject(api, owner, {
        code: letter,
        name: `Subject ${String(index).padStart(2, '0')}`,
      });
    }
    const old = await createSubject(api, owner, {
      code: 'AAA',
      name: 'Aardvark',
    });
    await api(owner)
      .patch(`/subjects/${old.id}`)
      .send({ retired: true })
      .expect(200);
    const first = (await api(owner).get('/subjects').expect(200))
      .body as SubjectList;
    expect(first.total).toBe(12);
    expect(first.items).toHaveLength(10);
    expect(first.items.every((item) => item.retiredAt === null)).toBe(true);
    const second = (await api(owner).get('/subjects?page=2').expect(200))
      .body as SubjectList;
    expect(second.items.map((item) => item.code)).toEqual(['K', 'AAA']);
    const active = (
      await api(owner).get('/subjects?includeRetired=false').expect(200)
    ).body as SubjectList;
    expect(active.total).toBe(11);
  });

  test('answers 403 without the permission and 401 with no session, and writes need their own permission', async ({
    api,
    withPermissions,
    schools: { owner, orgA, noPermission, lekkiOnly },
  }) => {
    const geo = await createSubject(api, owner, {
      code: 'GEO',
      name: 'Geography',
    });
    await api(lekkiOnly).get('/subjects').expect(403);
    await api(lekkiOnly).get('/level-subjects').expect(403);
    await api(lekkiOnly).get('/subject-teachers').expect(403);
    await api(noPermission).get('/subjects').expect(403);
    await api(noPermission).get('/level-subjects').expect(403);
    await api(noPermission).get('/subject-teachers').expect(403);
    await api().get('/subjects').expect(401);
    const reader = await withPermissions(orgA, ['subject:read']);
    await api(reader).get('/subjects').expect(200);
    await api(reader)
      .post('/subjects')
      .send({ code: 'ART', name: 'Art' })
      .expect(403);
    await api(reader)
      .patch(`/subjects/${geo.id}`)
      .send({ name: 'x' })
      .expect(403);
    await api(reader)
      .post('/subject-teachers/copy-from-previous-term')
      .expect(403);
  });
});

test.describe('subject teachers', () => {
  test('assigns a candidate, replaces them on a second assign and removes the row', async ({
    api,
    app,
    pool,
    addMember,
    createUser,
    schools,
  }) => {
    const w = await arrange({ api, app, pool, addMember, createUser, schools });
    const ayo = await addMember(schools.orgA, await createUser(), {
      roles: ['teacher'],
      campuses: [schools.lekki],
    });
    const first = await assign(api, schools.owner, {
      classId: w.gold.id,
      subjectId: w.maths.id,
      userId: w.emeka.id,
    }).expect(200);
    expect(first.body).toMatchObject({
      userId: w.emeka.id,
      classId: w.gold.id,
    });
    await assign(api, schools.owner, {
      classId: w.gold.id,
      subjectId: w.maths.id,
      userId: ayo.id,
    }).expect(200);
    const { rows } = await pool.query<{ total: string; user_id: string }>(
      `SELECT count(*) OVER () AS total, user_id FROM subject_teacher WHERE class_arm_id = $1`,
      [w.gold.id]
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.user_id).toBe(ayo.id);

    const listed = (
      await api(schools.owner).get('/subject-teachers').expect(200)
    ).body as SubjectTeachers;
    const arm = listed.arms.find((row) => row.classId === w.gold.id);
    expect(arm?.subjects.map((row) => row.teacher?.userId ?? null)).toEqual([
      ayo.id,
      null,
    ]);
    expect(listed.arms.map((row) => row.classId)).toContain(w.emerald.id);

    await api(schools.owner)
      .delete(`/classes/${w.gold.id}/subject-teachers/${w.maths.id}`)
      .expect(200);
    await api(schools.owner)
      .delete(`/classes/${w.gold.id}/subject-teachers/${w.maths.id}`)
      .expect(404);
  });

  test('applies the candidate rule, the level and retired-subject checks and the archived-class conflict', async ({
    api,
    app,
    pool,
    addMember,
    createUser,
    withPermissions,
    schools,
  }) => {
    const w = await arrange({ api, app, pool, addMember, createUser, schools });
    const { owner, orgA, ikeja, ownerB } = schools;
    const bursar = await addMember(orgA, await createUser(), {
      roles: ['bursar'],
      campuses: [schools.lekki],
    });
    const ikejaTeacher = await addMember(orgA, await createUser(), {
      roles: ['teacher'],
      campuses: [ikeja],
    });
    const roaming = await withPermissions(
      orgA,
      ['class:read', 'campus:readAll'],
      { campuses: [ikeja] }
    );
    await assign(api, owner, {
      classId: w.gold.id,
      subjectId: w.maths.id,
      userId: bursar.id,
    }).expect(400);
    await assign(api, owner, {
      classId: w.gold.id,
      subjectId: w.maths.id,
      userId: ikejaTeacher.id,
    }).expect(400);
    await assign(api, owner, {
      classId: w.gold.id,
      subjectId: w.maths.id,
      userId: roaming.id,
    }).expect(200);
    await assign(api, owner, {
      classId: w.gold.id,
      subjectId: w.maths.id,
      userId: ownerB.id,
    }).expect(404);
    await assign(api, owner, {
      classId: w.gold.id,
      subjectId: w.agr.id,
      userId: w.emeka.id,
    }).expect(400);
    const geo = await createSubject(api, owner, {
      code: 'GEO',
      name: 'Geography',
    });
    await assign(api, owner, {
      classId: w.gold.id,
      subjectId: geo.id,
      userId: w.emeka.id,
    }).expect(400);
    await assign(api, owner, {
      classId: w.gold.id,
      subjectId: '00000000-0000-4000-8000-000000000999',
      userId: w.emeka.id,
    }).expect(404);
    await api(owner)
      .patch(`/classes/${w.gold.id}`)
      .send({ archived: true })
      .expect(200);
    await assign(api, owner, {
      classId: w.gold.id,
      subjectId: w.english.id,
      userId: w.emeka.id,
    }).expect(409);
  });

  test('a subject-teacher row adds the class to the teacher’s scope, their students and My classes until it is removed', async ({
    api,
    app,
    pool,
    addMember,
    createUser,
    schools,
  }) => {
    const w = await arrange({ api, app, pool, addMember, createUser, schools });
    await createStudent(app, schools.owner, {
      campusId: schools.lekki.id,
      classArmId: w.gold.id,
    });
    const scope = () => scopeOf(api, w.emeka);
    const total = async () =>
      ((await api(w.emeka).get('/students').expect(200)).body as StudentList)
        .total;
    expect(await scope()).toEqual([]);
    expect(await total()).toBe(0);

    await assign(api, schools.owner, {
      classId: w.gold.id,
      subjectId: w.maths.id,
      userId: w.emeka.id,
    }).expect(200);
    expect(await scope()).toEqual([w.gold.id]);
    expect(await total()).toBe(1);
    const mine = (await api(w.emeka).get('/dashboard/my-classes').expect(200))
      .body as MyClass[];
    expect(mine).toEqual([
      expect.objectContaining({
        armId: w.gold.id,
        isClassTeacher: false,
        subjects: ['Mathematics'],
      }),
    ]);

    await api(schools.owner)
      .delete(`/classes/${w.gold.id}/subject-teachers/${w.maths.id}`)
      .expect(200);
    expect(await scope()).toEqual([]);
    expect(await total()).toBe(0);
  });

  test('refuses a write from an acting super admin with no reason and lets one with a reason through', async ({
    api,
    app,
    pool,
    addMember,
    createUser,
    makeSuperAdmin,
    schools,
  }) => {
    const w = await arrange({ api, app, pool, addMember, createUser, schools });
    const admin = await makeSuperAdmin(await createUser());
    const orgId = schools.orgA.id;
    await api(admin).get('/subject-teachers').set(acting(orgId)).expect(200);
    const refused = await api(admin)
      .put(`/classes/${w.gold.id}/subject-teachers/${w.maths.id}`)
      .set(acting(orgId))
      .send({ userId: w.emeka.id })
      .expect(403);
    expect(refused.body.code).toBe('ActingReadOnly');
    await api(admin)
      .post('/subjects')
      .set(acting(orgId))
      .send({ code: 'ART', name: 'Art' })
      .expect(403);
    await api(admin)
      .put(`/classes/${w.gold.id}/subject-teachers/${w.maths.id}`)
      .set(acting(orgId, 'SUP-1 fix the timetable'))
      .send({ userId: w.emeka.id })
      .expect(200);
  });

  test('copies the previous term across school years, filling empty subjects and reporting skipped rows', async ({
    api,
    app,
    pool,
    addMember,
    createUser,
    schools,
  }) => {
    const w = await arrange({ api, app, pool, addMember, createUser, schools });
    const { owner, orgA, lekki } = schools;
    const ayo = await addMember(orgA, await createUser(), {
      roles: ['teacher'],
      campuses: [lekki],
    });
    const geo = await createSubject(api, owner, {
      code: 'GEO',
      name: 'Geography',
    });
    await putOnLevel(
      { pool },
      {
        organizationId: orgA.id,
        levelCode: 'JSS2',
        subjectId: geo.id,
        sequence: 3,
      }
    );
    await api(owner)
      .post('/subject-teachers/copy-from-previous-term')
      .expect(409);

    await makeCurrent(api, owner, THIRD);
    await assign(api, owner, {
      classId: w.gold.id,
      subjectId: w.maths.id,
      userId: w.emeka.id,
    }).expect(200);
    await assign(api, owner, {
      classId: w.gold.id,
      subjectId: w.english.id,
      userId: ayo.id,
    }).expect(200);
    await assign(api, owner, {
      classId: w.gold.id,
      subjectId: geo.id,
      userId: w.emeka.id,
    }).expect(200);
    await makeCurrent(api, owner, NEXT_FIRST);
    await assign(api, owner, {
      classId: w.gold.id,
      subjectId: w.english.id,
      userId: w.emeka.id,
    }).expect(200);
    await pool.query(`DELETE FROM level_subject WHERE subject_id = $1`, [
      geo.id,
    ]);

    const listed = (await api(owner).get('/subject-teachers').expect(200))
      .body as SubjectTeachers;
    expect(listed.copyFrom?.name).toBe('Third term');
    const res = await api(owner)
      .post('/subject-teachers/copy-from-previous-term')
      .expect(201);
    const copied = res.body as SubjectTeachersCopied;
    expect(copied.from.name).toBe('Third term');
    expect(copied.copied).toBe(1);
    expect(copied.skipped).toEqual([
      { classId: w.gold.id, subjectId: geo.id, reason: 'subjectNotOnLevel' },
    ]);
    const { rows } = await pool.query<{ user_id: string; subject_id: string }>(
      `SELECT s.user_id, s.subject_id FROM subject_teacher s JOIN term t ON t.id = s.term_id
       WHERE t.is_current AND s.class_arm_id = $1`,
      [w.gold.id]
    );
    const byUser = Object.fromEntries(
      rows.map((row) => [row.subject_id, row.user_id])
    );
    expect(byUser).toEqual({
      [w.maths.id]: w.emeka.id,
      [w.english.id]: w.emeka.id,
    });
  });

  test('keeps the class in scope while a class-teacher row or another subject row still holds it', async ({
    api,
    app,
    pool,
    addMember,
    createUser,
    schools,
  }) => {
    const w = await arrange({ api, app, pool, addMember, createUser, schools });
    const { owner } = schools;
    const scope = () => scopeOf(api, w.emeka);
    const unassign = (subjectId: string) =>
      api(owner)
        .delete(`/classes/${w.gold.id}/subject-teachers/${subjectId}`)
        .expect(200);

    await assignClassTeacher(app, owner, {
      classId: w.gold.id,
      userId: w.emeka.id,
    });
    await assign(api, owner, {
      classId: w.gold.id,
      subjectId: w.maths.id,
      userId: w.emeka.id,
    }).expect(200);
    expect(await scope()).toEqual([w.gold.id]);
    await unassign(w.maths.id);
    expect(await scope()).toEqual([w.gold.id]);

    await assign(api, owner, {
      classId: w.gold.id,
      subjectId: w.maths.id,
      userId: w.emeka.id,
    }).expect(200);
    await api(owner)
      .delete(`/classes/${w.gold.id}/teachers/${w.emeka.id}`)
      .expect(200);
    expect(await scope()).toEqual([w.gold.id]);
    await unassign(w.maths.id);
    expect(await scope()).toEqual([]);

    for (const subject of [w.maths, w.english]) {
      await assign(api, owner, {
        classId: w.gold.id,
        subjectId: subject.id,
        userId: w.emeka.id,
      }).expect(200);
    }
    expect(await scope()).toEqual([w.gold.id]);
    await unassign(w.maths.id);
    expect(await scope()).toEqual([w.gold.id]);
    await unassign(w.english.id);
    expect(await scope()).toEqual([]);
  });

  test('lists a subject teacher only the classes in their scope, and 403s their writes', async ({
    api,
    app,
    pool,
    addMember,
    createUser,
    schools,
  }) => {
    const w = await arrange({ api, app, pool, addMember, createUser, schools });
    expect(
      (
        (await api(w.emeka).get('/subject-teachers').expect(200))
          .body as SubjectTeachers
      ).arms
    ).toEqual([]);

    await assign(api, schools.owner, {
      classId: w.gold.id,
      subjectId: w.maths.id,
      userId: w.emeka.id,
    }).expect(200);
    const seen = (await api(w.emeka).get('/subject-teachers').expect(200))
      .body as SubjectTeachers;
    expect(seen.arms.map((arm) => arm.classId)).toEqual([w.gold.id]);
    expect(seen.arms[0]?.subjects[0]?.teacher?.userId).toBe(w.emeka.id);
    expect(seen.copyFrom).toBeNull();

    await assign(api, w.emeka, {
      classId: w.gold.id,
      subjectId: w.english.id,
      userId: w.emeka.id,
    }).expect(403);
  });

  test('drops a class from scope when its subject leaves the level list', async ({
    api,
    app,
    pool,
    addMember,
    createUser,
    schools,
  }) => {
    const w = await arrange({ api, app, pool, addMember, createUser, schools });
    await assign(api, schools.owner, {
      classId: w.gold.id,
      subjectId: w.maths.id,
      userId: w.emeka.id,
    }).expect(200);
    const scope = () => scopeOf(api, w.emeka);
    expect(await scope()).toEqual([w.gold.id]);
    await pool.query(`DELETE FROM level_subject WHERE subject_id = $1`, [
      w.maths.id,
    ]);
    expect(await scope()).toEqual([]);
    expect(
      (await api(w.emeka).get('/dashboard/my-classes').expect(200)).body
    ).toEqual([]);
  });

  test('ends current-term subject rows when a member leaves the school or a campus, and keeps earlier terms', async ({
    api,
    app,
    pool,
    addMember,
    createUser,
    schools,
  }) => {
    const w = await arrange({ api, app, pool, addMember, createUser, schools });
    const { owner, orgA, lekki, ikeja } = schools;
    const rowsOf = async (userId: string) =>
      (
        await pool.query<{ class_arm_id: string; is_current: boolean }>(
          `SELECT s.class_arm_id, t.is_current
           FROM subject_teacher s JOIN term t ON t.id = s.term_id
           WHERE s.user_id = $1 ORDER BY t.is_current, s.class_arm_id`,
          [userId]
        )
      ).rows;
    const memberOf = async (userId: string) =>
      (
        await pool.query<{ id: string }>(
          `SELECT id FROM member WHERE "userId" = $1 AND "organizationId" = $2`,
          [userId, orgA.id]
        )
      ).rows[0]?.id;

    await makeCurrent(api, owner, THIRD);
    await assign(api, owner, {
      classId: w.gold.id,
      subjectId: w.maths.id,
      userId: w.emeka.id,
    }).expect(200);
    await makeCurrent(api, owner, NEXT_FIRST);
    await assign(api, owner, {
      classId: w.gold.id,
      subjectId: w.english.id,
      userId: w.emeka.id,
    }).expect(200);
    expect(await rowsOf(w.emeka.id)).toHaveLength(2);
    await api(owner)
      .delete(`/members/${await memberOf(w.emeka.id)}`)
      .expect(200);
    expect(await rowsOf(w.emeka.id)).toEqual([
      { class_arm_id: w.gold.id, is_current: false },
    ]);

    const ayo = await addMember(orgA, await createUser(), {
      roles: ['teacher'],
      campuses: [lekki, ikeja],
    });
    for (const classId of [w.gold.id, w.emerald.id]) {
      await assign(api, owner, {
        classId,
        subjectId: w.maths.id,
        userId: ayo.id,
      }).expect(200);
    }
    await api(owner)
      .put(`/members/${await memberOf(ayo.id)}/campuses`)
      .send({ campusIds: [ikeja.id] })
      .expect(200);
    expect(await rowsOf(ayo.id)).toEqual([
      { class_arm_id: w.emerald.id, is_current: true },
    ]);
  });
});

test.describe('isolation', () => {
  test('keeps each school’s catalogue to itself', async ({
    api,
    pool,
    schools: { owner, ownerB, orgA, orgB },
  }) => {
    const maths = await createSubject(api, owner, {
      code: 'MTH',
      name: 'Mathematics',
    });
    expect(
      ((await api(ownerB).get('/subjects').expect(200)).body as SubjectList)
        .total
    ).toBe(0);
    await api(ownerB)
      .patch(`/subjects/${maths.id}`)
      .send({ name: 'x' })
      .expect(404);
    await createSubject(api, ownerB, { code: 'MTH', name: 'Maths B' });

    const { rows } = await pool.query<{ id: string }>(
      `SELECT id FROM class_level WHERE organization_id = $1 AND code = 'JSS1'`,
      [orgA.id]
    );
    await api(ownerB)
      .get(`/level-subjects?classLevelId=${rows[0]?.id}`)
      .expect(404);
    await expect(
      putOnLevel(
        { pool },
        {
          organizationId: orgB.id,
          levelCode: 'JSS1',
          subjectId: maths.id,
          sequence: 1,
        }
      )
    ).rejects.toThrow();
  });

  test('keeps other schools and other campuses out, and 403s a caller without class:assignTeacher', async ({
    api,
    app,
    pool,
    addMember,
    createUser,
    withPermissions,
    schools,
  }) => {
    const w = await arrange({ api, app, pool, addMember, createUser, schools });
    const { owner, ownerB, orgA, lekki } = schools;
    const lekkiAdmin = await withPermissions(
      orgA,
      ['class:read', 'class:readAll', 'class:assignTeacher', 'subject:read'],
      { campuses: [lekki] }
    );
    await assign(api, lekkiAdmin, {
      classId: w.emerald.id,
      subjectId: w.maths.id,
      userId: w.emeka.id,
    }).expect(404);
    await api(lekkiAdmin)
      .delete(`/classes/${w.emerald.id}/subject-teachers/${w.maths.id}`)
      .expect(404);
    await assign(api, lekkiAdmin, {
      classId: w.gold.id,
      subjectId: w.maths.id,
      userId: w.emeka.id,
    }).expect(200);
    const seen = (await api(lekkiAdmin).get('/subject-teachers').expect(200))
      .body as SubjectTeachers;
    expect(seen.arms.map((arm) => arm.classId)).toEqual([w.gold.id]);

    await assign(api, ownerB, {
      classId: w.gold.id,
      subjectId: w.maths.id,
      userId: w.emeka.id,
    }).expect(404);
    await api(ownerB)
      .delete(`/classes/${w.gold.id}/subject-teachers/${w.maths.id}`)
      .expect(404);
    const other = (await api(ownerB).get('/subject-teachers').expect(200))
      .body as SubjectTeachers;
    expect(other.arms).toEqual([]);

    const reader = await withPermissions(orgA, [
      'class:read',
      'class:readAll',
      'subject:read',
    ]);
    await assign(api, reader, {
      classId: w.gold.id,
      subjectId: w.maths.id,
      userId: w.emeka.id,
    }).expect(403);
    await api(reader)
      .delete(`/classes/${w.gold.id}/subject-teachers/${w.maths.id}`)
      .expect(403);
    await api(owner).get('/subject-teachers').expect(200);
  });

  test('refuses a raw row that mixes schools at the database', async ({
    api,
    app,
    pool,
    addMember,
    createUser,
    schools,
  }) => {
    const w = await arrange({ api, app, pool, addMember, createUser, schools });
    const other = await createSubject(api, schools.ownerB, {
      code: 'MTH',
      name: 'Maths B',
    });
    await expect(
      pool.query(
        `INSERT INTO subject_teacher (organization_id, class_arm_id, subject_id, term_id, user_id)
         SELECT $1, $2, $3, id, $4 FROM term WHERE organization_id = $1 AND is_current`,
        [schools.orgA.id, w.gold.id, other.id, w.emeka.id]
      )
    ).rejects.toThrow();
    const student = await createStudent(app, schools.owner, {
      campusId: schools.lekki.id,
      classArmId: w.gold.id,
    });
    await expect(
      pool.query(
        `INSERT INTO student_subject (organization_id, enrollment_id, subject_id)
         SELECT $1, id, $3 FROM student_enrollment WHERE student_id = $2`,
        [schools.orgA.id, student.id, other.id]
      )
    ).rejects.toThrow();
  });

  test('refuses every route with no session', async ({
    api,
    schools: { owner },
  }) => {
    const geo = await createSubject(api, owner, {
      code: 'GEO',
      name: 'Geography',
    });
    const id = geo.id;
    await api().get('/subjects').expect(401);
    await api()
      .post('/subjects')
      .send({ code: 'ART', name: 'Art' })
      .expect(401);
    await api().patch(`/subjects/${id}`).send({ name: 'x' }).expect(401);
    await api().get('/level-subjects').expect(401);
    await api().get('/subject-teachers').expect(401);
    await api()
      .put(`/classes/${id}/subject-teachers/${id}`)
      .send({ userId: id })
      .expect(401);
    await api().delete(`/classes/${id}/subject-teachers/${id}`).expect(401);
    await api().post('/subject-teachers/copy-from-previous-term').expect(401);
  });

  test('shows a school only its own level lists and subject teachers while another school has both', async ({
    api,
    app,
    pool,
    addMember,
    createUser,
    schools,
  }) => {
    const w = await arrange({ api, app, pool, addMember, createUser, schools });
    const { owner, ownerB, orgB, campusB } = schools;
    await assign(api, owner, {
      classId: w.gold.id,
      subjectId: w.maths.id,
      userId: w.emeka.id,
    }).expect(200);

    await createSchoolYear(app, ownerB);
    await makeCurrent(api, ownerB, FIRST);
    const mainClass = await createClass(app, ownerB, {
      campusId: campusB.id,
      levelCode: 'JSS2',
      name: 'Main',
    });
    const history = await createSubject(api, ownerB, {
      code: 'HIS',
      name: 'History',
    });
    await putOnLevel(
      { pool },
      {
        organizationId: orgB.id,
        levelCode: 'JSS2',
        subjectId: history.id,
        sequence: 1,
      }
    );

    const levels = (await api(ownerB).get('/level-subjects').expect(200))
      .body as { subjectId: string }[];
    expect(levels.map((row) => row.subjectId)).toEqual([history.id]);
    const seen = (await api(ownerB).get('/subject-teachers').expect(200))
      .body as SubjectTeachers;
    expect(seen.arms.map((arm) => arm.classId)).toEqual([mainClass.id]);
    expect(
      seen.arms.flatMap((arm) => arm.subjects.map((row) => row.subjectId))
    ).toEqual([history.id]);
    expect(
      seen.arms.flatMap((arm) => arm.subjects.map((row) => row.teacher))
    ).toEqual([null]);
  });

  test('answers 404 when a class of this school is paired with a subject of another school', async ({
    api,
    app,
    pool,
    addMember,
    createUser,
    schools,
  }) => {
    const w = await arrange({ api, app, pool, addMember, createUser, schools });
    const foreign = await createSubject(api, schools.ownerB, {
      code: 'MTH',
      name: 'Maths B',
    });
    await assign(api, schools.owner, {
      classId: w.gold.id,
      subjectId: foreign.id,
      userId: w.emeka.id,
    }).expect(404);
    await api(schools.owner)
      .delete(`/classes/${w.gold.id}/subject-teachers/${foreign.id}`)
      .expect(404);
    await api(schools.owner)
      .patch(`/subjects/${foreign.id}`)
      .send({ retired: true })
      .expect(404);
  });
});
