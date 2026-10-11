import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Test } from 'supertest';
import type {
  ClassDetail,
  ClassLevel,
  ClassSummary,
  ClassTeacher,
  ClassTeacherRole,
  TeacherCandidate,
} from '@eduvault/api-contract';
import {
  acting,
  expect,
  type Fixtures,
  type TestUser,
} from './support/base-test';
import { assignClassTeacher, createClass } from './support/factories/classes';
import { createSchoolYear } from './support/factories/calendar';
import { schoolsTest, type TwoSchools } from './support/two-schools';

const test = schoolsTest;

type Api = Fixtures['api'];

const levelsOf = async (api: Api, user: TestUser): Promise<ClassLevel[]> =>
  (await api(user).get('/class-levels').expect(200)).body as ClassLevel[];

const levelIdOf = (levels: readonly ClassLevel[], code: string): string => {
  const level = levels.find((candidate) => candidate.code === code);
  if (level === undefined) {
    throw new Error(`No level ${code}`);
  }
  return level.id;
};

const classesOf = async (
  api: Api,
  user: TestUser,
  query = ''
): Promise<ClassSummary[]> =>
  (await api(user).get(`/classes${query}`).expect(200)).body as ClassSummary[];

const classScopeOf = async (
  api: Api,
  user: TestUser
): Promise<'all' | string[]> =>
  (
    (await api(user).get('/me/permissions').expect(200)).body as {
      classScope: 'all' | string[];
    }
  ).classScope;

const assign = (
  api: Api,
  actor: TestUser,
  target: { classId: string; userId: string; role?: ClassTeacherRole }
) =>
  api(actor)
    .post(`/classes/${target.classId}/teachers`)
    .send({ userId: target.userId, role: target.role ?? 'assistant' });

const namesOf = (rows: ClassSummary[]): string[] =>
  rows.map((row) => row.displayName);

const BACKFILL = (() => {
  const sql = readFileSync(
    fileURLToPath(
      new URL('../db/migrations/20261010140000_classes.sql', import.meta.url)
    ),
    'utf8'
  );
  return sql.slice(
    sql.indexOf('-- migrate:up'),
    sql.indexOf('CREATE TABLE class_arm (')
  );
})();

test.describe('levels', () => {
  test('a new school gets the default ladder, SS 3 the only final year', async ({
    api,
    schools: { owner },
  }) => {
    const levels = await levelsOf(api, owner);
    expect(levels.map((level) => level.sequence)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
    ]);
    expect(levels.map((level) => level.name)).toEqual([
      'Primary 1',
      'Primary 2',
      'Primary 3',
      'Primary 4',
      'Primary 5',
      'Primary 6',
      'JSS 1',
      'JSS 2',
      'JSS 3',
      'SS 1',
      'SS 2',
      'SS 3',
    ]);
    expect(levels.filter((level) => level.isFinalYear)).toEqual([
      expect.objectContaining({ code: 'SS3' }),
    ]);
    const primary6 = levels.find((level) => level.code === 'P6');
    expect(primary6?.nextLevelId).toBe(levelIdOf(levels, 'JSS1'));
  });

  test('the backfill gives a school with no levels the ladder and leaves a school that has levels alone', async ({
    api,
    pool,
    schools: { owner, ownerB, orgA, orgB },
  }) => {
    await pool.query('DELETE FROM class_level WHERE organization_id = $1', [
      orgA.id,
    ]);
    expect(await levelsOf(api, owner)).toEqual([]);

    await pool.query(BACKFILL);

    const levels = await levelsOf(api, owner);
    expect(levels).toHaveLength(12);
    expect(levels.filter((level) => level.isFinalYear)).toHaveLength(1);
    expect(levels.at(-1)).toMatchObject({ code: 'SS3', isFinalYear: true });
    expect(levels.at(0)?.nextLevelId).toBe(levelIdOf(levels, 'P2'));
    expect(await levelsOf(api, ownerB)).toHaveLength(12);
    const { rows } = await pool.query<{ total: string }>(
      'SELECT count(*) AS total FROM class_level WHERE organization_id = $1',
      [orgB.id]
    );
    expect(rows[0]?.total).toBe('12');
  });

  test('every member can read the ladder, with no role at all', async ({
    api,
    schools: { noPermission },
  }) => {
    expect(await levelsOf(api, noPermission)).toHaveLength(12);
  });

  test('adds a level at the end, leading to the one the caller names', async ({
    api,
    schools: { owner },
  }) => {
    const levels = await levelsOf(api, owner);
    const created = await api(owner)
      .post('/class-levels')
      .send({
        code: 'CRE',
        name: ' Creche ',
        nextLevelId: levelIdOf(levels, 'P1'),
      })
      .expect(201);
    expect(created.body).toMatchObject({
      code: 'CRE',
      name: 'Creche',
      sequence: 13,
      nextLevelId: levelIdOf(levels, 'P1'),
      isFinalYear: false,
    });
    const alone = await api(owner)
      .post('/class-levels')
      .send({ code: 'A1', name: 'Alumni' })
      .expect(201);
    expect(alone.body).toMatchObject({ sequence: 14, isFinalYear: true });
  });

  test('refuses a code that is taken, a bad code and a blank name', async ({
    api,
    schools: { owner },
  }) => {
    const taken = await api(owner)
      .post('/class-levels')
      .send({ code: 'JSS1', name: 'Again' })
      .expect(409);
    expect(taken.body.message).toBe('JSS1 already exists.');
    for (const code of ['x', 'lower', 'TOO-LONG-CODE', 'A']) {
      await api(owner)
        .post('/class-levels')
        .send({ code, name: 'Anything' })
        .expect(400);
    }
    await api(owner)
      .post('/class-levels')
      .send({ code: 'OK', name: '  ' })
      .expect(400);
  });

  test('refuses a level that leads to itself before touching the database, and unknown levels', async ({
    api,
    schools: { owner },
  }) => {
    const levels = await levelsOf(api, owner);
    const id = levelIdOf(levels, 'JSS1');
    const self = await api(owner)
      .patch(`/class-levels/${id}`)
      .send({ nextLevelId: id })
      .expect(400);
    expect(self.body.message).toBe('A level can’t lead to itself.');
    await api(owner)
      .patch(`/class-levels/${randomUUID()}`)
      .send({ name: 'Ghost' })
      .expect(404);
    await api(owner)
      .patch(`/class-levels/${id}`)
      .send({ nextLevelId: randomUUID() })
      .expect(404);
  });

  test('refuses a next level from another school with 404', async ({
    api,
    schools: { owner, ownerB },
  }) => {
    const foreign = levelIdOf(await levelsOf(api, ownerB), 'P1');
    const own = levelIdOf(await levelsOf(api, owner), 'JSS1');
    const created = await api(owner)
      .post('/class-levels')
      .send({ code: 'CRE', name: 'Creche', nextLevelId: foreign })
      .expect(404);
    const patched = await api(owner)
      .patch(`/class-levels/${own}`)
      .send({ nextLevelId: foreign })
      .expect(404);
    expect([created.body.message, patched.body.message]).toEqual([
      'Level not found',
      'Level not found',
    ]);
  });

  test('renames a level, changes its next level and can make it the final year', async ({
    api,
    schools: { owner },
  }) => {
    const levels = await levelsOf(api, owner);
    const id = levelIdOf(levels, 'JSS1');
    const renamed = await api(owner)
      .patch(`/class-levels/${id}`)
      .send({ name: 'Junior 1', nextLevelId: levelIdOf(levels, 'JSS3') })
      .expect(200);
    expect(renamed.body).toMatchObject({
      code: 'JSS1',
      name: 'Junior 1',
      nextLevelId: levelIdOf(levels, 'JSS3'),
    });
    const last = await api(owner)
      .patch(`/class-levels/${id}`)
      .send({ nextLevelId: null })
      .expect(200);
    expect(last.body).toMatchObject({ nextLevelId: null, isFinalYear: true });
  });

  test('moves a level to the top and renumbers the whole ladder', async ({
    api,
    schools: { owner },
  }) => {
    const created = await api(owner)
      .post('/class-levels')
      .send({ code: 'CRE', name: 'Creche' })
      .expect(201);
    const moved = await api(owner)
      .patch(`/class-levels/${created.body.id}`)
      .send({ sequence: 1 })
      .expect(200);
    expect(moved.body.sequence).toBe(1);

    const levels = await levelsOf(api, owner);
    expect(levels.map((level) => level.code)).toEqual([
      'CRE',
      'P1',
      'P2',
      'P3',
      'P4',
      'P5',
      'P6',
      'JSS1',
      'JSS2',
      'JSS3',
      'SS1',
      'SS2',
      'SS3',
    ]);
    expect(levels.map((level) => level.sequence)).toEqual(
      Array.from({ length: 13 }, (_, index) => index + 1)
    );

    await api(owner)
      .patch(`/class-levels/${created.body.id}`)
      .send({ sequence: 99 })
      .expect(200);
    expect((await levelsOf(api, owner)).at(-1)?.code).toBe('CRE');
  });

  test('has no route to delete a level', async ({
    api,
    schools: { owner },
  }) => {
    const id = levelIdOf(await levelsOf(api, owner), 'P1');
    await api(owner).delete(`/class-levels/${id}`).expect(404);
    expect(await levelsOf(api, owner)).toHaveLength(12);
  });
});

test.describe('permissions', () => {
  test('answer 403 for every write without its permission, for a class:read-only member and for one with no role', async ({
    api,
    app,
    withPermissions,
    schools: { owner, noPermission, lekki, orgA, lekkiOnly },
  }) => {
    const arm = await createClass(app, owner, { campusId: lekki.id });
    const reader = await withPermissions(orgA, ['class:read'], {
      campuses: [lekki],
    });
    const level = levelIdOf(await levelsOf(api, owner), 'JSS1');
    const id = arm.id;
    const writes = [
      ['post', '/class-levels', 'class:update'],
      ['patch', `/class-levels/${level}`, 'class:update'],
      ['post', '/classes', 'class:create'],
      ['patch', `/classes/${id}`, 'class:update'],
      ['get', `/classes/${id}/teacher-candidates`, 'class:assignTeacher'],
      ['post', `/classes/${id}/teachers`, 'class:assignTeacher'],
      ['delete', `/classes/${id}/teachers/${reader.id}`, 'class:assignTeacher'],
    ] as const;
    for (const user of [reader, noPermission, lekkiOnly]) {
      for (const [method, path, permission] of writes) {
        const res = await api(user)[method](path).send({});
        expect(res.status, `${method} ${path}`).toBe(403);
        expect(res.body.message).toBe(`Missing permission ${permission}`);
      }
    }
    for (const user of [noPermission, lekkiOnly]) {
      const read = await api(user).get('/classes').expect(403);
      expect(read.body.message).toBe('Missing permission class:read');
      await api(user).get(`/classes/${id}`).expect(403);
    }
    expect(await classesOf(api, reader)).toHaveLength(0);
  });
});

test.describe('creating and listing classes', () => {
  test('creates a class, lists it active with no teacher and answers its display name', async ({
    api,
    schools: { owner, lekki },
  }) => {
    const level = levelIdOf(await levelsOf(api, owner), 'JSS1');
    const created = await api(owner)
      .post('/classes')
      .send({ levelId: level, campusId: lekki.id, name: ' Diamond ' })
      .expect(201);
    expect(created.body).toMatchObject({
      name: 'Diamond',
      displayName: 'JSS 1 Diamond',
      level: { code: 'JSS1', name: 'JSS 1' },
      campus: { id: lekki.id, name: 'Lekki' },
      classTeachers: [],
      studentCount: 0,
      retiredAt: null,
    });
    expect(await classesOf(api, owner)).toEqual([created.body]);
  });

  test('refuses a duplicate with the PRD copy, an archived match with the restore copy, a blank name and unknown ids', async ({
    api,
    app,
    schools: { owner, lekki, ikeja, campusB, orgB },
  }) => {
    const levels = await levelsOf(api, owner);
    const level = levelIdOf(levels, 'JSS2');
    const gold = await createClass(app, owner, {
      campusId: lekki.id,
      levelCode: 'JSS2',
      name: 'Gold',
    });
    const dup = await api(owner)
      .post('/classes')
      .send({ levelId: level, campusId: lekki.id, name: 'Gold' })
      .expect(409);
    expect(dup.body.message).toBe('JSS 2 Gold already exists on Lekki.');

    await api(owner)
      .patch(`/classes/${gold.id}`)
      .send({ archived: true })
      .expect(200);
    const archived = await api(owner)
      .post('/classes')
      .send({ levelId: level, campusId: lekki.id, name: 'Gold' })
      .expect(409);
    expect(archived.body.message).toBe(
      'JSS 2 Gold already exists on Lekki and is archived. Restore it instead.'
    );

    await api(owner)
      .post('/classes')
      .send({ levelId: level, campusId: ikeja.id, name: 'Gold' })
      .expect(201);
    const blank = await api(owner)
      .post('/classes')
      .send({ levelId: level, campusId: lekki.id, name: '  ' })
      .expect(400);
    expect(blank.body.issues).toEqual([
      { path: 'name', message: 'Give the class a name, for example Gold.' },
    ]);
    await api(owner)
      .post('/classes')
      .send({ levelId: randomUUID(), campusId: lekki.id, name: 'X' })
      .expect(404);
    await api(owner)
      .post('/classes')
      .send({ levelId: level, campusId: campusB.id, name: 'X' })
      .expect(404);
    expect(orgB.id).not.toBe('');
  });

  test('answers 404 when the campus is outside the creator’s scope', async ({
    api,
    withPermissions,
    schools: { owner, orgA, lekki, ikeja },
  }) => {
    const creator = await withPermissions(
      orgA,
      ['class:create', 'class:read'],
      {
        campuses: [lekki],
      }
    );
    const level = levelIdOf(await levelsOf(api, owner), 'JSS1');
    const outside = await api(creator)
      .post('/classes')
      .send({ levelId: level, campusId: ikeja.id, name: 'Gold' })
      .expect(404);
    expect(outside.body.message).toBe('Campus not found');
    await api(creator)
      .post('/classes')
      .send({ levelId: level, campusId: lekki.id, name: 'Gold' })
      .expect(201);
  });

  test('orders classes by level, campus then name, filters them and hides archived by default', async ({
    api,
    app,
    schools: { owner, lekki, ikeja },
  }) => {
    await createClass(app, owner, {
      campusId: lekki.id,
      levelCode: 'JSS2',
      name: 'Silver',
    });
    await createClass(app, owner, {
      campusId: ikeja.id,
      levelCode: 'JSS2',
      name: 'Emerald',
    });
    await createClass(app, owner, {
      campusId: lekki.id,
      levelCode: 'JSS2',
      name: 'Gold',
    });
    await createClass(app, owner, {
      campusId: lekki.id,
      levelCode: 'P4',
      name: 'Blue',
    });
    const ruby = await createClass(app, owner, {
      campusId: ikeja.id,
      levelCode: 'JSS1',
      name: 'Ruby',
    });
    await api(owner)
      .patch(`/classes/${ruby.id}`)
      .send({ archived: true })
      .expect(200);

    expect(namesOf(await classesOf(api, owner))).toEqual([
      'Primary 4 Blue',
      'JSS 2 Emerald',
      'JSS 2 Gold',
      'JSS 2 Silver',
    ]);
    expect(namesOf(await classesOf(api, owner, '?status=archived'))).toEqual([
      'JSS 1 Ruby',
    ]);
    expect(namesOf(await classesOf(api, owner, '?status=all'))).toEqual([
      'Primary 4 Blue',
      'JSS 1 Ruby',
      'JSS 2 Emerald',
      'JSS 2 Gold',
      'JSS 2 Silver',
    ]);
    expect(
      namesOf(await classesOf(api, owner, `?campusId=${ikeja.id}`))
    ).toEqual(['JSS 2 Emerald']);
    const jss2 = levelIdOf(await levelsOf(api, owner), 'JSS2');
    expect(
      namesOf(
        await classesOf(api, owner, `?levelId=${jss2}&campusId=${lekki.id}`)
      )
    ).toEqual(['JSS 2 Gold', 'JSS 2 Silver']);
    await api(owner).get('/classes?status=gone').expect(400);
  });

  test('opens a class with its final-year flag and a roster only for a reader of students', async ({
    api,
    app,
    withPermissions,
    schools: { owner, orgA, lekki },
  }) => {
    const last = await createClass(app, owner, {
      campusId: lekki.id,
      levelCode: 'SS3',
      name: 'Gold',
    });
    const full = (await api(owner).get(`/classes/${last.id}`).expect(200))
      .body as ClassDetail;
    expect(full).toMatchObject({
      displayName: 'SS 3 Gold',
      isFinalYear: true,
      roster: [],
    });
    const reader = await withPermissions(
      orgA,
      ['class:read', 'class:readAll'],
      {
        campuses: [lekki],
      }
    );
    const bare = (await api(reader).get(`/classes/${last.id}`).expect(200))
      .body as ClassDetail;
    expect(bare.roster).toBeNull();
    await api(owner).get(`/classes/${randomUUID()}`).expect(404);
  });

  test('answers 404 for a class on a campus outside the member’s scope, even with class:readAll', async ({
    api,
    app,
    withPermissions,
    schools: { owner, orgA, lekki, ikeja },
  }) => {
    const inLekki = await createClass(app, owner, { campusId: lekki.id });
    const inIkeja = await createClass(app, owner, { campusId: ikeja.id });
    const member = await withPermissions(
      orgA,
      ['class:read', 'class:readAll', 'class:update', 'class:assignTeacher'],
      { campuses: [lekki] }
    );

    expect((await classesOf(api, member)).map((row) => row.id)).toEqual([
      inLekki.id,
    ]);
    await api(member).get(`/classes/${inLekki.id}`).expect(200);
    await api(member).get(`/classes/${inIkeja.id}`).expect(404);
    await api(member)
      .patch(`/classes/${inIkeja.id}`)
      .send({ archived: true })
      .expect(404);
    await api(member)
      .get(`/classes/${inIkeja.id}/teacher-candidates`)
      .expect(404);
  });

  test('renames a class under the same uniqueness rules', async ({
    api,
    app,
    schools: { owner, lekki },
  }) => {
    const gold = await createClass(app, owner, {
      campusId: lekki.id,
      name: 'Gold',
    });
    await createClass(app, owner, { campusId: lekki.id, name: 'Silver' });
    const clash = await api(owner)
      .patch(`/classes/${gold.id}`)
      .send({ name: 'Silver' })
      .expect(409);
    expect(clash.body.message).toBe('JSS 1 Silver already exists on Lekki.');
    const renamed = await api(owner)
      .patch(`/classes/${gold.id}`)
      .send({ name: ' Emerald ' })
      .expect(200);
    expect(renamed.body).toMatchObject({
      name: 'Emerald',
      displayName: 'JSS 1 Emerald',
    });
    await api(owner)
      .patch(`/classes/${gold.id}`)
      .send({ name: 'Emerald' })
      .expect(200);
  });
});

test.describe('class scope', () => {
  test('a teacher with class:read only sees just the classes they teach this year', async ({
    api,
    app,
    createUser,
    addMember,
    schools: { owner, orgA, lekki },
  }) => {
    await createSchoolYear(app, owner);
    const teacher = await addMember(
      orgA,
      await createUser({ name: 'Emeka Obi' }),
      {
        roles: ['teacher'],
        campuses: [lekki],
      }
    );
    const mine = await createClass(app, owner, {
      campusId: lekki.id,
      name: 'Gold',
    });
    const theirs = await createClass(app, owner, {
      campusId: lekki.id,
      name: 'Silver',
    });

    expect(await classesOf(api, teacher)).toEqual([]);
    expect(await classScopeOf(api, teacher)).toEqual([]);
    await api(teacher).get(`/classes/${mine.id}`).expect(404);

    await assignClassTeacher(app, owner, {
      classId: mine.id,
      userId: teacher.id,
      role: 'lead',
    });

    const listed = await classesOf(api, teacher);
    expect(listed.map((row) => row.id)).toEqual([mine.id]);
    expect(listed[0]?.classTeachers).toEqual([
      { userId: teacher.id, name: 'Emeka Obi', role: 'lead' },
    ]);
    expect(await classScopeOf(api, teacher)).toEqual([mine.id]);
    await api(teacher).get(`/classes/${mine.id}`).expect(200);
    const other = await api(teacher).get(`/classes/${theirs.id}`).expect(404);
    expect(other.body.message).toBe('Class not found');
    await api(teacher)
      .get(`/classes/${theirs.id}/teacher-candidates`)
      .expect(403);
  });

  test('forces active for a class-scoped caller and drops an archived class from their scope', async ({
    api,
    app,
    createUser,
    addMember,
    schools: { owner, orgA, lekki },
  }) => {
    await createSchoolYear(app, owner);
    const teacher = await addMember(orgA, await createUser(), {
      roles: ['teacher'],
      campuses: [lekki],
    });
    const mine = await createClass(app, owner, { campusId: lekki.id });
    await assignClassTeacher(app, owner, {
      classId: mine.id,
      userId: teacher.id,
    });
    expect(await classesOf(api, teacher, '?status=all')).toHaveLength(1);
    expect(await classesOf(api, teacher, '?status=archived')).toHaveLength(1);

    await api(owner)
      .patch(`/classes/${mine.id}`)
      .send({ archived: true })
      .expect(200);

    expect(await classesOf(api, teacher, '?status=all')).toEqual([]);
    expect(await classScopeOf(api, teacher)).toEqual([]);
    await api(teacher).get(`/classes/${mine.id}`).expect(404);
  });

  test('a teacher’s scope is empty with no current term, and last year’s classes do not count', async ({
    api,
    app,
    pool,
    createUser,
    addMember,
    schools: { owner, orgA, lekki },
  }) => {
    const teacher = await addMember(orgA, await createUser(), {
      roles: ['teacher'],
      campuses: [lekki],
    });
    const arm = await createClass(app, owner, { campusId: lekki.id });
    expect(await classScopeOf(api, teacher)).toEqual([]);

    const year = await createSchoolYear(app, owner);
    await assignClassTeacher(app, owner, {
      classId: arm.id,
      userId: teacher.id,
    });
    expect(await classScopeOf(api, teacher)).toEqual([arm.id]);

    await pool.query(
      'UPDATE term SET is_current = false WHERE organization_id = $1',
      [orgA.id]
    );
    expect(year.terms).toHaveLength(3);
    expect(await classScopeOf(api, teacher)).toEqual([]);
    expect(await classesOf(api, teacher)).toEqual([]);
  });

  test('a member with class:readAll or no class permission is not class-scoped', async ({
    api,
    withPermissions,
    schools: { owner, orgA, lekki },
  }) => {
    const principal = await withPermissions(
      orgA,
      ['class:read', 'class:readAll'],
      {
        campuses: [lekki],
      }
    );
    const bursar = await withPermissions(orgA, ['student:read'], {
      campuses: [lekki],
    });
    expect(await classScopeOf(api, owner)).toBe('all');
    expect(await classScopeOf(api, principal)).toBe('all');
    expect(await classScopeOf(api, bursar)).toBe('all');
  });
});

async function staff(
  fx: Pick<Fixtures, 'createUser' | 'addMember'>,
  { orgA, lekki, ikeja }: Pick<TwoSchools, 'orgA' | 'lekki' | 'ikeja'>
) {
  const named = (name: string) => fx.createUser({ name });
  const ayo = await fx.addMember(orgA, await named('Ayo Bassey'), {
    roles: ['teacher'],
    campuses: [lekki],
  });
  const claire = await fx.addMember(orgA, await named('Claire Ade'), {
    roles: ['teacher'],
    campuses: [lekki, ikeja],
  });
  const emeka = await fx.addMember(orgA, await named('Emeka Obi'), {
    roles: ['teacher'],
    campuses: [ikeja],
  });
  const chika = await fx.addMember(orgA, await named('Chika Eze'), {
    roles: ['bursar'],
    campuses: [lekki],
  });
  const grace = await fx.addMember(orgA, await named('Grace Nwosu'), {
    roles: ['principal'],
    campuses: [lekki, ikeja],
  });
  return { ayo, claire, emeka, chika, grace };
}

test.describe('class teachers', () => {
  test('lists the members who can teach the class, by name, and drops those already teaching it', async ({
    api,
    app,
    createUser,
    addMember,
    schools,
  }) => {
    const { owner, lekki, ikeja, orgA } = schools;
    await createSchoolYear(app, owner);
    const { ayo, claire, emeka, chika, grace } = await staff(
      { createUser, addMember },
      { orgA, lekki, ikeja }
    );
    const arm = await createClass(app, owner, { campusId: lekki.id });

    const listed = (
      await api(owner).get(`/classes/${arm.id}/teacher-candidates`).expect(200)
    ).body as TeacherCandidate[];
    const ids = listed.map((candidate) => candidate.userId);
    expect(ids).toContain(ayo.id);
    expect(ids).toContain(claire.id);
    expect(ids).toContain(grace.id);
    expect(ids).toContain(owner.id);
    expect(ids).not.toContain(emeka.id);
    expect(ids).not.toContain(chika.id);
    expect(ids).not.toContain(schools.noPermission.id);
    expect(listed.map((candidate) => candidate.name)).toEqual(
      listed
        .map((candidate) => candidate.name)
        .toSorted((a, b) => a.localeCompare(b))
    );

    await assignClassTeacher(app, owner, { classId: arm.id, userId: ayo.id });
    const after = (
      await api(owner).get(`/classes/${arm.id}/teacher-candidates`).expect(200)
    ).body as TeacherCandidate[];
    expect(after.map((candidate) => candidate.userId)).not.toContain(ayo.id);

    const inIkeja = await createClass(app, owner, { campusId: ikeja.id });
    const ikejaIds = (
      (
        await api(owner)
          .get(`/classes/${inIkeja.id}/teacher-candidates`)
          .expect(200)
      ).body as TeacherCandidate[]
    ).map((candidate) => candidate.userId);
    expect(ikejaIds).toContain(emeka.id);
    expect(ikejaIds).toContain(claire.id);
    expect(ikejaIds).not.toContain(ayo.id);
  });

  test('assigns a lead and then refuses each bad assignment with its copy', async ({
    api,
    app,
    pool,
    createUser,
    addMember,
    schools,
  }) => {
    const { owner, lekki, ikeja, orgA, orgB, ownerB } = schools;
    await createSchoolYear(app, owner);
    const { ayo, claire, emeka } = await staff(
      { createUser, addMember },
      { orgA, lekki, ikeja }
    );
    const arm = await createClass(app, owner, {
      campusId: lekki.id,
      levelCode: 'JSS2',
      name: 'Gold',
    });

    const lead = await assign(api, owner, {
      classId: arm.id,
      userId: ayo.id,
      role: 'lead',
    }).expect(201);
    expect(lead.body).toEqual({
      userId: ayo.id,
      name: 'Ayo Bassey',
      role: 'lead',
    });

    const repeat = await assign(api, owner, {
      classId: arm.id,
      userId: ayo.id,
      role: 'assistant',
    }).expect(409);
    expect(repeat.body.message).toBe(
      'Ayo Bassey is already a class teacher of JSS 2 Gold.'
    );
    const second = await assign(api, owner, {
      classId: arm.id,
      userId: claire.id,
      role: 'lead',
    }).expect(409);
    expect(second.body.message).toBe(
      'JSS 2 Gold already has a lead class teacher: Ayo Bassey.'
    );
    const notCandidate = await assign(api, owner, {
      classId: arm.id,
      userId: emeka.id,
    }).expect(400);
    expect(notCandidate.body.message).toBe(
      'Only teachers on the Lekki campus can be class teachers of this class.'
    );
    await assign(api, owner, { classId: arm.id, userId: ownerB.id }).expect(
      404
    );
    await assign(api, owner, {
      classId: arm.id,
      userId: randomUUID(),
    }).expect(404);
    await assign(api, owner, {
      classId: arm.id,
      userId: claire.id,
      role: 'uniform',
    }).expect(201);
    await api(owner)
      .post(`/classes/${arm.id}/teachers`)
      .send({ userId: claire.id, role: 'head' })
      .expect(400);

    const detail = (await api(owner).get(`/classes/${arm.id}`).expect(200))
      .body as ClassDetail;
    expect(
      detail.classTeachers.map((teacher: ClassTeacher) => teacher.role)
    ).toEqual(['lead', 'uniform']);

    const { rows } = await pool.query<{ total: string }>(
      'SELECT count(*) AS total FROM class_arm_teacher WHERE organization_id = $1',
      [orgA.id]
    );
    expect(rows[0]?.total).toBe('2');
    expect(orgB.id).not.toBe(orgA.id);
  });

  test('refuses an assignment for an archived class and when no term is current', async ({
    api,
    app,
    createUser,
    addMember,
    schools,
  }) => {
    const { owner, lekki, ikeja, orgA } = schools;
    const { ayo } = await staff(
      { createUser, addMember },
      { orgA, lekki, ikeja }
    );
    const arm = await createClass(app, owner, {
      campusId: lekki.id,
      levelCode: 'JSS1',
      name: 'Ruby',
    });

    const noTerm = await assign(api, owner, {
      classId: arm.id,
      userId: ayo.id,
    }).expect(409);
    expect(noTerm.body.message).toBe(
      'Make a term current before adding class teachers.'
    );

    await createSchoolYear(app, owner);
    await api(owner)
      .patch(`/classes/${arm.id}`)
      .send({ archived: true })
      .expect(200);
    const archived = await assign(api, owner, {
      classId: arm.id,
      userId: ayo.id,
    }).expect(409);
    expect(archived.body.message).toBe(
      'JSS 1 Ruby is archived. Restore it before adding teachers.'
    );
    await api(owner)
      .patch(`/classes/${arm.id}`)
      .send({ archived: false })
      .expect(200);
    await assign(api, owner, { classId: arm.id, userId: ayo.id }).expect(201);
  });

  test('assigning then removing a teacher changes their class list and permissions at once', async ({
    api,
    app,
    createUser,
    addMember,
    schools,
  }) => {
    const { owner, lekki, ikeja, orgA } = schools;
    await createSchoolYear(app, owner);
    const { ayo } = await staff(
      { createUser, addMember },
      { orgA, lekki, ikeja }
    );
    const arm = await createClass(app, owner, { campusId: lekki.id });

    expect(await classesOf(api, ayo)).toEqual([]);
    await assign(api, owner, {
      classId: arm.id,
      userId: ayo.id,
      role: 'lead',
    }).expect(201);
    expect((await classesOf(api, ayo)).map((row) => row.id)).toEqual([arm.id]);
    expect(await classScopeOf(api, ayo)).toEqual([arm.id]);
    await api(ayo).get(`/classes/${arm.id}`).expect(200);

    const removed = await api(owner)
      .delete(`/classes/${arm.id}/teachers/${ayo.id}`)
      .expect(200);
    expect(removed.body).toEqual({ classId: arm.id, userId: ayo.id });
    expect(await classesOf(api, ayo)).toEqual([]);
    expect(await classScopeOf(api, ayo)).toEqual([]);
    await api(ayo).get(`/classes/${arm.id}`).expect(404);

    await api(owner)
      .delete(`/classes/${arm.id}/teachers/${ayo.id}`)
      .expect(404);
    await api(owner)
      .delete(`/classes/${randomUUID()}/teachers/${ayo.id}`)
      .expect(404);
  });

  test('keeps last year’s assignment out of this year’s teachers and removal', async ({
    api,
    app,
    pool,
    createUser,
    addMember,
    schools,
  }) => {
    const { owner, lekki, ikeja, orgA } = schools;
    const { ayo } = await staff(
      { createUser, addMember },
      { orgA, lekki, ikeja }
    );
    const arm = await createClass(app, owner, { campusId: lekki.id });
    const first = await createSchoolYear(app, owner);
    await assign(api, owner, {
      classId: arm.id,
      userId: ayo.id,
      role: 'lead',
    }).expect(201);
    await pool.query(
      `UPDATE term SET is_current = false WHERE organization_id = $1`,
      [orgA.id]
    );
    const second = await createSchoolYear(app, owner, {
      name: '2027/2028',
      startsOn: '2027-09-06',
      endsOn: '2028-07-28',
    });
    await pool.query(`UPDATE term SET is_current = true WHERE id = $1`, [
      second.terms[0]?.id,
    ]);

    expect(first.id).not.toBe(second.id);
    expect((await classesOf(api, owner))[0]?.classTeachers).toEqual([]);
    await api(owner)
      .delete(`/classes/${arm.id}/teachers/${ayo.id}`)
      .expect(404);
    await assign(api, owner, {
      classId: arm.id,
      userId: ayo.id,
      role: 'lead',
    }).expect(201);
  });
});

test.describe('archiving', () => {
  test('archives with a timestamp, keeps the class openable and restores it', async ({
    api,
    app,
    pool,
    schools: { owner, lekki },
  }) => {
    const arm = await createClass(app, owner, { campusId: lekki.id });
    const archived = await api(owner)
      .patch(`/classes/${arm.id}`)
      .send({ archived: true })
      .expect(200);
    expect(archived.body.retiredAt).not.toBeNull();
    const { rows } = await pool.query<{ retired_by: string | null }>(
      'SELECT retired_by FROM class_arm WHERE id = $1',
      [arm.id]
    );
    expect(rows[0]?.retired_by).toBe(owner.id);

    expect(await classesOf(api, owner)).toEqual([]);
    expect(await classesOf(api, owner, '?status=archived')).toHaveLength(1);
    await api(owner).get(`/classes/${arm.id}`).expect(200);

    const restored = await api(owner)
      .patch(`/classes/${arm.id}`)
      .send({ archived: false })
      .expect(200);
    expect(restored.body.retiredAt).toBeNull();
    const { rows: after } = await pool.query<{ retired_by: string | null }>(
      'SELECT retired_by FROM class_arm WHERE id = $1',
      [arm.id]
    );
    expect(after[0]?.retired_by).toBeNull();
    expect(await classesOf(api, owner)).toHaveLength(1);
  });
});

test.describe('database constraints', () => {
  test('refuse a duplicate class name and a second lead even when the service is bypassed', async ({
    app,
    pool,
    createUser,
    addMember,
    schools,
  }) => {
    const { owner, lekki, ikeja, orgA } = schools;
    const { ayo, claire } = await (async () => {
      const first = await addMember(
        orgA,
        await createUser({ name: 'Ayo Bassey' }),
        {
          roles: ['teacher'],
          campuses: [lekki, ikeja],
        }
      );
      const second = await addMember(
        orgA,
        await createUser({ name: 'Claire Ade' }),
        {
          roles: ['teacher'],
          campuses: [lekki, ikeja],
        }
      );
      return { ayo: first, claire: second };
    })();
    const year = await createSchoolYear(app, owner);
    const arm = await createClass(app, owner, {
      campusId: lekki.id,
      name: 'Gold',
    });
    const { rows: levelRows } = await pool.query<{ class_level_id: string }>(
      'SELECT class_level_id FROM class_arm WHERE id = $1',
      [arm.id]
    );
    const levelId = levelRows[0]?.class_level_id;

    await expect(
      pool.query(
        `INSERT INTO class_arm (organization_id, class_level_id, campus_id, name)
         VALUES ($1, $2, $3, 'Gold')`,
        [orgA.id, levelId, lekki.id]
      )
    ).rejects.toMatchObject({
      code: '23505',
      constraint: 'class_arm_name_unique',
    });
    await expect(
      pool.query(
        `INSERT INTO class_arm (organization_id, class_level_id, campus_id, name)
         VALUES ($1, $2, $3, '   ')`,
        [orgA.id, levelId, lekki.id]
      )
    ).rejects.toMatchObject({ code: '23514' });

    const insertTeacher = (userId: string, role: string) =>
      pool.query(
        `INSERT INTO class_arm_teacher (organization_id, class_arm_id, session_id, user_id, role)
         VALUES ($1, $2, $3, $4, $5)`,
        [orgA.id, arm.id, year.id, userId, role]
      );
    await insertTeacher(ayo.id, 'lead');
    await expect(insertTeacher(claire.id, 'lead')).rejects.toMatchObject({
      code: '23505',
      constraint: 'class_arm_teacher_one_lead',
    });
    await expect(insertTeacher(ayo.id, 'assistant')).rejects.toMatchObject({
      code: '23505',
      constraint: 'class_arm_teacher_unique',
    });
    await expect(insertTeacher(claire.id, 'head')).rejects.toMatchObject({
      code: '23514',
    });
    await insertTeacher(claire.id, 'assistant');
  });
});

test.describe('campuses', () => {
  test('refuse deleting a campus that has a class, even an archived one, and count only active classes', async ({
    api,
    app,
    schools: { owner, lekki, ikeja },
  }) => {
    const gold = await createClass(app, owner, {
      campusId: lekki.id,
      name: 'Gold',
    });
    const silver = await createClass(app, owner, {
      campusId: lekki.id,
      name: 'Silver',
    });
    await createClass(app, owner, { campusId: ikeja.id, name: 'Emerald' });
    await api(owner)
      .patch(`/classes/${silver.id}`)
      .send({ archived: true })
      .expect(200);

    const counts = async () =>
      Object.fromEntries(
        (
          (await api(owner).get('/campuses/summary').expect(200)).body as {
            name: string;
            counts: { classes: number };
          }[]
        ).map((card) => [card.name, card.counts.classes])
      );
    expect(await counts()).toEqual({ Ikeja: 1, Lekki: 1 });

    const refused = await api(owner)
      .delete(`/campuses/${lekki.id}`)
      .expect(409);
    expect(refused.body.message).toContain('classes');
    await api(owner)
      .patch(`/classes/${gold.id}`)
      .send({ archived: true })
      .expect(200);
    expect(await counts()).toEqual({ Ikeja: 1, Lekki: 0 });
    await api(owner).delete(`/campuses/${lekki.id}`).expect(409);
  });
});

const seedBothSchools = async ({
  api,
  app,
  createUser,
  addMember,
  schools: { owner, ownerB, orgB, campusB, lekki },
}: Pick<Fixtures, 'api' | 'app' | 'createUser' | 'addMember'> & {
  schools: TwoSchools;
}) => {
  await createSchoolYear(app, owner);
  await createSchoolYear(app, ownerB);
  const teacherB = await addMember(orgB, await createUser({ name: 'Bola B' }), {
    roles: ['teacher'],
    campuses: [campusB],
  });
  const classB = await createClass(app, ownerB, {
    campusId: campusB.id,
    name: 'Blue',
  });
  await assignClassTeacher(app, ownerB, {
    classId: classB.id,
    userId: teacherB.id,
  });
  const classA = await createClass(app, owner, {
    campusId: lekki.id,
    name: 'Gold',
  });
  const levelB = levelIdOf(await levelsOf(api, ownerB), 'JSS1');
  const levelA = levelIdOf(await levelsOf(api, owner), 'JSS1');
  expect(levelB).not.toBe(levelA);
  return { teacherB, classA, classB, levelA, levelB };
};

test.describe('isolation', () => {
  test('1: another school’s levels, classes and class teachers answer 404 on every route with an id', async ({
    api,
    app,
    createUser,
    addMember,
    schools,
  }) => {
    const { owner, ownerB } = schools;
    const { teacherB, classA, classB, levelA, levelB } = await seedBothSchools({
      api,
      app,
      createUser,
      addMember,
      schools,
    });

    await api(owner)
      .patch(`/class-levels/${levelB}`)
      .send({ name: 'Hijack' })
      .expect(404);
    await api(owner).get(`/classes/${classB.id}`).expect(404);
    await api(owner)
      .patch(`/classes/${classB.id}`)
      .send({ archived: true })
      .expect(404);
    await api(owner)
      .get(`/classes/${classB.id}/teacher-candidates`)
      .expect(404);
    await assign(api, owner, { classId: classB.id, userId: owner.id }).expect(
      404
    );
    await api(owner)
      .delete(`/classes/${classB.id}/teachers/${teacherB.id}`)
      .expect(404);

    await api(ownerB)
      .patch(`/class-levels/${levelA}`)
      .send({ name: 'Hijack' })
      .expect(404);
    await api(ownerB).get(`/classes/${classA.id}`).expect(404);
    await api(ownerB)
      .patch(`/classes/${classA.id}`)
      .send({ name: 'Nope' })
      .expect(404);
    await assign(api, ownerB, {
      classId: classA.id,
      userId: teacherB.id,
    }).expect(404);
    const removed = await api(ownerB)
      .delete(`/classes/${classA.id}/teachers/${teacherB.id}`)
      .expect(404);
    expect(removed.body.message).toBe('Class not found');
  });

  test('2: the lists hold no row of another school and a campusId naming its campus answers 404', async ({
    api,
    app,
    pool,
    createUser,
    addMember,
    schools,
  }) => {
    const { owner, ownerB, orgA, orgB, campusB, lekki } = schools;
    const { classA, classB, levelA, levelB } = await seedBothSchools({
      api,
      app,
      createUser,
      addMember,
      schools,
    });

    expect((await classesOf(api, owner)).map((row) => row.id)).toEqual([
      classA.id,
    ]);
    expect((await classesOf(api, ownerB)).map((row) => row.id)).toEqual([
      classB.id,
    ]);
    expect((await levelsOf(api, owner)).map((level) => level.id)).not.toContain(
      levelB
    );
    expect(
      (await levelsOf(api, ownerB)).map((level) => level.id)
    ).not.toContain(levelA);
    const foreign = await api(owner)
      .get(`/classes?campusId=${campusB.id}`)
      .expect(404);
    expect(foreign.body.message).toBe('Campus not found');
    expect(
      (await classesOf(api, owner, `?campusId=${lekki.id}`)).map(
        (row) => row.id
      )
    ).toEqual([classA.id]);

    const schoolsHolding = async (table: string) => {
      const { rows } = await pool.query<{ organization_id: string }>(
        `SELECT DISTINCT organization_id FROM ${table}`
      );
      return rows
        .map((row) => row.organization_id)
        .toSorted((a, b) => a.localeCompare(b));
    };
    const both = [orgA.id, orgB.id].toSorted((a, b) => a.localeCompare(b));
    expect(await schoolsHolding('class_level')).toEqual(both);
    expect(await schoolsHolding('class_arm')).toEqual(both);
    expect(await schoolsHolding('class_arm_teacher')).toEqual([orgB.id]);
  });

  test('7: creating a class with another school’s level or campus answers 404', async ({
    api,
    schools: { owner, ownerB, lekki, campusB },
  }) => {
    const levelB = levelIdOf(await levelsOf(api, ownerB), 'JSS1');
    const levelA = levelIdOf(await levelsOf(api, owner), 'JSS1');
    const foreignLevel = await api(owner)
      .post('/classes')
      .send({ levelId: levelB, campusId: lekki.id, name: 'X' })
      .expect(404);
    const foreignCampus = await api(owner)
      .post('/classes')
      .send({ levelId: levelA, campusId: campusB.id, name: 'X' })
      .expect(404);
    expect([foreignLevel.body.message, foreignCampus.body.message]).toEqual([
      'Level not found',
      'Campus not found',
    ]);
  });

  test('7: the composite foreign keys refuse rows that point across schools', async ({
    api,
    app,
    pool,
    schools: { owner, ownerB, orgA, lekki, campusB },
  }) => {
    const yearB = await createSchoolYear(app, ownerB);
    const classB = await createClass(app, ownerB, { campusId: campusB.id });
    const levelB = levelIdOf(await levelsOf(api, ownerB), 'JSS1');
    const levelA = levelIdOf(await levelsOf(api, owner), 'JSS1');

    await expect(
      pool.query(
        `INSERT INTO class_arm (organization_id, class_level_id, campus_id, name)
         VALUES ($1, $2, $3, 'Cross')`,
        [orgA.id, levelB, lekki.id]
      )
    ).rejects.toMatchObject({ code: '23503' });
    await expect(
      pool.query(
        `INSERT INTO class_arm (organization_id, class_level_id, campus_id, name)
         VALUES ($1, $2, $3, 'Cross')`,
        [orgA.id, levelA, campusB.id]
      )
    ).rejects.toMatchObject({ code: '23503' });
    await expect(
      pool.query(
        `INSERT INTO class_arm_teacher (organization_id, class_arm_id, session_id, user_id, role)
         VALUES ($1, $2, $3, $4, 'lead')`,
        [orgA.id, classB.id, yearB.id, owner.id]
      )
    ).rejects.toMatchObject({ code: '23503' });
  });

  test('6: no session answers 401 on every route', async ({ api }) => {
    const id = randomUUID();
    const responses = await Promise.all([
      api().get('/class-levels'),
      api().post('/class-levels').send({ code: 'CRE', name: 'Creche' }),
      api().patch(`/class-levels/${id}`).send({ name: 'x' }),
      api().get('/classes'),
      api().get(`/classes/${id}`),
      api().post('/classes').send({ levelId: id, campusId: id, name: 'x' }),
      api().patch(`/classes/${id}`).send({ name: 'x' }),
      api().get(`/classes/${id}/teacher-candidates`),
      api().post(`/classes/${id}/teachers`).send({ userId: id, role: 'lead' }),
      api().delete(`/classes/${id}/teachers/${id}`),
    ]);
    expect(responses.map((res) => res.status)).toEqual(
      Array.from({ length: 10 }, () => 401)
    );
  });

  test('12: an acting super admin without a reason is refused on every write', async ({
    api,
    app,
    createUser,
    makeSuperAdmin,
    schools: { owner, orgA, lekki },
  }) => {
    await createSchoolYear(app, owner);
    const klass = await createClass(app, owner, { campusId: lekki.id });
    const level = levelIdOf(await levelsOf(api, owner), 'JSS1');
    const admin = await makeSuperAdmin(await createUser());
    const refused = async (request: Test) => {
      const res = await request.set(acting(orgA.id)).expect(403);
      expect(res.body.code).toBe('ActingReadOnly');
    };
    await refused(
      api(admin).post('/class-levels').send({ code: 'CRE', name: 'Creche' })
    );
    await refused(
      api(admin).patch(`/class-levels/${level}`).send({ name: 'JSS One' })
    );
    await refused(
      api(admin)
        .post('/classes')
        .send({ levelId: level, campusId: lekki.id, name: 'Ruby' })
    );
    await refused(
      api(admin).patch(`/classes/${klass.id}`).send({ archived: true })
    );
    await refused(
      api(admin)
        .post(`/classes/${klass.id}/teachers`)
        .send({ userId: owner.id, role: 'assistant' })
    );
    await refused(
      api(admin).delete(`/classes/${klass.id}/teachers/${owner.id}`)
    );
    await api(admin).get('/classes').set(acting(orgA.id)).expect(200);
    await api(admin)
      .post('/classes')
      .set(acting(orgA.id, 'SUP-1 add a class'))
      .send({ levelId: level, campusId: lekki.id, name: 'Ruby' })
      .expect(201);
  });
});
