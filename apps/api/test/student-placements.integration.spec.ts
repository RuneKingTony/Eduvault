import type { PlacementClass, StudentDetail } from '@eduvault/api-contract';
import { expect } from './support/base-test';
import { createClass } from './support/factories/classes';
import { makeCurrent, termOf } from './support/factories/terms';
import { schoolsTest } from './support/two-schools';

const test = schoolsTest;

const YEAR = '2026/2027';

test.describe('move for next term', () => {
  test('allows a same-level class on another campus and leaves the current placement alone', async ({
    api,
    app,
    schools: { owner, ikeja, studentLekki },
  }) => {
    const second = await termOf(api, owner, { year: YEAR, sequence: 2 });
    const target = await createClass(app, owner, { campusId: ikeja.id });
    const before = (
      await api(owner).get(`/students/${studentLekki.id}`).expect(200)
    ).body as StudentDetail;
    expect(before).toMatchObject({
      canMoveForNextTerm: true,
      nextTerm: { id: second.id, name: 'Second term' },
    });

    const res = await api(owner)
      .post(`/students/${studentLekki.id}/placements`)
      .send({ termId: second.id, classArmId: target.id })
      .expect(201);
    const detail = res.body as StudentDetail;

    expect(detail.currentPlacement).toEqual(before.currentPlacement);
    expect(detail.canMoveForNextTerm).toBe(false);
    expect(detail.history[0]?.placements).toEqual([
      expect.objectContaining({ termName: 'First term' }),
      {
        termName: 'Second term',
        className: `JSS 1 ${target.name}`,
        campusName: 'Ikeja',
      },
    ]);
  });

  test('keeps the student in the Lekki list until Second term is current', async ({
    api,
    app,
    schools: { owner, lekkiOnly, ikeja, studentLekki },
  }) => {
    const second = await termOf(api, owner, { year: YEAR, sequence: 2 });
    const target = await createClass(app, owner, { campusId: ikeja.id });
    await api(owner)
      .post(`/students/${studentLekki.id}/placements`)
      .send({ termId: second.id, classArmId: target.id })
      .expect(201);

    await api(lekkiOnly).get(`/students/${studentLekki.id}`).expect(200);
    await makeCurrent(api, owner, { year: YEAR, sequence: 2 });
    await api(lekkiOnly).get(`/students/${studentLekki.id}`).expect(404);
  });

  test('refuses a second placement for the same term with 409', async ({
    api,
    app,
    schools: { owner, ikeja, studentLekki },
  }) => {
    const second = await termOf(api, owner, { year: YEAR, sequence: 2 });
    const target = await createClass(app, owner, { campusId: ikeja.id });
    const send = () =>
      api(owner)
        .post(`/students/${studentLekki.id}/placements`)
        .send({ termId: second.id, classArmId: target.id });
    await send().expect(201);
    const res = await send().expect(409);

    expect(res.body.message).toBe(
      `${studentLekki.firstName} ${studentLekki.lastName} already has a Second term placement.`
    );
  });

  test('refuses with 409 when Third term is current', async ({
    api,
    schools: { owner, studentLekki },
  }) => {
    await makeCurrent(api, owner, { year: YEAR, sequence: 3 });
    const third = await termOf(api, owner, { year: YEAR, sequence: 3 });
    const detail = (
      await api(owner).get(`/students/${studentLekki.id}`).expect(200)
    ).body as StudentDetail;
    expect(detail).toMatchObject({
      nextTerm: null,
      canMoveForNextTerm: false,
    });
    const res = await api(owner)
      .post(`/students/${studentLekki.id}/placements`)
      .send({
        termId: third.id,
        classArmId: detail.currentPlacement?.armId,
      })
      .expect(409);
    expect(res.body.message).toBe('There is no next term in this school year.');
  });

  test('refuses a class at the wrong level, an archived class and a term that is not next with 400', async ({
    api,
    app,
    schools: { owner, lekki, studentLekki },
  }) => {
    const second = await termOf(api, owner, { year: YEAR, sequence: 2 });
    const third = await termOf(api, owner, { year: YEAR, sequence: 3 });
    const wrongLevel = await createClass(app, owner, {
      campusId: lekki.id,
      levelCode: 'JSS2',
    });
    const same = await createClass(app, owner, { campusId: lekki.id });
    const place = (body: { termId: string; classArmId: string }) =>
      api(owner).post(`/students/${studentLekki.id}/placements`).send(body);

    const level = await place({
      termId: second.id,
      classArmId: wrongLevel.id,
    }).expect(400);
    expect(level.body.message).toBe('Choose a JSS 1 class.');

    await api(owner)
      .patch(`/classes/${same.id}`)
      .send({ archived: true })
      .expect(200);
    const archived = await place({
      termId: second.id,
      classArmId: same.id,
    }).expect(400);
    expect(archived.body.message).toBe(
      `JSS 1 ${same.name} is archived. Choose another class.`
    );

    const open = await createClass(app, owner, { campusId: lekki.id });
    const notNext = await place({
      termId: third.id,
      classArmId: open.id,
    }).expect(400);
    expect(notNext.body.message).toBe('Choose the next term.');
  });

  test('answers 404 for another school’s class and writes nothing', async ({
    api,
    app,
    pool,
    schools: { owner, ownerB, campusB, studentLekki },
  }) => {
    const second = await termOf(api, owner, { year: YEAR, sequence: 2 });
    const foreign = await createClass(app, ownerB, { campusId: campusB.id });
    const res = await api(owner)
      .post(`/students/${studentLekki.id}/placements`)
      .send({ termId: second.id, classArmId: foreign.id })
      .expect(404);

    expect(res.body.message).toBe('Class not found');
    const placements = await pool.query(
      `SELECT count(*)::int AS total FROM enrollment_placement ep
       JOIN student_enrollment e ON e.id = ep.enrollment_id
       WHERE e.student_id = $1`,
      [studentLekki.id]
    );
    expect(placements.rows[0].total).toBe(1);
  });

  test('refuses a student who has left with 409', async ({
    api,
    app,
    schools: { owner, ikeja, studentLekki },
  }) => {
    const second = await termOf(api, owner, { year: YEAR, sequence: 2 });
    const target = await createClass(app, owner, { campusId: ikeja.id });
    await api(owner)
      .post(`/students/${studentLekki.id}/leave`)
      .send({ reason: 'relocated', lastDay: studentLekki.admittedOn })
      .expect(201);
    await api(owner)
      .post(`/students/${studentLekki.id}/placements`)
      .send({ termId: second.id, classArmId: target.id })
      .expect(409);
  });
});

test.describe('classes for the move', () => {
  test('offers a campus-scoped caller same-level open classes on every campus', async ({
    api,
    app,
    withPermissions,
    schools: { orgA, owner, ownerB, campusB, lekki, ikeja, studentLekki },
  }) => {
    const holder = await withPermissions(
      orgA,
      ['student:read', 'enrollment:place'],
      { campuses: [lekki] }
    );
    const ikejaClass = await createClass(app, owner, { campusId: ikeja.id });
    const archived = await createClass(app, owner, { campusId: ikeja.id });
    await api(owner)
      .patch(`/classes/${archived.id}`)
      .send({ archived: true })
      .expect(200);
    await createClass(app, owner, { campusId: lekki.id, levelCode: 'JSS2' });
    await createClass(app, ownerB, { campusId: campusB.id });

    const res = await api(holder)
      .get(`/students/${studentLekki.id}/next-term-classes`)
      .expect(200);
    const classes = res.body as PlacementClass[];

    expect(classes).toContainEqual({
      id: ikejaClass.id,
      name: `JSS 1 ${ikejaClass.name}`,
      campus: { id: ikeja.id, name: 'Ikeja' },
    });
    expect(classes.map((row) => row.id)).not.toContain(archived.id);
    expect(classes.every((row) => row.name.startsWith('JSS 1 '))).toBe(true);
    expect(new Set(classes.map((row) => row.campus.name))).toEqual(
      new Set(['Lekki', 'Ikeja'])
    );
  });

  test('lets that caller move the student to the Ikeja class it offered', async ({
    api,
    app,
    withPermissions,
    schools: { orgA, owner, lekki, ikeja, studentLekki },
  }) => {
    const holder = await withPermissions(
      orgA,
      ['student:read', 'enrollment:place'],
      { campuses: [lekki] }
    );
    const second = await termOf(api, owner, { year: YEAR, sequence: 2 });
    const ikejaClass = await createClass(app, owner, { campusId: ikeja.id });
    const offered = (
      await api(holder)
        .get(`/students/${studentLekki.id}/next-term-classes`)
        .expect(200)
    ).body as PlacementClass[];
    expect(offered.map((row) => row.id)).toContain(ikejaClass.id);

    await api(holder)
      .post(`/students/${studentLekki.id}/placements`)
      .send({ termId: second.id, classArmId: ikejaClass.id })
      .expect(201);
  });

  test('offers nothing once the student has left', async ({
    api,
    schools: { owner, studentLekki },
  }) => {
    await api(owner)
      .post(`/students/${studentLekki.id}/leave`)
      .send({ reason: 'relocated', lastDay: studentLekki.admittedOn })
      .expect(201);
    const res = await api(owner)
      .get(`/students/${studentLekki.id}/next-term-classes`)
      .expect(200);
    expect(res.body).toEqual([]);
  });
});

const routes = (student: { id: string; admittedOn: string }) =>
  [
    ['post', `/students/${student.id}/back-in-school`, undefined],
    [
      'post',
      `/students/${student.id}/leave`,
      { reason: 'relocated', lastDay: student.admittedOn },
    ],
    [
      'post',
      `/students/${student.id}/placements`,
      { termId: student.id, classArmId: student.id },
    ],
    ['get', `/students/${student.id}/next-term-classes`, undefined],
  ] as const;

test.describe('isolation', () => {
  test('answers 404 to another school on the placement routes', async ({
    api,
    schools: { ownerB, studentLekki },
  }) => {
    for (const [method, path, body] of routes(studentLekki)) {
      const request = api(ownerB)[method](path);
      await (body === undefined ? request : request.send(body)).expect(404);
    }
  });

  test('answers 401 without a session on the placement routes', async ({
    api,
    schools: { studentLekki },
  }) => {
    for (const [method, path, body] of routes(studentLekki)) {
      const request = api()[method](path);
      await (body === undefined ? request : request.send(body)).expect(401);
    }
  });

  test('answers 403 to an in-scope caller without enrollment:place and 404 for another campus', async ({
    api,
    withPermissions,
    schools: { orgA, lekki, studentLekki, studentIkeja },
  }) => {
    const reader = await withPermissions(orgA, ['student:read'], {
      campuses: [lekki],
    });
    await api(reader)
      .get(`/students/${studentLekki.id}/next-term-classes`)
      .expect(403);
    const holder = await withPermissions(
      orgA,
      ['student:read', 'enrollment:place'],
      { campuses: [lekki] }
    );
    await api(holder)
      .get(`/students/${studentIkeja.id}/next-term-classes`)
      .expect(404);
  });
});
