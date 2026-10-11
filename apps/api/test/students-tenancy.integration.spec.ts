import { expect } from './support/base-test';
import { assignClassTeacher } from './support/factories/classes';
import { createStudent, ensureClass } from './support/factories/students';
import { schoolsTest } from './support/two-schools';

const test = schoolsTest;

const byText = (a: string, b: string) => a.localeCompare(b);

const guardianBody = {
  new: {
    fullName: 'Any Parent',
    phone: '08011112222',
    address: '1 Test Street',
    relationship: 'mother',
    login: { kind: 'username' },
  },
};

test.describe('isolation', () => {
  test('case 1: another school’s student and guardian answer 404 on every route', async ({
    api,
    schools: { ownerB, studentLekki },
  }) => {
    const student = `/students/${studentLekki.id}`;
    const guardianId = studentLekki.guardians?.[0]?.guardianId ?? '';
    const guardian = `/guardians/${guardianId}`;

    await api(ownerB).get(student).expect(404);
    await api(ownerB).patch(student).send({ firstName: 'x' }).expect(404);
    await api(ownerB).get(`${student}/guardians`).expect(404);
    await api(ownerB)
      .post(`${student}/guardians`)
      .send(guardianBody)
      .expect(404);
    await api(ownerB)
      .patch(`${student}/guardians/${guardianId}`)
      .send({ paysFees: true })
      .expect(404);
    await api(ownerB).delete(`${student}/guardians/${guardianId}`).expect(404);
    await api(ownerB).get(guardian).expect(404);
    await api(ownerB)
      .patch(guardian)
      .send({ phone: '08099990000' })
      .expect(404);
    await api(ownerB).post(`${guardian}/reset-login`).expect(404);
    await api(ownerB)
      .get(`/guardians?excludeStudentId=${studentLekki.id}`)
      .expect(404);
  });

  test('case 2: lists, the picker and the preview hold nothing of another school', async ({
    api,
    schools: { owner, ownerB, studentLekki, studentIkeja, studentB },
  }) => {
    const mine = await api(owner).get('/students').expect(200);
    const theirs = await api(ownerB).get('/students').expect(200);
    const guardians = await api(ownerB).get('/guardians').expect(200);
    const preview = await api(ownerB).get('/admissions/preview').expect(200);

    expect(
      mine.body.items.map((row: { id: string }) => row.id).toSorted(byText)
    ).toEqual([studentLekki.id, studentIkeja.id].toSorted(byText));
    expect(theirs.body.items.map((row: { id: string }) => row.id)).toEqual([
      studentB.id,
    ]);
    expect(guardians.body.map((row: { id: string }) => row.id)).toEqual([
      studentB.guardians?.[0]?.guardianId,
    ]);
    expect(preview.body.classes).toHaveLength(1);
    expect(preview.body.nextAdmissionNumber).toBe('TST-0002');
    const found = await api(ownerB)
      .get(`/guardians?q=${encodeURIComponent('08012345678')}`)
      .expect(200);
    expect(found.body.map((row: { id: string }) => row.id)).toEqual([
      studentB.guardians?.[0]?.guardianId,
    ]);
  });

  test('case 7: the composite foreign keys refuse rows that point across schools', async ({
    pool,
    schools: { orgA, orgB, campusB, studentLekki, studentB },
  }) => {
    const refused = (sql: string, values: unknown[]) =>
      expect(pool.query(sql, values)).rejects.toMatchObject({ code: '23503' });
    const [armA] = (
      await pool.query(
        `SELECT id, class_level_id FROM class_arm WHERE organization_id = $1`,
        [orgA.id]
      )
    ).rows;
    const sessionB = (
      await pool.query(
        `SELECT id FROM academic_session WHERE organization_id = $1`,
        [orgB.id]
      )
    ).rows[0].id;
    const termB = (
      await pool.query(
        `SELECT id FROM term WHERE organization_id = $1 LIMIT 1`,
        [orgB.id]
      )
    ).rows[0].id;
    const enrolmentA = (
      await pool.query(
        `SELECT id FROM student_enrollment WHERE student_id = $1`,
        [studentLekki.id]
      )
    ).rows[0].id;
    const guardianA = studentLekki.guardians?.[0]?.guardianId;

    await refused(
      `INSERT INTO student_enrollment (organization_id, student_id, session_id, class_level_id)
       VALUES ($1, $2, $3, $4)`,
      [orgB.id, studentLekki.id, sessionB, armA.class_level_id]
    );
    await refused(
      `INSERT INTO enrollment_placement
         (organization_id, enrollment_id, term_id, class_arm_id, campus_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [orgB.id, enrolmentA, termB, armA.id, campusB.id]
    );
    await refused(
      `INSERT INTO guardian_student (organization_id, guardian_id, student_id, relationship)
       VALUES ($1, $2, $3, 'father')`,
      [orgB.id, guardianA, studentB.id]
    );
    await refused(
      `INSERT INTO guardian_student (organization_id, guardian_id, student_id, relationship)
       VALUES ($1, $2, $3, 'father')`,
      [orgA.id, guardianA, studentB.id]
    );
    await refused(
      `INSERT INTO activity_event
         (organization_id, campus_id, pillar, kind, actor_user_id, subject_type, subject_id, text)
       VALUES ($1, $2, 'foundation', 'x', 'u', 'student', 's', 't')`,
      [orgA.id, campusB.id]
    );
  });

  test('refuses to delete a student, an enrolment, a guardian or a school that holds them', async ({
    pool,
    schools: { orgA, studentLekki },
  }) => {
    const guardianId = studentLekki.guardians?.[0]?.guardianId;
    const enrolmentId = (
      await pool.query(
        `SELECT id FROM student_enrollment WHERE student_id = $1`,
        [studentLekki.id]
      )
    ).rows[0].id;
    const refused = (sql: string, values: unknown[]) =>
      expect(pool.query(sql, values)).rejects.toMatchObject({ code: '23503' });

    await refused(`DELETE FROM student WHERE id = $1`, [studentLekki.id]);
    await refused(`DELETE FROM student_enrollment WHERE id = $1`, [
      enrolmentId,
    ]);
    await refused(`DELETE FROM guardian WHERE id = $1`, [guardianId]);
    await refused(`DELETE FROM organization WHERE id = $1`, [orgA.id]);
  });

  test('keeps the activity log append-only and free of passwords', async ({
    api,
    pool,
    schools: { owner, orgA, studentLekki },
  }) => {
    const added = await api(owner)
      .post(`/students/${studentLekki.id}/guardians`)
      .send(guardianBody)
      .expect(201);
    const reset = await api(owner)
      .post(`/guardians/${added.body.link.guardianId}/reset-login`)
      .expect(201);
    const secrets = [
      ...studentLekki.logins.map((login) => login.temporaryPassword),
      added.body.login.temporaryPassword,
      reset.body.temporaryPassword,
    ];

    const events = await pool.query(
      `SELECT id, kind, text, data::text AS data FROM activity_event WHERE organization_id = $1`,
      [orgA.id]
    );

    expect(events.rows.map((row) => row.kind).toSorted(byText)).toEqual(
      [
        'guardian.linked',
        'guardian.login_reset',
        'student.admitted',
        'student.admitted',
      ].toSorted(byText)
    );
    for (const row of events.rows) {
      for (const secret of secrets) {
        expect(`${row.text} ${row.data}`).not.toContain(secret);
      }
      expect(row.data).not.toMatch(/pass/i);
    }
    const id = events.rows[0].id;
    await expect(
      pool.query(`UPDATE activity_event SET text = 'x' WHERE id = $1`, [id])
    ).rejects.toThrow('activity_event is append-only');
    await expect(
      pool.query(`DELETE FROM activity_event WHERE id = $1`, [id])
    ).rejects.toThrow('activity_event is append-only');
    await expect(pool.query(`TRUNCATE activity_event`)).resolves.toBeDefined();
  });

  test('case 3 and 4: a Lekki-only clerk gets 404 for Ikeja on every route and lists only Lekki', async ({
    api,
    withPermissions,
    schools: { orgA, lekki, studentLekki, studentIkeja },
  }) => {
    const clerk = await withPermissions(
      orgA,
      [
        'student:read',
        'student:update',
        'guardian:read',
        'guardian:link',
        'guardian:create',
        'guardian:update',
      ],
      { campuses: [lekki] }
    );
    const ikejaStudent = `/students/${studentIkeja.id}`;
    const ikejaGuardian = studentIkeja.guardians?.[0]?.guardianId ?? '';

    await api(clerk).get(ikejaStudent).expect(404);
    await api(clerk).patch(ikejaStudent).send({ firstName: 'x' }).expect(404);
    await api(clerk).get(`${ikejaStudent}/guardians`).expect(404);
    await api(clerk)
      .post(`${ikejaStudent}/guardians`)
      .send(guardianBody)
      .expect(404);
    await api(clerk)
      .patch(`${ikejaStudent}/guardians/${ikejaGuardian}`)
      .send({ paysFees: true })
      .expect(404);
    await api(clerk)
      .delete(`${ikejaStudent}/guardians/${ikejaGuardian}`)
      .expect(404);
    await api(clerk).get(`/guardians/${ikejaGuardian}`).expect(404);
    await api(clerk)
      .patch(`/guardians/${ikejaGuardian}`)
      .send({ phone: '08000000000' })
      .expect(404);
    await api(clerk)
      .post(`/guardians/${ikejaGuardian}/reset-login`)
      .expect(404);

    const list = await api(clerk).get('/students').expect(200);
    expect(list.body.items.map((row: { id: string }) => row.id)).toEqual([
      studentLekki.id,
    ]);
    const guardians = await api(clerk).get('/guardians').expect(200);
    expect(guardians.body.map((row: { id: string }) => row.id)).toEqual([
      studentLekki.guardians?.[0]?.guardianId,
    ]);
  });

  test('case 8: a class-scoped teacher gets 404 for a student outside their classes on every route', async ({
    api,
    app,
    addMember,
    createUser,
    schools: { owner, orgA, lekki, studentLekki },
  }) => {
    const levels = (await api(owner).get('/class-levels').expect(200)).body as {
      id: string;
      code: string;
    }[];
    const mine = await ensureClass(app, owner, lekki.id);
    const silver = (
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
      classArmId: silver,
    });
    const teacher = await addMember(orgA, await createUser(), {
      roles: ['teacher'],
      campuses: [lekki],
    });
    await assignClassTeacher(app, owner, { classId: mine, userId: teacher.id });

    await api(teacher).get(`/students/${studentLekki.id}`).expect(200);
    await api(teacher).get(`/students/${stranger.id}`).expect(404);
    const list = await api(teacher).get('/students').expect(200);
    expect(list.body.items.map((row: { id: string }) => row.id)).toEqual([
      studentLekki.id,
    ]);
    await api(teacher)
      .get(`/students/${studentLekki.id}/guardians`)
      .expect(403);
  });
});
