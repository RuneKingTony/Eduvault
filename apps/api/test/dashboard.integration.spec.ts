import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import type {
  ActivityPage,
  BalanceList,
  DashboardFinance,
  DashboardRoll,
  DashboardTask,
  MyClass,
} from '@eduvault/api-contract';
import { expect, type Fixtures, type TestUser } from './support/base-test';
import { YEAR_2027, createSchoolYear } from './support/factories/calendar';
import { assignClassTeacher, createClass } from './support/factories/classes';
import { createAnnouncement } from './support/factories/announcements';
import { bankAccount, owes, recordCash } from './support/factories/payments';
import { createStudent } from './support/factories/students';
import { createItem, openStock } from './support/factories/store';
import { makeCurrent } from './support/factories/terms';
import { schoolsTest } from './support/two-schools';

const test = schoolsTest;

type Api = Fixtures['api'];
interface Actor {
  cookie: string;
}

const DAY_MS = 86_400_000;

const addDays = (date: string, days: number): string =>
  new Date(Date.parse(date) + days * DAY_MS).toISOString().slice(0, 10);

const tasksOf = async (api: Api, actor: Actor) =>
  (await api(actor).get('/dashboard/tasks').expect(200))
    .body as DashboardTask[];

const taskOf = <K extends DashboardTask['kind']>(
  tasks: DashboardTask[],
  kind: K
) =>
  tasks.find((task) => task.kind === kind) as
    Extract<DashboardTask, { kind: K }> | undefined;

const rollOf = async (api: Api, actor: Actor) =>
  (await api(actor).get('/dashboard/roll').expect(200)).body as DashboardRoll;

const classesOf = async (api: Api, actor: Actor) =>
  (await api(actor).get('/dashboard/my-classes').expect(200)).body as MyClass[];

const activityOf = async (api: Api, actor: Actor, page = 1) =>
  (await api(actor).get(`/activity?page=${page}`).expect(200))
    .body as ActivityPage;

const byText = (a: string, b: string) => a.localeCompare(b);

const memberNames = (tasks: DashboardTask[]) =>
  tasks.flatMap((task) => (task.kind === 'noRole' ? [task.name] : []));

const nameOf = (student: { firstName: string; lastName: string }) =>
  `${student.firstName} ${student.lastName}`;

const armOf = async (pool: Pool, studentId: string): Promise<string> =>
  (
    await pool.query(
      `SELECT ep.class_arm_id
       FROM enrollment_placement ep
       JOIN student_enrollment e ON e.id = ep.enrollment_id
       WHERE e.student_id = $1`,
      [studentId]
    )
  ).rows[0].class_arm_id;

const markAway = (
  api: Api,
  actor: Actor,
  student: { id: string; admittedOn: string }
) =>
  api(actor)
    .post(`/students/${student.id}/not-seen`)
    .send({ date: student.admittedOn })
    .expect(201);

interface EventInput {
  orgId: string;
  actorId: string;
  campusId?: string | null;
  pillar?: 'foundation' | 'finance' | 'access' | 'platform';
  subjectType: string;
  subjectId?: string;
  text: string;
  at?: string;
}

const addEvent = (pool: Pool, event: EventInput) =>
  pool.query(
    `INSERT INTO activity_event
       (organization_id, campus_id, pillar, kind, actor_user_id, subject_type, subject_id, text, occurred_at)
     VALUES ($1, $2, $3, 'test.event', $4, $5, $6, $7, COALESCE($8::timestamptz, now()))`,
    [
      event.orgId,
      event.campusId ?? null,
      event.pillar ?? 'foundation',
      event.actorId,
      event.subjectType,
      event.subjectId ?? randomUUID(),
      event.text,
      event.at ?? null,
    ]
  );

const STAFF_PERMISSIONS = [
  'student:read',
  'student:markAway',
  'student:archive',
  'enrollment:place',
  'class:read',
  'class:readAll',
  'class:assignTeacher',
  'member:read',
  'member:update',
  'session:read',
] as const;

const financeOf = async (api: Api, actor: Actor) =>
  (await api(actor).get('/dashboard/finance').expect(200))
    .body as DashboardFinance | null;

const LEKKI_DEBT = 3_000_000;
const IKEJA_DEBT = 9_000_000;
const LEKKI_PAID = 1_000_000;
const IKEJA_PAID = 500_000;

interface Scene {
  api: Api;
  app: Fixtures['app'];
  clock: Fixtures['clock'];
  owner: TestUser;
  studentLekki: { id: string };
  studentIkeja: { id: string };
}

const seedDebtsAndPayments = async ({
  api,
  app,
  clock,
  owner,
  studentLekki,
  studentIkeja,
}: Scene) => {
  await owes(app, owner, {
    studentId: studentLekki.id,
    amountMinor: LEKKI_DEBT,
  });
  await owes(app, owner, {
    studentId: studentIkeja.id,
    amountMinor: IKEJA_DEBT,
  });
  const account = await bankAccount(app, owner);
  for (const [student, amountMinor] of [
    [studentLekki, LEKKI_PAID],
    [studentIkeja, IKEJA_PAID],
  ] as const) {
    await recordCash(api, owner, {
      accountId: account.id,
      paidOn: clock.today(),
      allocations: [{ studentId: student.id, amountMinor }],
    });
  }
};

test.describe('isolation', () => {
  test('case 2: tasks, roll, classes and activity hold nothing of another school', async ({
    api,
    app,
    pool,
    schools: {
      orgA,
      orgB,
      owner,
      ownerB,
      studentLekki,
      studentIkeja,
      studentB,
    },
  }) => {
    for (const student of [studentLekki, studentIkeja, studentB]) {
      await markAway(api, student === studentB ? ownerB : owner, student);
    }
    const lekkiArm = await armOf(pool, studentLekki.id);
    const armB = await armOf(pool, studentB.id);
    await assignClassTeacher(app, owner, {
      classId: lekkiArm,
      userId: owner.id,
      role: 'lead',
    });
    await assignClassTeacher(app, ownerB, {
      classId: armB,
      userId: ownerB.id,
      role: 'lead',
    });
    await addEvent(pool, {
      orgId: orgA.id,
      actorId: owner.id,
      pillar: 'platform',
      subjectType: 'school',
      text: 'School A note.',
    });
    await addEvent(pool, {
      orgId: orgB.id,
      actorId: ownerB.id,
      pillar: 'platform',
      subjectType: 'school',
      text: 'School B note.',
    });

    const mine = taskOf(await tasksOf(api, owner), 'notSeen');
    const theirs = taskOf(await tasksOf(api, ownerB), 'notSeen');
    expect(mine?.students.map((row) => row.id).toSorted(byText)).toEqual(
      [studentLekki.id, studentIkeja.id].toSorted(byText)
    );
    expect(theirs?.students.map((row) => row.id)).toEqual([studentB.id]);

    expect(await rollOf(api, owner)).toMatchObject({ active: 2 });
    expect(await rollOf(api, ownerB)).toMatchObject({ active: 1 });

    expect((await classesOf(api, owner)).map((row) => row.armId)).toEqual([
      lekkiArm,
    ]);
    expect((await classesOf(api, ownerB)).map((row) => row.armId)).toEqual([
      armB,
    ]);

    const textsOf = async (actor: Actor) =>
      (await activityOf(api, actor)).items.map((item) => item.text).join(' ');
    const seenByA = await textsOf(owner);
    const seenByB = await textsOf(ownerB);
    expect(seenByA).toContain('School A note.');
    expect(seenByA).not.toContain('School B note.');
    expect(seenByA).not.toContain(studentB.firstName);
    expect(seenByB).toContain('School B note.');
    expect(seenByB).not.toContain('School A note.');
    expect(seenByB).not.toContain(studentLekki.firstName);
    expect((await activityOf(api, ownerB)).total).toBe(3);
  });

  test('case 2: due-to-be-left holds nothing of another school or campus', async ({
    api,
    clock,
    withPermissions,
    schools: {
      orgA,
      owner,
      ownerB,
      lekki,
      studentLekki,
      studentIkeja,
      studentB,
    },
  }) => {
    await markAway(api, owner, studentLekki);
    await markAway(api, owner, studentIkeja);
    await markAway(api, ownerB, studentB);
    const lekkiStaff = await withPermissions(
      orgA,
      ['student:read', 'student:archive'],
      { campuses: [lekki] }
    );
    clock.set(addDays(studentLekki.admittedOn, 133));

    const idsOf = async (actor: Actor) =>
      taskOf(await tasksOf(api, actor), 'dueLeft')?.students.map(
        (row) => row.id
      );
    expect((await idsOf(owner))?.toSorted(byText)).toEqual(
      [studentLekki.id, studentIkeja.id].toSorted(byText)
    );
    expect(await idsOf(ownerB)).toEqual([studentB.id]);
    expect(await idsOf(lekkiStaff)).toEqual([studentLekki.id]);
  });

  test('case 2: not-in-class holds nothing of another school or campus', async ({
    api,
    app,
    withPermissions,
    schools: {
      orgA,
      owner,
      ownerB,
      lekki,
      studentLekki,
      studentIkeja,
      studentB,
    },
  }) => {
    for (const actor of [owner, ownerB]) {
      await createSchoolYear(app, actor, YEAR_2027);
      await makeCurrent(api, actor, { year: '2026/2027', sequence: 3 });
      await makeCurrent(api, actor, { year: '2027/2028', sequence: 1 });
    }
    const lekkiStaff = await withPermissions(
      orgA,
      ['student:read', 'enrollment:place'],
      { campuses: [lekki] }
    );

    const idsOf = async (actor: Actor) =>
      taskOf(await tasksOf(api, actor), 'notInClass')?.students.map(
        (row) => row.id
      );
    expect((await idsOf(owner))?.toSorted(byText)).toEqual(
      [studentLekki.id, studentIkeja.id].toSorted(byText)
    );
    expect(await idsOf(ownerB)).toEqual([studentB.id]);
    expect(await idsOf(lekkiStaff)).toEqual([studentLekki.id]);
  });

  test('case 2: roll figures and the term start come from the caller’s school only', async ({
    api,
    pool,
    schools: { orgB, owner, ownerB, studentLekki, studentB },
  }) => {
    await pool.query(
      `UPDATE term
       SET starts_on = (now() AT TIME ZONE 'Africa/Lagos')::date + 1,
           ends_on = (now() AT TIME ZONE 'Africa/Lagos')::date + 60
       WHERE organization_id = $1 AND is_current`,
      [orgB.id]
    );
    for (const [actor, student] of [
      [owner, studentLekki],
      [ownerB, studentB],
    ] as const) {
      await api(actor)
        .post(`/students/${student.id}/leave`)
        .send({ reason: 'relocated', lastDay: student.admittedOn })
        .expect(201);
    }

    expect(await rollOf(api, owner)).toMatchObject({
      active: 1,
      left: 1,
      leftThisTerm: 1,
      graduated: 0,
    });
    expect(await rollOf(api, ownerB)).toMatchObject({
      active: 0,
      left: 1,
      leftThisTerm: 0,
    });
  });

  test('case 4: a class-scoped member gets no without-class-teacher task for other arms', async ({
    api,
    app,
    pool,
    withPermissions,
    schools: { orgA, owner, lekki, studentLekki },
  }) => {
    await createStudent(app, owner, {
      campusId: lekki.id,
      classArmId: (
        await createClass(app, owner, {
          campusId: lekki.id,
          name: 'Other',
        })
      ).id,
    });
    const teacher = await withPermissions(
      orgA,
      ['class:read', 'class:assignTeacher'],
      { campuses: [lekki] }
    );
    await assignClassTeacher(app, owner, {
      classId: await armOf(pool, studentLekki.id),
      userId: teacher.id,
      role: 'lead',
    });

    expect(
      taskOf(await tasksOf(api, owner), 'noClassTeacher')?.classes
    ).toHaveLength(2);
    expect(
      taskOf(await tasksOf(api, teacher), 'noClassTeacher')
    ).toBeUndefined();
  });

  test('case 2: my classes lists only the active school’s arm for a teacher in two schools', async ({
    api,
    pool,
    schools: { orgA, orgB, owner, studentLekki, studentB },
  }) => {
    const lekkiArm = await armOf(pool, studentLekki.id);
    const armB = await armOf(pool, studentB.id);
    for (const [org, arm] of [
      [orgA, lekkiArm],
      [orgB, armB],
    ] as const) {
      await pool.query(
        `INSERT INTO class_arm_teacher (organization_id, class_arm_id, session_id, user_id, role)
         SELECT $1, $2, session_id, $3, 'assistant' FROM term
         WHERE organization_id = $1 AND is_current`,
        [org.id, arm, owner.id]
      );
    }

    expect((await classesOf(api, owner)).map((row) => row.armId)).toEqual([
      lekkiArm,
    ]);
  });

  test('case 4: a Lekki-only member sees no Ikeja student, class, member or event', async ({
    api,
    pool,
    withPermissions,
    addMember,
    createUser,
    schools: {
      orgA,
      orgB,
      owner,
      ownerB,
      lekki,
      ikeja,
      campusB,
      studentLekki,
      studentIkeja,
    },
  }) => {
    const lekkiStaff = await withPermissions(orgA, STAFF_PERMISSIONS, {
      campuses: [lekki],
    });
    await addMember(orgB, await createUser({ name: 'School B Newcomer' }), {
      roles: ['member'],
      campuses: [campusB],
    });
    await addMember(orgA, await createUser({ name: 'Ikeja Newcomer' }), {
      roles: ['member'],
      campuses: [ikeja],
    });
    await addMember(orgA, await createUser({ name: 'Lekki Newcomer' }), {
      roles: ['member'],
      campuses: [lekki],
    });
    await markAway(api, owner, studentLekki);
    await markAway(api, owner, studentIkeja);

    const all = await tasksOf(api, owner);
    const scoped = await tasksOf(api, lekkiStaff);

    expect(taskOf(all, 'notSeen')?.count).toBe(2);
    expect(taskOf(scoped, 'notSeen')?.students.map((row) => row.id)).toEqual([
      studentLekki.id,
    ]);
    expect(taskOf(all, 'noClassTeacher')?.count).toBe(2);
    const lekkiArm = await armOf(pool, studentLekki.id);
    expect(
      taskOf(scoped, 'noClassTeacher')?.classes.map((row) => row.id)
    ).toEqual([lekkiArm]);
    expect(memberNames(all).toSorted(byText)).toEqual([
      'Ikeja Newcomer',
      'Lekki Newcomer',
      'Test User',
    ]);
    expect(memberNames(scoped)).toEqual(['Lekki Newcomer']);
    expect(memberNames(await tasksOf(api, ownerB))).toEqual([
      'School B Newcomer',
    ]);

    expect(await rollOf(api, lekkiStaff)).toMatchObject({
      active: 1,
      campusNames: ['Lekki'],
    });
    expect((await rollOf(api, owner)).campusNames).toBeNull();

    const events = await activityOf(api, lekkiStaff);
    expect(events.total).toBe(2);
    const texts = events.items.map((item) => item.text).join(' ');
    expect(texts).toContain(studentLekki.firstName);
    expect(texts).not.toContain(studentIkeja.firstName);
  });

  test('case 4: my classes leaves out an Ikeja arm a Lekki-scoped teacher is also assigned', async ({
    api,
    pool,
    withPermissions,
    schools: { orgA, lekki, studentLekki, studentIkeja },
  }) => {
    const teacher = await withPermissions(
      orgA,
      ['class:read', 'class:readAll'],
      { campuses: [lekki] }
    );
    const lekkiArm = await armOf(pool, studentLekki.id);
    const ikejaArm = await armOf(pool, studentIkeja.id);
    for (const arm of [lekkiArm, ikejaArm]) {
      await pool.query(
        `INSERT INTO class_arm_teacher (organization_id, class_arm_id, session_id, user_id, role)
         SELECT $1, $2, session_id, $3, 'assistant' FROM term
         WHERE organization_id = $1 AND is_current`,
        [orgA.id, arm, teacher.id]
      );
    }

    const classes = await classesOf(api, teacher);
    expect(classes.map((row) => row.armId)).toEqual([lekkiArm]);
    expect(classes[0]).toMatchObject({ campusName: 'Lekki', studentCount: 1 });
  });

  test('case 5: roll and my classes answer 403 without the permission, tasks answer []', async ({
    api,
    schools: { noPermission },
  }) => {
    await api(noPermission).get('/dashboard/roll').expect(403);
    await api(noPermission).get('/dashboard/my-classes').expect(403);
    await api(noPermission).get('/dashboard/store').expect(403);
    expect(await tasksOf(api, noPermission)).toEqual([]);
  });

  test('case 6: every dashboard route answers 401 without a session', async ({
    api,
  }) => {
    for (const path of [
      '/dashboard/tasks',
      '/dashboard/roll',
      '/dashboard/my-classes',
      '/dashboard/store',
      '/activity',
    ]) {
      await api().get(path).expect(401);
    }
  });

  test('case 8: a class-scoped teacher sees only their classes’ students', async ({
    api,
    app,
    pool,
    addMember,
    createUser,
    schools: { orgA, owner, lekki, studentLekki },
  }) => {
    const other = await createClass(app, owner, {
      campusId: lekki.id,
      name: 'Other',
    });
    const outside = await createStudent(app, owner, {
      campusId: lekki.id,
      classArmId: other.id,
    });
    const teacher = await addMember(orgA, await createUser(), {
      roles: ['teacher'],
      campuses: [lekki],
    });
    const arm = await armOf(pool, studentLekki.id);
    await assignClassTeacher(app, owner, {
      classId: arm,
      userId: teacher.id,
      role: 'lead',
    });
    await markAway(api, owner, studentLekki);
    await markAway(api, owner, outside);

    const away = taskOf(await tasksOf(api, teacher), 'notSeen');
    expect(away?.students.map((row) => row.id)).toEqual([studentLekki.id]);
    expect(await rollOf(api, teacher)).toMatchObject({ active: 1 });
    const classes = await classesOf(api, teacher);
    expect(classes.map((row) => row.armId)).toEqual([arm]);
    expect(classes[0]).toMatchObject({
      isClassTeacher: true,
      studentCount: 1,
      campusName: 'Lekki',
    });
    expect(classes[0]?.sampleStudents.map((row) => row.id)).toEqual([
      studentLekki.id,
    ]);
    expect(
      (await activityOf(api, teacher)).items.map((i) => i.text).join(' ')
    ).not.toContain(outside.firstName);
  });

  test('case 2: the finance tiles and the roll owed column hold nothing of another school', async ({
    api,
    app,
    clock,
    schools,
  }) => {
    await seedDebtsAndPayments({ api, app, clock, ...schools });

    const other = await financeOf(api, schools.ownerB);
    expect(other?.owedMinor ?? 0).toBe(0);
    expect(other?.owingStudents ?? 0).toBe(0);
    expect(other?.receivedMinor ?? 0).toBe(0);
    expect(await rollOf(api, schools.ownerB)).toMatchObject({
      owedMinor: { active: 0, left: 0 },
      formerOwedMinor: 0,
    });
  });

  test('case 4: a campus-scoped caller counts only their campus in the tiles and the roll', async ({
    api,
    app,
    clock,
    schools,
  }) => {
    await seedDebtsAndPayments({ api, app, clock, ...schools });
    const { owner, studentIkeja, lekkiOnly } = schools;
    await api(owner)
      .post(`/students/${studentIkeja.id}/leave`)
      .send({ reason: 'relocated', lastDay: studentIkeja.admittedOn })
      .expect(201);

    expect(await financeOf(api, lekkiOnly)).toEqual({
      currency: 'NGN',
      receivedMinor: LEKKI_PAID,
      paymentCount: 1,
      owedMinor: LEKKI_DEBT - LEKKI_PAID,
      owingStudents: 1,
    });
    const campusRoll = await rollOf(api, lekkiOnly);
    expect(campusRoll.owedMinor).toMatchObject({
      active: LEKKI_DEBT - LEKKI_PAID,
      left: 0,
    });
    expect(campusRoll.formerOwedMinor).toBe(0);
  });

  test('case 5: /dashboard/finance answers 403 without invoice:read or payment:read', async ({
    api,
    withPermissions,
    schools: { orgA, lekki, noPermission },
  }) => {
    const neither = await withPermissions(orgA, ['student:read'], {
      campuses: [lekki],
    });
    for (const user of [neither, noPermission]) {
      await api(user).get('/dashboard/finance').expect(403);
    }
  });

  test('case 6: /dashboard/finance answers 401 without a session', async ({
    api,
  }) => {
    await api().get('/dashboard/finance').expect(401);
  });
});

test.describe('tasks', () => {
  test('T4 is due on not seen since + 133 days, not the day before', async ({
    api,
    clock,
    schools: { owner, studentLekki },
  }) => {
    await markAway(api, owner, studentLekki);

    clock.set(addDays(studentLekki.admittedOn, 132));
    expect(taskOf(await tasksOf(api, owner), 'dueLeft')).toBeUndefined();

    clock.set(addDays(studentLekki.admittedOn, 133));
    expect(taskOf(await tasksOf(api, owner), 'dueLeft')).toEqual({
      kind: 'dueLeft',
      count: 1,
      students: [{ id: studentLekki.id, name: nameOf(studentLekki) }],
    });
    expect((await rollOf(api, owner)).dueLeft).toBe(1);
  });

  test('T5 counts active students marked not seen and drops them once inactive', async ({
    api,
    clock,
    schools: { owner, studentLekki },
  }) => {
    await markAway(api, owner, studentLekki);

    clock.set(addDays(studentLekki.admittedOn, 34));
    expect(taskOf(await tasksOf(api, owner), 'notSeen')).toEqual({
      kind: 'notSeen',
      count: 1,
      students: [
        {
          id: studentLekki.id,
          name: nameOf(studentLekki),
          notSeenSince: studentLekki.admittedOn,
        },
      ],
    });

    clock.set(addDays(studentLekki.admittedOn, 35));
    expect(taskOf(await tasksOf(api, owner), 'notSeen')).toBeUndefined();
    expect((await rollOf(api, owner)).inactive).toBe(1);
  });

  test('T7 lists an arm whose only class teacher is from last school year', async ({
    api,
    app,
    pool,
    schools: { owner, orgA, lekki, studentLekki, studentIkeja },
  }) => {
    const lekkiArm = await armOf(pool, studentLekki.id);
    const ikejaArm = await armOf(pool, studentIkeja.id);
    await createClass(app, owner, { campusId: lekki.id, name: 'Empty' });
    await assignClassTeacher(app, owner, {
      classId: lekkiArm,
      userId: owner.id,
      role: 'assistant',
    });
    await assignClassTeacher(app, owner, {
      classId: ikejaArm,
      userId: owner.id,
      role: 'lead',
    });
    const past = await createSchoolYear(app, owner, {
      name: '2025/2026',
      startsOn: '2025-09-08',
      endsOn: '2026-07-24',
    });
    await pool.query(
      `UPDATE class_arm_teacher SET session_id = $1 WHERE class_arm_id = $2`,
      [past.id, ikejaArm]
    );

    const unled = taskOf(await tasksOf(api, owner), 'noClassTeacher');
    expect(unled?.classes.map((row) => row.id)).toEqual([ikejaArm]);

    await pool.query(
      `UPDATE class_arm SET retired_at = now() WHERE id = $1 AND organization_id = $2`,
      [ikejaArm, orgA.id]
    );
    expect(taskOf(await tasksOf(api, owner), 'noClassTeacher')).toBeUndefined();
  });

  test('T9 shows a Lekki role-less member to a Lekki holder of member:update only', async ({
    api,
    addMember,
    createUser,
    withPermissions,
    schools: { orgA, lekki, ikeja },
  }) => {
    await addMember(orgA, await createUser({ name: 'Lekki Newcomer' }), {
      roles: ['member'],
      campuses: [lekki],
    });
    const lekkiAdmin = await withPermissions(orgA, ['member:update'], {
      campuses: [lekki],
    });
    const ikejaAdmin = await withPermissions(orgA, ['member:update'], {
      campuses: [ikeja],
    });

    expect(await tasksOf(api, lekkiAdmin)).toEqual([
      expect.objectContaining({ kind: 'noRole', name: 'Lekki Newcomer' }),
    ]);
    expect(await tasksOf(api, ikejaAdmin)).toEqual([]);
  });

  test('T10 counts the drafts of everyone and the caller’s campuses for announcement:update only', async ({
    api,
    app,
    withPermissions,
    schools: { orgA, owner, lekki, ikeja },
  }) => {
    await createAnnouncement(app, owner, {
      campusId: lekki.id,
      status: 'draft',
      title: 'Lekki draft',
    });
    await createAnnouncement(app, owner, {
      campusId: ikeja.id,
      status: 'draft',
      title: 'Ikeja draft',
    });
    await createAnnouncement(app, owner, {
      campusId: null,
      status: 'draft',
      title: 'School draft',
    });
    await createAnnouncement(app, owner, { campusId: lekki.id });
    const lekkiWriter = await withPermissions(
      orgA,
      ['announcement:update', 'announcement:read'],
      { campuses: [lekki] }
    );
    const reader = await withPermissions(orgA, ['announcement:read'], {
      campuses: [lekki],
    });

    const mine = taskOf(await tasksOf(api, lekkiWriter), 'announcementDrafts');
    expect(mine?.count).toBe(2);
    expect(mine?.titles.toSorted(byText)).toEqual([
      'Lekki draft',
      'School draft',
    ]);
    const all = taskOf(await tasksOf(api, owner), 'announcementDrafts');
    expect(all?.count).toBe(3);
    expect(
      taskOf(await tasksOf(api, reader), 'announcementDrafts')
    ).toBeUndefined();
  });

  test('T10 holds no draft of another school', async ({
    api,
    app,
    schools: { owner, ownerB, campusB },
  }) => {
    await createAnnouncement(app, ownerB, {
      campusId: campusB.id,
      status: 'draft',
    });
    expect(
      taskOf(await tasksOf(api, owner), 'announcementDrafts')
    ).toBeUndefined();
    expect(
      taskOf(await tasksOf(api, ownerB), 'announcementDrafts')?.count
    ).toBe(1);
  });

  test('T6 and T7 are skipped without a current term while T5 still shows', async ({
    api,
    pool,
    schools: { orgA, owner, studentLekki },
  }) => {
    await markAway(api, owner, studentLekki);
    const before = await tasksOf(api, owner);
    expect(taskOf(before, 'noClassTeacher')?.count).toBe(2);

    await pool.query(
      `UPDATE term SET is_current = FALSE WHERE organization_id = $1`,
      [orgA.id]
    );

    const after = await tasksOf(api, owner);
    expect(taskOf(after, 'noClassTeacher')).toBeUndefined();
    expect(taskOf(after, 'notInClass')).toBeUndefined();
    expect(taskOf(after, 'notSeen')?.count).toBe(1);
  });

  test('T6 offers Start once the first term of a new year is current', async ({
    api,
    app,
    schools: { owner, studentLekki },
  }) => {
    expect(taskOf(await tasksOf(api, owner), 'notInClass')).toBeUndefined();

    await createSchoolYear(app, owner, YEAR_2027);
    await makeCurrent(api, owner, { year: '2026/2027', sequence: 3 });
    await makeCurrent(api, owner, { year: '2027/2028', sequence: 1 });

    const notInClass = taskOf(await tasksOf(api, owner), 'notInClass');
    expect(notInClass).toMatchObject({
      count: 2,
      startYear: { name: '2027/2028' },
    });
    expect(notInClass?.students.map((row) => row.id)).toContain(
      studentLekki.id
    );
  });
});

test.describe('store tasks', () => {
  test('T8 shows a bursar the items at or below their level on their campus', async ({
    api,
    schools: { owner, lekkiOnly, lekki },
  }) => {
    const tie = await createItem(api, owner, {
      name: 'School tie',
      variant: null,
      lowStockLevel: 5,
    });
    const shirt = await createItem(api, owner);
    expect(taskOf(await tasksOf(api, lekkiOnly), 'lowStock')).toMatchObject({
      count: 2,
    });

    await openStock(api, owner, {
      campusId: lekki.id,
      lines: [
        { itemId: tie.id, quantity: 5, unitCostMinor: 120_000 },
        { itemId: shirt.id, quantity: 6, unitCostMinor: 350_000 },
      ],
    });

    const low = taskOf(await tasksOf(api, lekkiOnly), 'lowStock');
    expect(low).toEqual({
      kind: 'lowStock',
      count: 1,
      names: ['School tie'],
    });
  });

  test('T8 is gone once every item is above its level', async ({
    api,
    schools: { owner, lekkiOnly, lekki },
  }) => {
    const shirt = await createItem(api, owner);
    await openStock(api, owner, {
      campusId: lekki.id,
      lines: [{ itemId: shirt.id, quantity: 6, unitCostMinor: 350_000 }],
    });

    expect(taskOf(await tasksOf(api, lekkiOnly), 'lowStock')).toBeUndefined();
  });

  test('T8 names the first three of several low items', async ({
    api,
    schools: { owner, lekkiOnly },
  }) => {
    for (const variant of ['Size 10', 'Size 12', 'Size 14', 'Size 16']) {
      await createItem(api, owner, { variant });
    }

    const low = taskOf(await tasksOf(api, lekkiOnly), 'lowStock');
    expect(low?.count).toBe(4);
    expect(low?.names).toHaveLength(3);
  });

  test('T8 is not shown to someone without store:receive, and /dashboard/store needs store:read', async ({
    api,
    withPermissions,
    schools: { owner, orgA, lekki },
  }) => {
    await createItem(api, owner);
    const reader = await withPermissions(orgA, ['store:read'], {
      campuses: [lekki],
    });
    const nothing = await withPermissions(orgA, ['student:read'], {
      campuses: [lekki],
    });

    expect(taskOf(await tasksOf(api, reader), 'lowStock')).toBeUndefined();
    await api(reader).get('/dashboard/store').expect(200);
    await api(nothing).get('/dashboard/store').expect(403);
  });
});

test.describe('recent activity', () => {
  test('hides an Ikeja student’s events from a Lekki-only member', async ({
    api,
    schools: { lekkiOnly, owner, studentLekki },
  }) => {
    expect((await activityOf(api, owner)).total).toBe(2);
    const seen = await activityOf(api, lekkiOnly);
    expect(seen.total).toBe(1);
    expect(seen.items[0]?.text).toContain(studentLekki.firstName);
  });

  test('hides access rows without member:read and school year rows without session:read', async ({
    api,
    pool,
    withPermissions,
    schools: { orgA, owner, lekki },
  }) => {
    await addEvent(pool, {
      orgId: orgA.id,
      actorId: owner.id,
      campusId: lekki.id,
      pillar: 'access',
      subjectType: 'guardian',
      text: 'Login reset for a guardian.',
    });
    await addEvent(pool, {
      orgId: orgA.id,
      actorId: owner.id,
      subjectType: 'school_year',
      text: 'Started 2027/2028.',
    });
    const reader = await withPermissions(orgA, ['student:read'], {
      campuses: [lekki],
    });
    const people = await withPermissions(orgA, ['member:read'], {
      campuses: [lekki],
    });
    const calendar = await withPermissions(orgA, ['session:read'], {
      campuses: [lekki],
    });
    const texts = async (actor: Actor) =>
      (await activityOf(api, actor)).items.map((item) => item.text);

    expect(await texts(reader)).not.toContain('Login reset for a guardian.');
    expect(await texts(reader)).not.toContain('Started 2027/2028.');
    expect(await texts(people)).toEqual(['Login reset for a guardian.']);
    expect(await texts(calendar)).toEqual(['Started 2027/2028.']);
    expect(await texts(owner)).toEqual(
      expect.arrayContaining([
        'Login reset for a guardian.',
        'Started 2027/2028.',
      ])
    );
  });

  test('shows announcement events only with announcement:read and keeps the campus filter', async ({
    api,
    app,
    withPermissions,
    schools: { orgA, owner, lekki, ikeja },
  }) => {
    await createAnnouncement(app, owner, {
      campusId: lekki.id,
      title: 'Lekki sports day',
    });
    await createAnnouncement(app, owner, {
      campusId: ikeja.id,
      title: 'Ikeja fair',
    });
    await createAnnouncement(app, owner, {
      campusId: null,
      title: 'For everyone',
    });
    const reader = await withPermissions(orgA, ['announcement:read'], {
      campuses: [lekki],
    });
    const writerOnly = await withPermissions(orgA, ['announcement:create'], {
      campuses: [lekki],
    });
    const texts = async (actor: Actor) =>
      (await activityOf(api, actor)).items.map((item) => item.text);

    expect((await texts(reader)).toSorted(byText)).toEqual([
      'Announcement “For everyone” published by Test User.',
      'Announcement “Lekki sports day” published by Test User.',
    ]);
    expect(await texts(writerOnly)).toEqual([]);
    expect(await texts(owner)).toEqual(
      expect.arrayContaining([
        'Announcement “Lekki sports day” published by Test User.',
        'Announcement “Ikeja fair” published by Test User.',
        'Announcement “For everyone” published by Test User.',
      ])
    );
  });

  test('hides access and school year rows of another campus from a Lekki-only holder', async ({
    api,
    pool,
    withPermissions,
    schools: { orgA, owner, lekki, ikeja },
  }) => {
    for (const [pillar, subjectType, text] of [
      ['access', 'guardian', 'Ikeja login reset.'],
      ['foundation', 'school_year', 'Ikeja year started.'],
    ] as const) {
      await addEvent(pool, {
        orgId: orgA.id,
        actorId: owner.id,
        campusId: ikeja.id,
        pillar,
        subjectType,
        text,
      });
    }
    const permissions = ['member:read', 'session:read'] as const;
    const lekkiHolder = await withPermissions(orgA, permissions, {
      campuses: [lekki],
    });
    const ikejaHolder = await withPermissions(orgA, permissions, {
      campuses: [ikeja],
    });
    const texts = async (actor: Actor) =>
      (await activityOf(api, actor)).items.map((item) => item.text);

    expect(await texts(lekkiHolder)).toEqual([]);
    expect((await texts(ikejaHolder)).toSorted(byText)).toEqual([
      'Ikeja login reset.',
      'Ikeja year started.',
    ]);
    expect(await texts(owner)).toEqual(
      expect.arrayContaining(['Ikeja login reset.', 'Ikeja year started.'])
    );
  });

  test('shows an access row with no campus only when campus scope is all', async ({
    api,
    pool,
    withPermissions,
    schools: { orgA, owner, lekki },
  }) => {
    await addEvent(pool, {
      orgId: orgA.id,
      actorId: owner.id,
      pillar: 'access',
      subjectType: 'guardian',
      text: 'Login reset for a guardian.',
    });
    const lekkiHolder = await withPermissions(orgA, ['member:read'], {
      campuses: [lekki],
    });
    const everywhere = await withPermissions(orgA, [
      'member:read',
      'campus:readAll',
    ]);
    const texts = async (actor: Actor) =>
      (await activityOf(api, actor)).items.map((item) => item.text);

    expect(await texts(lekkiHolder)).toEqual([]);
    expect(await texts(everywhere)).toEqual(['Login reset for a guardian.']);
  });

  test('hides finance rows from everyone and shows school-wide rows to every member', async ({
    api,
    pool,
    schools: { orgA, owner, noPermission },
  }) => {
    await addEvent(pool, {
      orgId: orgA.id,
      actorId: owner.id,
      pillar: 'finance',
      subjectType: 'payment',
      text: 'Payment recorded.',
    });
    await addEvent(pool, {
      orgId: orgA.id,
      actorId: owner.id,
      pillar: 'platform',
      subjectType: 'school',
      text: 'School set up.',
    });

    const seen = await activityOf(api, noPermission);
    expect(seen.items.map((item) => item.text)).toEqual(['School set up.']);
    expect(seen.total).toBe(1);
    expect(
      (await activityOf(api, owner)).items.map((item) => item.text)
    ).not.toContain('Payment recorded.');
  });

  test('hides student events outside a teacher’s class scope', async ({
    api,
    app,
    pool,
    addMember,
    createUser,
    schools: { orgA, owner, lekki, studentLekki },
  }) => {
    const other = await createClass(app, owner, {
      campusId: lekki.id,
      name: 'Other',
    });
    const outside = await createStudent(app, owner, {
      campusId: lekki.id,
      classArmId: other.id,
    });
    const teacher = await addMember(orgA, await createUser(), {
      roles: ['teacher'],
      campuses: [lekki],
    });
    await assignClassTeacher(app, owner, {
      classId: await armOf(pool, studentLekki.id),
      userId: teacher.id,
      role: 'lead',
    });

    const texts = (await activityOf(api, teacher)).items
      .map((item) => item.text)
      .join(' ');
    expect(texts).toContain(studentLekki.firstName);
    expect(texts).not.toContain(outside.firstName);
    expect((await activityOf(api, owner)).total).toBe(3);
  });

  test('pages ten at a time, newest first, with the filtered total', async ({
    api,
    pool,
    schools: { orgA, owner, noPermission },
  }) => {
    for (let n = 1; n <= 12; n += 1) {
      await addEvent(pool, {
        orgId: orgA.id,
        actorId: owner.id,
        pillar: 'platform',
        subjectType: 'school',
        text: `Note ${String(n).padStart(2, '0')}`,
        at: `2026-10-${String(n).padStart(2, '0')}T09:00:00Z`,
      });
    }

    const first = await activityOf(api, noPermission, 1);
    const second = await activityOf(api, noPermission, 2);
    const beyond = await activityOf(api, noPermission, 3);

    expect(first.total).toBe(12);
    expect(first.items).toHaveLength(10);
    expect(first.items[0]?.text).toBe('Note 12');
    expect(second.items.map((item) => item.text)).toEqual([
      'Note 02',
      'Note 01',
    ]);
    expect(beyond).toMatchObject({ items: [], total: 12 });
    await api(noPermission).get('/activity?page=0').expect(400);
  });
});

test.describe('finance tiles and the roll owed column', () => {
  test('the tiles match Who owes for the whole school', async ({
    api,
    app,
    clock,
    schools,
  }) => {
    await seedDebtsAndPayments({ api, app, clock, ...schools });

    const finance = await financeOf(api, schools.owner);
    const balances = (
      await api(schools.owner).get('/finance/balances').expect(200)
    ).body as BalanceList;

    expect(finance).toEqual({
      currency: 'NGN',
      receivedMinor: LEKKI_PAID + IKEJA_PAID,
      paymentCount: 2,
      owedMinor: LEKKI_DEBT + IKEJA_DEBT - LEKKI_PAID - IKEJA_PAID,
      owingStudents: 2,
    });
    expect(finance).toMatchObject({
      receivedMinor: balances.summary.receivedThisTermMinor,
      paymentCount: balances.summary.paymentsThisTerm,
      owedMinor: balances.summary.totalOwedMinor,
      owingStudents: balances.summary.studentsOwing,
    });
  });

  test('a payment dated after the current term ends is not received', async ({
    api,
    app,
    clock,
    schools,
  }) => {
    await seedDebtsAndPayments({ api, app, clock, ...schools });
    const { owner, studentLekki } = schools;
    const account = await bankAccount(app, owner);
    clock.set('2035-01-01');
    await recordCash(api, owner, {
      accountId: account.id,
      paidOn: clock.today(),
      allocations: [{ studentId: studentLekki.id, amountMinor: 100_000 }],
    });

    expect(await financeOf(api, owner)).toMatchObject({
      receivedMinor: LEKKI_PAID + IKEJA_PAID,
      paymentCount: 2,
    });
  });

  test('invoice:read alone drops the received fields and payment:read alone keeps them', async ({
    api,
    app,
    clock,
    withPermissions,
    schools,
  }) => {
    await seedDebtsAndPayments({ api, app, clock, ...schools });
    const { orgA, lekki, ikeja } = schools;
    const campuses = { campuses: [lekki, ikeja] };
    const viaInvoice = await withPermissions(orgA, ['invoice:read'], campuses);
    const viaPayment = await withPermissions(orgA, ['payment:read'], campuses);

    const invoiceView = await financeOf(api, viaInvoice);
    expect(invoiceView).toMatchObject({ owingStudents: 2 });
    expect(invoiceView).not.toHaveProperty('receivedMinor');
    expect(invoiceView).not.toHaveProperty('paymentCount');
    expect(await financeOf(api, viaPayment)).toMatchObject({
      receivedMinor: LEKKI_PAID + IKEJA_PAID,
      paymentCount: 2,
      owingStudents: 2,
    });
  });

  test('the roll adds owed per bucket for finance readers only, and the buckets sum to Who owes', async ({
    api,
    app,
    clock,
    withPermissions,
    schools,
  }) => {
    await seedDebtsAndPayments({ api, app, clock, ...schools });
    const { owner, orgA, studentIkeja } = schools;
    await api(owner)
      .post(`/students/${studentIkeja.id}/leave`)
      .send({ reason: 'relocated', lastDay: studentIkeja.admittedOn })
      .expect(201);
    const lekkiOwes = LEKKI_DEBT - LEKKI_PAID;
    const ikejaOwes = IKEJA_DEBT - IKEJA_PAID;

    const roll = await rollOf(api, owner);
    expect(roll.currency).toBe('NGN');
    expect(roll.owedMinor).toMatchObject({
      active: lekkiOwes,
      inactive: 0,
      left: ikejaOwes,
      graduated: 0,
    });
    expect(roll.formerOwedMinor).toBe(ikejaOwes);
    const balances = (await api(owner).get('/finance/balances').expect(200))
      .body as BalanceList;
    const { active, inactive, left, graduated } = roll.owedMinor ?? {};
    expect(
      (active ?? 0) + (inactive ?? 0) + (left ?? 0) + (graduated ?? 0)
    ).toBe(balances.summary.totalOwedMinor);

    const readsStudentsOnly = await withPermissions(orgA, ['student:read']);
    const plain = await rollOf(api, readsStudentsOnly);
    expect(plain).not.toHaveProperty('currency');
    expect(plain).not.toHaveProperty('owedMinor');
    expect(plain).not.toHaveProperty('formerOwedMinor');
  });
});
