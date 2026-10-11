import { Client, type Pool } from 'pg';
import { vi } from 'vitest';
import { StudentService } from '../src/app/modules/student/student.service';
import { expect } from './support/base-test';
import { orgContextFor } from './support/factories/org-context';
import { assignClassTeacher } from './support/factories/classes';
import { createStudent, ensureClass } from './support/factories/students';
import { schoolsTest } from './support/two-schools';

const test = schoolsTest;

const TODAY = '2026-10-11';

const byText = (a: string, b: string) => a.localeCompare(b);

interface Row {
  id: string;
  firstName: string;
  lastName: string;
  life: string;
  payers?: string[];
  dueLeft?: boolean;
}

const rows = (res: { body: { items: Row[] } }) => res.body.items;
const names = (items: Row[]) => items.map((row) => row.lastName);

/** One call per student, in the given order, so last names sort as they are given. */
const admitAll = async (
  app: Parameters<typeof createStudent>[0],
  owner: { cookie: string },
  input: { campusId: string; lastNames: string[] }
) => {
  const { campusId, lastNames } = input;
  const students = [];
  for (const lastName of lastNames) {
    students.push(
      await createStudent(app, owner, { campusId, lastName, firstName: 'Kid' })
    );
  }
  return students;
};

const daysAgo = (days: number) =>
  new Date(Date.parse(TODAY) - days * 86_400_000).toISOString().slice(0, 10);

async function bulkStudents(
  pool: Pool,
  input: { organizationId: string; campusId: string; count: number }
): Promise<void> {
  const base = await pool.query<{
    term_id: string;
    session_id: string;
    arm_id: string;
    level_id: string;
  }>(
    `SELECT t.id AS term_id, t.session_id, a.id AS arm_id, a.class_level_id AS level_id
     FROM term t, class_arm a
     WHERE t.organization_id = $1 AND t.is_current
       AND a.organization_id = $1 AND a.campus_id = $2
     LIMIT 1`,
    [input.organizationId, input.campusId]
  );
  const ids = base.rows[0];
  if (ids === undefined) {
    throw new Error('The school needs a current term and a class');
  }
  await pool.query(
    `WITH s AS (
       INSERT INTO student
         (organization_id, campus_id, first_name, last_name, gender,
          date_of_birth, admission_number, admitted_on)
       SELECT $1, $2, 'Bulk', 'Row' || lpad(g::text, 5, '0'), 'F',
              '2014-03-03', 'BULK-' || g, '2026-09-07'
       FROM generate_series(1, $3::int) g
       RETURNING id
     ), e AS (
       INSERT INTO student_enrollment
         (organization_id, student_id, session_id, class_level_id, is_new_student)
       SELECT $1, s.id, $4, $5, false FROM s
       RETURNING id
     )
     INSERT INTO enrollment_placement
       (organization_id, enrollment_id, term_id, class_arm_id, campus_id)
     SELECT $1, e.id, $6, $7, $2 FROM e`,
    [
      input.organizationId,
      input.campusId,
      input.count,
      ids.session_id,
      ids.level_id,
      ids.term_id,
      ids.arm_id,
    ]
  );
}

test.describe('students list', () => {
  test('counts the five tabs over everything visible and filters the total', async ({
    api,
    app,
    pool,
    clock,
    schools: { owner, orgA, lekki },
  }) => {
    clock.set(TODAY);
    const kids = await admitAll(app, owner, {
      campusId: lekki.id,
      lastNames: ['Adewale', 'Bello', 'Chukwu', 'Danjuma', 'Eze', 'Fashola'],
    });
    const idOf = (name: string) =>
      kids.find((kid) => kid.lastName === name)?.id ?? '';
    const term = `(SELECT id FROM term WHERE organization_id = '${orgA.id}' AND is_current)`;
    await pool.query(
      `UPDATE student_enrollment SET is_new_student = false WHERE student_id = $1`,
      [idOf('Bello')]
    );
    await pool.query(`UPDATE student SET not_seen_since = $2 WHERE id = $1`, [
      idOf('Chukwu'),
      daysAgo(40),
    ]);
    await pool.query(`UPDATE student SET not_seen_since = $2 WHERE id = $1`, [
      idOf('Danjuma'),
      daysAgo(34),
    ]);
    await pool.query(
      `UPDATE student SET exit_kind = 'left', exit_reason = 'relocated',
         exit_note = 'Moved to Abuja', last_day = $2, archived_at = now(),
         archived_term_id = ${term}
       WHERE id = $1`,
      [idOf('Eze'), daysAgo(3)]
    );
    await pool.query(
      `UPDATE student SET exit_kind = 'graduated', exit_reason = 'completed',
         archived_at = now(), archived_term_id = ${term}
       WHERE id = $1`,
      [idOf('Fashola')]
    );

    const active = await api(owner).get('/students').expect(200);

    expect(active.body.counts).toEqual({
      active: 5,
      new: 4,
      inactive: 1,
      left: 1,
      graduated: 1,
    });
    expect(active.body.total).toBe(5);
    expect(active.body.startYear).toBeNull();
    expect(names(rows(active))).toEqual([
      'Adewale',
      'Bello',
      'Danjuma',
      'Tester',
      'Tester',
    ]);
    const danjuma = rows(active).find((row) => row.lastName === 'Danjuma');
    expect(danjuma).toMatchObject({
      life: 'active',
      notSeenSince: daysAgo(34),
      weeksAway: 4,
      dueLeft: false,
    });

    const fresh = await api(owner).get('/students?tab=new').expect(200);
    expect(fresh.body.total).toBe(4);
    expect(names(rows(fresh))).not.toContain('Bello');

    const inactive = await api(owner).get('/students?tab=inactive').expect(200);
    expect(rows(inactive)).toMatchObject([
      { lastName: 'Chukwu', life: 'inactive', weeksAway: 5, dueLeft: false },
    ]);

    const left = await api(owner).get('/students?tab=left').expect(200);
    expect(rows(left)).toMatchObject([
      {
        lastName: 'Eze',
        life: 'left',
        exit: {
          kind: 'left',
          on: daysAgo(3),
          reason: 'Relocated',
          note: 'Moved to Abuja',
        },
      },
    ]);

    const graduated = await api(owner)
      .get('/students?tab=graduated')
      .expect(200);
    expect(rows(graduated)).toMatchObject([
      {
        lastName: 'Fashola',
        exit: { kind: 'graduated', reason: 'Completed JSS 1' },
      },
    ]);

    const searched = await api(owner).get('/students?q=ewa').expect(200);
    expect(searched.body.total).toBe(1);
    expect(searched.body.counts.active).toBe(5);
  });

  test('turns a student due to be marked Left on at day 133, not before', async ({
    api,
    app,
    pool,
    clock,
    schools: { owner, lekki },
  }) => {
    clock.set(TODAY);
    const [early, due] = await admitAll(app, owner, {
      campusId: lekki.id,
      lastNames: ['Early', 'Due'],
    });
    await pool.query(`UPDATE student SET not_seen_since = $2 WHERE id = $1`, [
      early?.id,
      daysAgo(132),
    ]);
    await pool.query(`UPDATE student SET not_seen_since = $2 WHERE id = $1`, [
      due?.id,
      daysAgo(133),
    ]);

    const list = await api(owner).get('/students?tab=inactive').expect(200);

    expect(rows(list).map((row) => [row.lastName, row.dueLeft])).toEqual([
      ['Due', true],
      ['Early', false],
    ]);
  });

  test('finds students by name and admission number, ignoring case', async ({
    api,
    app,
    schools: { owner, lekki },
  }) => {
    await admitAll(app, owner, { campusId: lekki.id, lastNames: ['Okeke'] });

    const byName = await api(owner).get('/students?q=OKEKE').expect(200);
    const byNumber = await api(owner).get('/students?q=tst-0001').expect(200);
    const byFullName = await api(owner)
      .get('/students?q=kid%20okeke')
      .expect(200);

    expect(names(rows(byName))).toEqual(['Okeke']);
    expect(byNumber.body.total).toBe(1);
    expect(byNumber.body.items[0].admissionNumber).toBe('TST-0001');
    expect(names(rows(byFullName))).toEqual(['Okeke']);
  });

  test('searches guardian names and phones only with guardian:read and shows payers only then', async ({
    api,
    withPermissions,
    schools: { orgA, lekki, studentLekki },
  }) => {
    const reader = await withPermissions(orgA, ['student:read'], {
      campuses: [lekki],
    });
    const guardian = studentLekki.guardians?.[0];
    const holder = await withPermissions(
      orgA,
      ['student:read', 'guardian:read'],
      {
        campuses: [lekki],
      }
    );

    const hidden = await api(reader)
      .get(`/students?q=${encodeURIComponent(guardian?.fullName ?? '')}`)
      .expect(200);
    const hiddenPhone = await api(reader)
      .get('/students?q=08012345678')
      .expect(200);
    const found = await api(holder)
      .get(`/students?q=${encodeURIComponent(guardian?.fullName ?? '')}`)
      .expect(200);
    const foundPhone = await api(holder)
      .get('/students?q=08012345678')
      .expect(200);

    expect(hidden.body.total).toBe(0);
    expect(hiddenPhone.body.total).toBe(0);
    expect(found.body.total).toBe(1);
    expect(foundPhone.body.total).toBe(1);
    expect(found.body.items[0].payers).toEqual([guardian?.fullName]);
    const plain = await api(reader).get('/students').expect(200);
    expect(plain.body.items[0]).not.toHaveProperty('payers');
  });

  test('filters by campus and by the level of the latest enrolment', async ({
    api,
    schools: { owner, ikeja, studentIkeja },
  }) => {
    const levels = (await api(owner).get('/class-levels').expect(200)).body as {
      id: string;
      code: string;
    }[];
    const jss1 = levels.find((level) => level.code === 'JSS1')?.id;
    const jss2 = levels.find((level) => level.code === 'JSS2')?.id;

    const byCampus = await api(owner)
      .get(`/students?campusId=${ikeja.id}`)
      .expect(200);
    const byLevel = await api(owner)
      .get(`/students?levelId=${jss1}`)
      .expect(200);
    const otherLevel = await api(owner)
      .get(`/students?levelId=${jss2}`)
      .expect(200);

    expect(byCampus.body.items.map((row: Row) => row.id)).toEqual([
      studentIkeja.id,
    ]);
    expect(byLevel.body.total).toBe(2);
    expect(otherLevel.body.total).toBe(0);
  });

  test('sorts by last name and pages ten at a time', async ({
    api,
    pool,
    schools: { owner, orgA, lekki },
  }) => {
    await bulkStudents(pool, {
      organizationId: orgA.id,
      campusId: lekki.id,
      count: 21,
    });

    const first = await api(owner).get('/students').expect(200);
    const third = await api(owner).get('/students?page=3').expect(200);
    const large = await api(owner).get('/students?pageSize=100').expect(200);

    expect(first.body.total).toBe(23);
    expect(first.body.items).toHaveLength(10);
    expect(third.body.items).toHaveLength(3);
    expect(names(rows(large))).toEqual(names(rows(large)).toSorted(byText));
    expect(first.body.items.map((row: Row) => row.id)).toEqual(
      large.body.items.slice(0, 10).map((row: Row) => row.id)
    );
    await api(owner).get('/students?pageSize=101').expect(400);
  });

  test('answers a 3,000-row school with one statement', async ({
    app,
    pool,
    schools: { owner, orgA, lekki },
  }) => {
    await bulkStudents(pool, {
      organizationId: orgA.id,
      campusId: lekki.id,
      count: 3000,
    });
    const ctx = await orgContextFor(app, owner);
    const service = app.get(StudentService, { strict: false });
    const spy = vi.spyOn(Client.prototype, 'query');
    const started = Date.now();
    const result = await service.list(ctx, {
      tab: 'active',
      page: 2,
      pageSize: 10,
      q: 'row',
    });
    const statements = spy.mock.calls.length;
    spy.mockRestore();

    expect(statements).toBe(1);
    expect(result.total).toBe(3000);
    expect(result.counts.active).toBe(3002);
    expect(result.items).toHaveLength(10);
    expect(Date.now() - started).toBeLessThan(5000);
  });

  test('puts a student on the effective campus: placed in Ikeja, home Lekki is hidden from a Lekki-only member', async ({
    api,
    app,
    pool,
    schools: { owner, ikeja, lekki, lekkiOnly, studentLekki },
  }) => {
    const ikejaArm = await ensureClass(app, owner, ikeja.id);
    await pool.query(
      `UPDATE enrollment_placement SET class_arm_id = $2, campus_id = $3
       WHERE enrollment_id IN (SELECT id FROM student_enrollment WHERE student_id = $1)`,
      [studentLekki.id, ikejaArm, ikeja.id]
    );

    const lekkiList = await api(lekkiOnly).get('/students').expect(200);
    await api(lekkiOnly).get(`/students/${studentLekki.id}`).expect(404);
    const ownerList = await api(owner)
      .get(`/students?campusId=${ikeja.id}`)
      .expect(200);
    const detail = await api(owner)
      .get(`/students/${studentLekki.id}`)
      .expect(200);

    expect(lekkiList.body.items).toEqual([]);
    expect(ownerList.body.total).toBe(2);
    expect(detail.body.homeCampus.id).toBe(lekki.id);
    expect(detail.body.effectiveCampus.id).toBe(ikeja.id);
    expect(detail.body.currentPlacement).toMatchObject({ armId: ikejaArm });
  });
});

test.describe('class scope', () => {
  test('lets a teacher see only the students in their classes, with no guardian data', async ({
    api,
    app,
    addMember,
    createUser,
    schools: { owner, orgA, lekki, studentLekki },
  }) => {
    const mine = await ensureClass(app, owner, lekki.id);
    const levels = (await api(owner).get('/class-levels').expect(200)).body as {
      id: string;
      code: string;
    }[];
    const other = (
      await api(owner)
        .post('/classes')
        .send({
          levelId: levels.find((level) => level.code === 'JSS2')?.id,
          campusId: lekki.id,
          name: 'Silver',
        })
        .expect(201)
    ).body.id as string;
    const stranger = await createStudent(app, owner, {
      campusId: lekki.id,
      classArmId: other,
      lastName: 'Stranger',
    });
    const teacher = await addMember(orgA, await createUser(), {
      roles: ['teacher'],
      campuses: [lekki],
    });
    await assignClassTeacher(app, owner, { classId: mine, userId: teacher.id });

    const list = await api(teacher).get('/students').expect(200);
    const detail = await api(teacher)
      .get(`/students/${studentLekki.id}`)
      .expect(200);
    const hidden = await api(teacher)
      .get(`/students/${stranger.id}`)
      .expect(404);
    const guardianSearch = await api(teacher)
      .get(
        `/students?q=${encodeURIComponent(studentLekki.guardians?.[0]?.fullName ?? '')}`
      )
      .expect(200);

    expect(list.body.items.map((row: Row) => row.id)).toEqual([
      studentLekki.id,
    ]);
    expect(list.body.counts.active).toBe(1);
    expect(list.body.items[0]).not.toHaveProperty('payers');
    expect(detail.body).not.toHaveProperty('guardians');
    expect(hidden.body.message).toBe('Student not found');
    expect(guardianSearch.body.total).toBe(0);
    await api(teacher)
      .get(`/students/${studentLekki.id}/guardians`)
      .expect(403);
  });

  test('shows a class-scoped member nobody, and the owner home campuses, while no term is current', async ({
    api,
    app,
    pool,
    addMember,
    createUser,
    schools: { owner, orgA, lekki, studentLekki },
  }) => {
    const mine = await ensureClass(app, owner, lekki.id);
    const teacher = await addMember(orgA, await createUser(), {
      roles: ['teacher'],
      campuses: [lekki],
    });
    await assignClassTeacher(app, owner, { classId: mine, userId: teacher.id });
    expect((await api(teacher).get('/students').expect(200)).body.total).toBe(
      1
    );
    await pool.query(
      `UPDATE term SET is_current = false WHERE organization_id = $1`,
      [orgA.id]
    );

    const asTeacher = await api(teacher).get('/students').expect(200);
    const asOwner = await api(owner).get('/students').expect(200);

    expect(asTeacher.body.items).toEqual([]);
    expect(asOwner.body.items.map((row: Row) => row.id)).toContain(
      studentLekki.id
    );
    expect(asOwner.body.items[0].currentPlacement).toBeNull();
    expect(asOwner.body.items[0].isNewIntake).toBe(false);
  });
});

test.describe('student detail', () => {
  test('answers 404 "Student not found" for another school’s student and an unknown id', async ({
    api,
    schools: { owner, ownerB, studentLekki, studentB },
  }) => {
    const foreign = await api(owner)
      .get(`/students/${studentB.id}`)
      .expect(404);
    const unknown = await api(owner)
      .get(`/students/${crypto.randomUUID()}`)
      .expect(404);
    await api(ownerB).get(`/students/${studentLekki.id}`).expect(404);

    expect(foreign.body.message).toBe('Student not found');
    expect(foreign.body).toEqual(unknown.body);
  });

  test('reads the profile, portal login and history, newest year first', async ({
    api,
    schools: { owner, studentLekki },
  }) => {
    const res = await api(owner)
      .get(`/students/${studentLekki.id}`)
      .expect(200);

    expect(res.body).toMatchObject({
      id: studentLekki.id,
      gender: 'F',
      dateOfBirth: '2014-03-03',
      portalLogin: { active: true },
      nextTerm: { name: 'Second term' },
      canMoveForNextTerm: true,
      canUndoLeaving: false,
    });
    expect(res.body.history).toHaveLength(1);
    expect(res.body.history[0]).toMatchObject({
      sessionName: '2026/2027',
      levelName: 'JSS 1',
      status: 'active',
      isNew: true,
    });
    expect(res.body.history[0].placements).toHaveLength(1);
    expect(res.body.guardians).toHaveLength(1);
  });

  test('corrects a name and refuses to edit a student who has left', async ({
    api,
    pool,
    schools: { owner, orgA, studentLekki },
  }) => {
    const changed = await api(owner)
      .patch(`/students/${studentLekki.id}`)
      .send({ firstName: '  Adaeze ', dateOfBirth: '2014-04-04' })
      .expect(200);
    expect(changed.body).toMatchObject({
      firstName: 'Adaeze',
      dateOfBirth: '2014-04-04',
    });
    await pool.query(
      `UPDATE student SET exit_kind = 'left', exit_reason = 'other', archived_at = now(),
         archived_term_id = (SELECT id FROM term WHERE organization_id = $2 AND is_current)
       WHERE id = $1`,
      [studentLekki.id, orgA.id]
    );

    const refused = await api(owner)
      .patch(`/students/${studentLekki.id}`)
      .send({ firstName: 'Again' })
      .expect(409);

    expect(refused.body.message).toContain('is no longer on the roll');
  });
});
