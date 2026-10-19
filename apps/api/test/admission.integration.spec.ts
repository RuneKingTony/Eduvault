import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { expect } from './support/base-test';
import { admissionBody, ensureClass } from './support/factories/students';
import { createClass } from './support/factories/classes';
import { makeCurrent, termOf } from './support/factories/terms';
import { schoolsTest } from './support/two-schools';

const test = schoolsTest;

const emailGuardian = (email: string, name = 'Ngozi Okeke') => ({
  new: {
    fullName: name,
    phone: '08011112222',
    address: '4 Palm Close',
    relationship: 'mother',
    paysFees: true,
    login: { kind: 'email', email },
  },
});

const body = (classArmId: string, overrides: Record<string, unknown> = {}) => ({
  ...admissionBody(classArmId, 'A'),
  ...overrides,
});

const link = (guardianId: string) => ({
  existingGuardianId: guardianId,
  relationship: 'father',
});

const query = (student: { firstName: string; lastName: string }) =>
  new URLSearchParams({
    firstName: ` ${student.firstName.toUpperCase()} `,
    lastName: student.lastName.toLowerCase(),
    dateOfBirth: '2014-03-03',
  }).toString();

const count = async (pool: Pool, table: string, organizationId: string) =>
  Number(
    (
      await pool.query<{ count: string }>(
        `SELECT count(*) FROM ${table} WHERE organization_id = $1`,
        [organizationId]
      )
    ).rows[0]?.count
  );

const usernameGuardian = {
  new: {
    fullName: 'Chidi Eze',
    phone: '08011112222',
    address: '4 Palm Close',
    relationship: 'father',
    paysFees: true,
    login: { kind: 'username' },
  },
};

const numberOf = (admissionNumber: string) =>
  Number(admissionNumber.slice(admissionNumber.lastIndexOf('-') + 1));

const tally = async (pool: Pool, organizationId: string) => ({
  students: await count(pool, 'student', organizationId),
  enrolments: await count(pool, 'student_enrollment', organizationId),
  users: Number(
    (await pool.query<{ count: string }>('SELECT count(*) FROM "user"')).rows[0]
      ?.count
  ),
});

// A BEFORE INSERT trigger seeds a same-username row inside the inserting
// transaction, so the insert hits user_username_uidx and the rollback removes
// the seed. The sequence survives the rollback and counts the attempts.
async function withUsernameClashes<T extends { status: number }>(
  pool: Pool,
  clash: { username: string; times: number },
  run: () => PromiseLike<T>
): Promise<{ attempts: number; res: T }> {
  await pool.query('CREATE SEQUENCE username_clash_attempts');
  await pool.query(`
    CREATE FUNCTION username_clash() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF nextval('username_clash_attempts') <= ${clash.times} THEN
        INSERT INTO "user" (name, email, "emailVerified", username, "displayUsername", "createdAt", "updatedAt")
        VALUES ('Racer', gen_random_uuid()::text || '@example.com', false, NEW.username, NEW.username, now(), now());
      END IF;
      RETURN NEW;
    END $$`);
  await pool.query(`
    CREATE TRIGGER username_clash BEFORE INSERT ON "user" FOR EACH ROW
    WHEN (NEW.username = '${clash.username}' AND pg_trigger_depth() = 0)
    EXECUTE FUNCTION username_clash()`);
  try {
    const res = await run();
    const { rows } = await pool.query<{
      last_value: string;
      is_called: boolean;
    }>('SELECT last_value, is_called FROM username_clash_attempts');
    return {
      attempts: rows[0]?.is_called === true ? Number(rows[0].last_value) : 0,
      res,
    };
  } finally {
    await pool.query('DROP TRIGGER username_clash ON "user"');
    await pool.query('DROP FUNCTION username_clash()');
    await pool.query('DROP SEQUENCE username_clash_attempts');
  }
}

test.describe('admission', () => {
  test('creates the student, enrolment, placement, guardians, logins and one activity row', async ({
    api,
    app,
    pool,
    schools: { owner, orgA, lekki, studentLekki },
  }) => {
    const arm = await ensureClass(app, owner, lekki.id);
    const existing = studentLekki.guardians?.[0]?.guardianId ?? '';

    const res = await api(owner)
      .post('/students')
      .send(
        body(arm, {
          firstName: 'Peace',
          lastName: 'Udoh',
          guardians: [
            emailGuardian('ngozi@example.com'),
            {
              existingGuardianId: existing,
              relationship: 'father',
              paysFees: false,
            },
          ],
        })
      )
      .expect(201);

    const { student, logins } = res.body;
    expect(student).toMatchObject({
      firstName: 'Peace',
      lastName: 'Udoh',
      admissionNumber: 'TST-0003',
      life: 'active',
      isNewIntake: true,
      effectiveCampus: { id: lekki.id },
      homeCampus: { id: lekki.id },
    });
    expect(student.currentPlacement).toMatchObject({ armId: arm });
    expect(student.portalLogin).toMatchObject({
      username: expect.stringMatching(/^school-a-[a-f0-9]{6}-0003$/),
      active: true,
    });
    expect(student.guardians).toHaveLength(2);
    expect(logins.map((login: { who: string }) => login.who)).toEqual([
      'student',
      'guardian',
    ]);

    const enrolment = await pool.query(
      `SELECT status, is_new_student FROM student_enrollment WHERE student_id = $1`,
      [student.id]
    );
    expect(enrolment.rows).toEqual([
      { status: 'active', is_new_student: true },
    ]);
    const placement = await pool.query(
      `SELECT p.class_arm_id, p.campus_id, t.is_current
       FROM enrollment_placement p
       JOIN student_enrollment e ON e.id = p.enrollment_id
       JOIN term t ON t.id = p.term_id
       WHERE e.student_id = $1`,
      [student.id]
    );
    expect(placement.rows).toEqual([
      { class_arm_id: arm, campus_id: lekki.id, is_current: true },
    ]);
    const links = await pool.query(
      `SELECT relationship, pays_fees FROM guardian_student
       WHERE student_id = $1 ORDER BY relationship`,
      [student.id]
    );
    expect(links.rows).toEqual([
      { relationship: 'father', pays_fees: false },
      { relationship: 'mother', pays_fees: true },
    ]);
    const activity = await pool.query(
      `SELECT kind, text, campus_id FROM activity_event
       WHERE organization_id = $1 AND subject_id = $2`,
      [orgA.id, student.id]
    );
    expect(activity.rows).toHaveLength(1);
    expect(activity.rows[0]).toMatchObject({
      kind: 'student.admitted',
      campus_id: lekki.id,
    });
    expect(activity.rows[0].text).toContain(
      'Peace Udoh admitted (TST-0003), placed in'
    );
    expect(activity.rows[0].text).toContain('Ngozi Okeke and');
  });

  test('every new login signs in with Better Auth, is flagged to change its password and is stored hashed', async ({
    api,
    app,
    pool,
    schools: { owner, lekki },
  }) => {
    const arm = await ensureClass(app, owner, lekki.id);
    const res = await api(owner)
      .post('/students')
      .send(
        body(arm, {
          guardians: [
            emailGuardian('ngozi@example.com'),
            {
              new: {
                fullName: 'Mrs Udoh',
                phone: '08033334444',
                address: '2 Palm Close',
                relationship: 'father',
                login: { kind: 'username' },
              },
            },
          ],
        })
      )
      .expect(201);
    const [student, emailLogin, usernameLogin] = res.body.logins;

    expect(student.temporaryPassword).toHaveLength(12);
    expect(emailLogin).toMatchObject({ email: 'ngozi@example.com' });
    expect(usernameLogin.username).toBe('udoh-family');
    for (const login of [student, usernameLogin]) {
      await api()
        .post('/api/auth/sign-in/username')
        .set('x-forwarded-for', '198.51.100.7')
        .send({ username: login.username, password: login.temporaryPassword })
        .expect(200);
    }
    await api()
      .post('/api/auth/sign-in/email')
      .set('x-forwarded-for', '198.51.100.8')
      .send({
        email: emailLogin.email,
        password: emailLogin.temporaryPassword,
      })
      .expect(200);
    await api()
      .post('/api/auth/sign-in/username')
      .set('x-forwarded-for', '198.51.100.9')
      .send({ username: student.username, password: 'wrong-password-123' })
      .expect(401);

    const users = await pool.query(
      `SELECT u."mustChangePassword", a.password, u.username
       FROM "user" u JOIN account a ON a."userId" = u.id
       WHERE u.username IN ($1, $2) OR u.email = $3`,
      [student.username, usernameLogin.username, emailLogin.email]
    );
    expect(users.rows).toHaveLength(3);
    for (const row of users.rows) {
      expect(row.mustChangePassword).toBe(true);
      expect(row.password).not.toContain(student.temporaryPassword);
      expect(row.password).not.toContain(usernameLogin.temporaryPassword);
    }
    const stored = await pool.query<{ text: string; data: string }>(
      `SELECT text, data::text AS data FROM activity_event`
    );
    for (const row of stored.rows) {
      for (const login of res.body.logins) {
        expect(row.text + row.data).not.toContain(login.temporaryPassword);
      }
    }
  });

  test('returns the passwords once: reading the student or the guardian again shows none', async ({
    api,
    app,
    schools: { owner, lekki },
  }) => {
    const arm = await ensureClass(app, owner, lekki.id);
    const res = await api(owner).post('/students').send(body(arm)).expect(201);
    const passwords = res.body.logins.map(
      (login: { temporaryPassword: string }) => login.temporaryPassword
    );
    const again = JSON.stringify([
      (await api(owner).get(`/students/${res.body.student.id}`).expect(200))
        .body,
      (await api(owner).get('/students').expect(200)).body,
      (
        await api(owner)
          .get(`/students/${res.body.student.id}/guardians`)
          .expect(200)
      ).body,
    ]);
    for (const password of passwords) {
      expect(again).not.toContain(password);
    }
  });

  test('rolls everything back when a guardian email already belongs to a guardian here', async ({
    api,
    app,
    pool,
    schools: { owner, orgA, lekki },
  }) => {
    const arm = await ensureClass(app, owner, lekki.id);
    await api(owner)
      .post('/students')
      .send(body(arm, { guardians: [emailGuardian('ngozi@example.com')] }))
      .expect(201);
    const before = {
      students: await count(pool, 'student', orgA.id),
      guardians: await count(pool, 'guardian', orgA.id),
      enrolments: await count(pool, 'student_enrollment', orgA.id),
      users: Number(
        (await pool.query('SELECT count(*) FROM "user"')).rows[0].count
      ),
    };

    const clash = await api(owner)
      .post('/students')
      .send(
        body(arm, {
          firstName: 'Second',
          guardians: [emailGuardian('Ngozi@Example.com', 'Someone Else')],
        })
      )
      .expect(409);

    expect(clash.body.message).toBe(
      'ngozi@example.com already belongs to Ngozi Okeke. Link the existing guardian instead.'
    );
    expect({
      students: await count(pool, 'student', orgA.id),
      guardians: await count(pool, 'guardian', orgA.id),
      enrolments: await count(pool, 'student_enrollment', orgA.id),
      users: Number(
        (await pool.query('SELECT count(*) FROM "user"')).rows[0].count
      ),
    }).toEqual(before);
  });

  test('retries once when a guardian username is taken by a competing commit', async ({
    api,
    app,
    pool,
    schools: { owner, orgA, lekki },
  }) => {
    const arm = await ensureClass(app, owner, lekki.id);
    const first = await api(owner)
      .post('/students')
      .send(body(arm))
      .expect(201);
    const before = await tally(pool, orgA.id);

    const { attempts, res } = await withUsernameClashes(
      pool,
      { username: 'chidi-eze-family', times: 1 },
      () =>
        api(owner)
          .post('/students')
          .send(
            body(arm, { firstName: 'Second', guardians: [usernameGuardian] })
          )
    );

    expect(res.status).toBe(201);
    expect(attempts).toBe(2);
    expect(
      res.body.logins.map((login: { username: string }) => login.username)
    ).toContain('chidi-eze-family');
    expect(await tally(pool, orgA.id)).toEqual({
      students: before.students + 1,
      enrolments: before.enrolments + 1,
      users: before.users + 2,
    });
    expect(numberOf(res.body.student.admissionNumber)).toBe(
      numberOf(first.body.student.admissionNumber) + 1
    );
  });

  test('gives up after one retry, answers 409, and leaves no row and no burned number', async ({
    api,
    app,
    pool,
    schools: { owner, orgA, lekki },
  }) => {
    const arm = await ensureClass(app, owner, lekki.id);
    const first = await api(owner)
      .post('/students')
      .send(body(arm))
      .expect(201);
    const before = await tally(pool, orgA.id);

    const { attempts, res } = await withUsernameClashes(
      pool,
      { username: 'chidi-eze-family', times: 2 },
      () =>
        api(owner)
          .post('/students')
          .send(
            body(arm, { firstName: 'Second', guardians: [usernameGuardian] })
          )
    );

    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      code: 'Conflict',
      message: 'Resource already exists',
    });
    expect(attempts).toBe(2);
    expect(await tally(pool, orgA.id)).toEqual(before);
    const next = await api(owner)
      .post('/students')
      .send(body(arm, { firstName: 'Third' }))
      .expect(201);
    expect(numberOf(next.body.student.admissionNumber)).toBe(
      numberOf(first.body.student.admissionNumber) + 1
    );
  });

  test('concurrent admissions get distinct numbers in the prefix format', async ({
    api,
    app,
    schools: { owner, lekki },
  }) => {
    const arm = await ensureClass(app, owner, lekki.id);

    const results = await Promise.all(
      ['One', 'Two', 'Three', 'Four', 'Five'].map((name) =>
        api(owner)
          .post('/students')
          .send(body(arm, { firstName: name }))
      )
    );

    expect(results.map((res) => res.status)).toEqual([201, 201, 201, 201, 201]);
    const numbers = results.map(
      (res) => res.body.student.admissionNumber as string
    );
    expect(new Set(numbers).size).toBe(5);
    for (const number of numbers) {
      expect(number).toMatch(/^TST-\d{4}$/);
    }
  });
});

test.describe('admission refusals', () => {
  test('answers 409 with no current term and writes nothing', async ({
    api,
    app,
    pool,
    createUser,
    createOrganization,
    createCampus,
  }) => {
    const solo = await createUser();
    const org = await createOrganization(solo, 'No Term School');
    const campus = await createCampus(org, 'Main');
    const arm = (await createClass(app, solo, { campusId: campus.id })).id;

    const res = await api(solo).post('/students').send(body(arm)).expect(409);

    expect(res.body.message).toBe(
      'Set a current term before admitting students.'
    );
    expect(await count(pool, 'student', org.id)).toBe(0);
    await api(solo).get('/admissions/preview').expect(409);
  });

  test('answers 404 for a class outside the campus scope, an archived class and another school’s class', async ({
    api,
    app,
    withPermissions,
    schools: { owner, ownerB, orgA, lekki, ikeja, campusB },
  }) => {
    const clerk = await withPermissions(
      orgA,
      ['student:create', 'student:read', 'guardian:link', 'guardian:create'],
      { campuses: [lekki] }
    );
    const ikejaArm = await ensureClass(app, owner, ikeja.id);
    const retired = await createClass(app, owner, { campusId: lekki.id });
    await api(owner)
      .patch(`/classes/${retired.id}`)
      .send({ archived: true })
      .expect(200);
    const foreign = await ensureClass(app, ownerB, campusB.id);

    for (const arm of [ikejaArm, retired.id, foreign, randomUUID()]) {
      const res = await api(clerk)
        .post('/students')
        .send(body(arm))
        .expect(404);
      expect(res.body.message).toBe('Class not found');
    }
    const preview = await api(clerk).get('/admissions/preview').expect(200);
    expect(
      preview.body.classes.map((option: { id: string }) => option.id)
    ).not.toContain(retired.id);
    expect(
      preview.body.classes.map(
        (option: { campusId: string }) => option.campusId
      )
    ).not.toContain(ikeja.id);
  });

  test('answers 400 over the maximum and 400 for none while a guardian is required', async ({
    api,
    app,
    pool,
    schools: { owner, orgA, lekki },
  }) => {
    const arm = await ensureClass(app, owner, lekki.id);
    await api(owner)
      .patch('/school-settings')
      .send({ maxGuardians: 1 })
      .expect(200);
    const before = await count(pool, 'student', orgA.id);

    const tooMany = await api(owner)
      .post('/students')
      .send(
        body(arm, {
          guardians: [
            emailGuardian('a@example.com', 'A'),
            emailGuardian('b@example.com', 'B'),
          ],
        })
      )
      .expect(400);
    expect(tooMany.body.message).toBe('A student can have at most 1 guardian.');
    const none = await api(owner)
      .post('/students')
      .send(body(arm, { guardians: [] }))
      .expect(400);
    expect(none.body.message).toBe(
      'Add at least one guardian, or switch off “Guardian needed to admit” in Admissions rules.'
    );
    expect(await count(pool, 'student', orgA.id)).toBe(before);

    await api(owner)
      .patch('/school-settings')
      .send({ requireGuardian: false })
      .expect(200);
    await api(owner)
      .post('/students')
      .send(body(arm, { guardians: [] }))
      .expect(201);
  });

  test('answers 403 for each missing permission and writes nothing', async ({
    api,
    app,
    pool,
    withPermissions,
    schools: { owner, orgA, lekki, noPermission },
  }) => {
    const arm = await ensureClass(app, owner, lekki.id);
    const linker = await withPermissions(
      orgA,
      ['student:create', 'student:read', 'guardian:link'],
      { campuses: [lekki] }
    );
    const bare = await withPermissions(
      orgA,
      ['student:create', 'student:read'],
      {
        campuses: [lekki],
      }
    );
    const before = await count(pool, 'student', orgA.id);
    const usersBefore = (await pool.query('SELECT count(*) FROM "user"'))
      .rows[0].count;

    await api(noPermission).post('/students').send(body(arm)).expect(403);
    await api(bare).post('/students').send(body(arm)).expect(403);
    await api(linker).post('/students').send(body(arm)).expect(403);
    expect(await count(pool, 'student', orgA.id)).toBe(before);
    expect(
      (await pool.query('SELECT count(*) FROM "user"')).rows[0].count
    ).toBe(usersBefore);

    await api(bare)
      .post('/students')
      .send(body(arm, { guardians: [] }))
      .expect(400);
  });

  test('answers 400 for the same guardian twice', async ({
    api,
    app,
    schools: { owner, lekki, studentLekki },
  }) => {
    const arm = await ensureClass(app, owner, lekki.id);
    const mine = studentLekki.guardians?.[0]?.guardianId ?? '';
    const twice = await api(owner)
      .post('/students')
      .send(body(arm, { guardians: [link(mine), link(mine)] }))
      .expect(400);
    expect(twice.body.message).toBe('The same guardian is chosen twice.');
  });

  test('rejects a date of birth after today and a blank name', async ({
    api,
    app,
    clock,
    schools: { owner, lekki },
  }) => {
    clock.set('2026-10-11');
    const arm = await ensureClass(app, owner, lekki.id);

    const future = await api(owner)
      .post('/students')
      .send(body(arm, { dateOfBirth: '2026-10-12' }))
      .expect(400);
    expect(future.body.message).toBe(
      'Choose a date of birth on or before today.'
    );
    await api(owner)
      .post('/students')
      .send(body(arm, { firstName: '  ' }))
      .expect(400);
  });
});

test.describe('admission preview and duplicates', () => {
  test('previews the next number without taking it', async ({
    api,
    app,
    schools: { owner, lekki },
  }) => {
    const first = (await api(owner).get('/admissions/preview').expect(200))
      .body;
    const second = (await api(owner).get('/admissions/preview').expect(200))
      .body;

    expect(first).toEqual(second);
    expect(first.nextAdmissionNumber).toBe('TST-0003');
    expect(first.currentSession.name).toBe('2026/2027');
    expect(first.maxGuardians).toBe(4);
    expect(first.requireGuardian).toBe(true);
    const arm = await ensureClass(app, owner, lekki.id);
    expect(first.classes.map((option: { id: string }) => option.id)).toContain(
      arm
    );
    expect(first.classes[0].label).toMatch(/^JSS 1 .+ · (Ikeja|Lekki)$/);

    await api(owner).post('/students').send(body(arm)).expect(201);
    expect(
      (await api(owner).get('/admissions/preview').expect(200)).body
        .nextAdmissionNumber
    ).toBe('TST-0004');
  });

  test('finds archived matches in this school only and hides the id and number out of scope', async ({
    api,
    pool,
    withPermissions,
    schools: { owner, orgA, lekki, studentIkeja, studentLekki },
  }) => {
    const clerk = await withPermissions(
      orgA,
      ['student:create', 'student:read'],
      { campuses: [lekki] }
    );
    await pool.query(
      `UPDATE student SET exit_kind = 'left', exit_reason = 'other',
         archived_at = now(), last_day = '2026-10-01',
         archived_term_id = (SELECT id FROM term WHERE organization_id = $1 AND is_current)
       WHERE id = $2`,
      [orgA.id, studentLekki.id]
    );

    const archived = (
      await api(owner)
        .get(`/admissions/duplicates?${query(studentLekki)}`)
        .expect(200)
    ).body;
    expect(archived.matches).toEqual([
      {
        name: `${studentLekki.firstName} ${studentLekki.lastName}`,
        state: 'Left',
        studentId: studentLekki.id,
        admissionNumber: studentLekki.admissionNumber,
      },
    ]);
    const hidden = (
      await api(clerk)
        .get(`/admissions/duplicates?${query(studentIkeja)}`)
        .expect(200)
    ).body;
    expect(hidden.matches).toEqual([
      {
        name: `${studentIkeja.firstName} ${studentIkeja.lastName}`,
        state: 'Active',
      },
    ]);
    const other = await api(owner)
      .get(
        `/admissions/duplicates?${new URLSearchParams({
          firstName: 'Nobody',
          lastName: 'Here',
          dateOfBirth: '2014-03-03',
        }).toString()}`
      )
      .expect(200);
    expect(other.body.matches).toEqual([]);
  });
});

test.describe('isolation', () => {
  test('case 5: a member without student permissions gets 403 on the preview and the duplicate check', async ({
    api,
    schools: { noPermission, studentLekki },
  }) => {
    await api(noPermission).get('/admissions/preview').expect(403);
    await api(noPermission)
      .get(`/admissions/duplicates?${query(studentLekki)}`)
      .expect(403);
  });

  test('case 6: no session gets 401 on the preview and the duplicate check', async ({
    api,
    schools: { studentLekki },
  }) => {
    await api().get('/admissions/preview').expect(401);
    await api()
      .get(`/admissions/duplicates?${query(studentLekki)}`)
      .expect(401);
    await api().post('/students').send({}).expect(401);
  });

  test('case 7: admitting with another school’s guardian answers 404 and writes nothing', async ({
    api,
    app,
    pool,
    schools: { owner, orgA, lekki, studentB },
  }) => {
    const arm = await ensureClass(app, owner, lekki.id);
    const before = await count(pool, 'student', orgA.id);
    const usersBefore = (await pool.query('SELECT count(*) FROM "user"'))
      .rows[0].count;

    const res = await api(owner)
      .post('/students')
      .send(
        body(arm, {
          guardians: [link(studentB.guardians?.[0]?.guardianId ?? '')],
        })
      )
      .expect(404);

    expect(res.body.message).toBe('Guardian not found');
    expect(await count(pool, 'student', orgA.id)).toBe(before);
    expect(
      (await pool.query('SELECT count(*) FROM "user"')).rows[0].count
    ).toBe(usersBefore);
  });

  test('case 7: the admission number sequence is per school and one school’s admissions never move the other’s', async ({
    api,
    app,
    pool,
    schools: { owner, ownerB, orgA, orgB, lekki, campusB },
  }) => {
    const armA = await ensureClass(app, owner, lekki.id);
    const armB = await ensureClass(app, ownerB, campusB.id);
    const numbers = async (organizationId: string) =>
      (
        await pool.query(
          `SELECT kind, next_value FROM document_sequence WHERE organization_id = $1`,
          [organizationId]
        )
      ).rows;
    const bBefore = await numbers(orgB.id);

    await api(owner).post('/students').send(body(armA)).expect(201);
    await api(owner).post('/students').send(body(armA)).expect(201);

    expect(await numbers(orgB.id)).toEqual(bBefore);
    expect(await numbers(orgA.id)).toEqual([
      { kind: 'admission', next_value: 5 },
    ]);
    const first = await api(ownerB)
      .post('/students')
      .send(body(armB))
      .expect(201);
    expect(first.body.student.admissionNumber).toBe('TST-0002');
    expect(await numbers(orgA.id)).toEqual([
      { kind: 'admission', next_value: 5 },
    ]);
  });
});

test.describe('admission for the next term', () => {
  test('offers the next term in the preview and places the student there, with no class this term', async ({
    api,
    app,
    pool,
    schools: { owner, orgA, lekki },
  }) => {
    const arm = await ensureClass(app, owner, lekki.id);
    const next = await termOf(api, owner, { year: '2026/2027', sequence: 2 });
    const preview = await api(owner).get('/admissions/preview').expect(200);
    expect(preview.body.nextTerm).toEqual({ id: next.id, name: 'Second term' });

    const res = await api(owner)
      .post('/students')
      .send(body(arm, { termId: next.id }))
      .expect(201);

    const { student } = res.body;
    expect(student.currentPlacement).toBeNull();
    expect(student.history).toHaveLength(1);
    expect(student.history[0]).toMatchObject({
      sessionName: '2026/2027',
      isNew: true,
      placements: [{ termName: 'Second term' }],
    });
    expect(student.canMoveForNextTerm).toBe(false);
    const placements = await pool.query(
      `SELECT p.term_id, p.class_arm_id, p.campus_id
       FROM enrollment_placement p
       JOIN student_enrollment e ON e.id = p.enrollment_id
       WHERE e.student_id = $1`,
      [student.id]
    );
    expect(placements.rows).toEqual([
      { term_id: next.id, class_arm_id: arm, campus_id: lekki.id },
    ]);
    const activity = await pool.query(
      `SELECT text FROM activity_event WHERE organization_id = $1 AND subject_id = $2`,
      [orgA.id, student.id]
    );
    expect(activity.rows[0].text).toContain('from Second term');
  });

  test('keeps the placement when that term is made current, and adds none', async ({
    api,
    app,
    pool,
    schools: { owner, lekki },
  }) => {
    const arm = await ensureClass(app, owner, lekki.id);
    const next = await termOf(api, owner, { year: '2026/2027', sequence: 2 });
    const res = await api(owner)
      .post('/students')
      .send(body(arm, { termId: next.id }))
      .expect(201);

    await makeCurrent(api, owner, { year: '2026/2027', sequence: 2 });

    const placements = await pool.query(
      `SELECT p.term_id FROM enrollment_placement p
       JOIN student_enrollment e ON e.id = p.enrollment_id
       WHERE e.student_id = $1`,
      [res.body.student.id]
    );
    expect(placements.rows).toEqual([{ term_id: next.id }]);
    const detail = await api(owner)
      .get(`/students/${res.body.student.id}`)
      .expect(200);
    expect(detail.body.currentPlacement).toMatchObject({ armId: arm });
  });

  test('treats the current term id like no term at all', async ({
    api,
    app,
    schools: { owner, lekki },
  }) => {
    const arm = await ensureClass(app, owner, lekki.id);
    const current = await termOf(api, owner, {
      year: '2026/2027',
      sequence: 1,
    });

    const res = await api(owner)
      .post('/students')
      .send(body(arm, { termId: current.id }))
      .expect(201);

    expect(res.body.student.currentPlacement).toMatchObject({ armId: arm });
  });

  test('answers 400 for the term after next, a past term, another school’s term and a made-up one, and writes nothing', async ({
    api,
    app,
    pool,
    schools: { owner, ownerB, orgA, lekki, campusB },
  }) => {
    const arm = await ensureClass(app, owner, lekki.id);
    await ensureClass(app, ownerB, campusB.id);
    const third = await termOf(api, owner, { year: '2026/2027', sequence: 3 });
    const theirs = await termOf(api, ownerB, {
      year: '2026/2027',
      sequence: 2,
    });
    const before = await count(pool, 'student', orgA.id);

    for (const termId of [third.id, theirs.id, randomUUID()]) {
      const res = await api(owner)
        .post('/students')
        .send(body(arm, { termId }))
        .expect(400);
      expect(res.body.message).toBe(
        'Choose the current term or the next term.'
      );
    }
    await makeCurrent(api, owner, { year: '2026/2027', sequence: 2 });
    const first = await termOf(api, owner, { year: '2026/2027', sequence: 1 });
    await api(owner)
      .post('/students')
      .send(body(arm, { termId: first.id }))
      .expect(400);
    expect(await count(pool, 'student', orgA.id)).toBe(before);
  });

  test('has no next term in the last term of the year, so the preview says null and a term id is refused', async ({
    api,
    app,
    schools: { owner, lekki },
  }) => {
    const arm = await ensureClass(app, owner, lekki.id);
    const third = await termOf(api, owner, { year: '2026/2027', sequence: 3 });
    await makeCurrent(api, owner, { year: '2026/2027', sequence: 3 });

    const preview = await api(owner).get('/admissions/preview').expect(200);

    expect(preview.body.nextTerm).toBeNull();
    await api(owner)
      .post('/students')
      .send(body(arm, { termId: randomUUID() }))
      .expect(400);
    await api(owner)
      .post('/students')
      .send(body(arm, { termId: third.id }))
      .expect(201);
  });
});
