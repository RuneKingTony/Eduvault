import { randomUUID } from 'node:crypto';
import { expect } from './support/base-test';
import { assignClassTeacher } from './support/factories/classes';
import { createStudent, ensureClass } from './support/factories/students';
import { expectSeatsConsistent } from './support/seats';
import { schoolsTest } from './support/two-schools';

const test = schoolsTest;

const firstGuardian = (student: {
  guardians?: { guardianId: string }[];
}): string => student.guardians?.[0]?.guardianId ?? '';

const png = (size = 64) =>
  Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.alloc(size, 7),
  ]);

const usernameGuardian = (fullName: string, phone = '08055556666') => ({
  new: {
    fullName,
    phone,
    address: '1 Test Street',
    relationship: 'mother' as const,
    paysFees: false,
    login: { kind: 'username' as const },
  },
});

const emailGuardian = (
  fullName: string,
  email: string,
  phone = '08077778888'
) => ({
  new: {
    fullName,
    phone,
    address: '1 Test Street',
    relationship: 'father' as const,
    paysFees: false,
    login: { kind: 'email' as const, email },
  },
});

test.describe('linking a new guardian', () => {
  test('numbers usernames across schools: udoh-family, then udoh-family2', async ({
    api,
    schools: { owner, ownerB, studentLekki, studentB },
  }) => {
    const first = await api(owner)
      .post(`/students/${studentLekki.id}/guardians`)
      .send(usernameGuardian('Mrs Udoh'))
      .expect(201);
    const second = await api(ownerB)
      .post(`/students/${studentB.id}/guardians`)
      .send(usernameGuardian('Mr Udoh'))
      .expect(201);

    expect(first.body.login).toMatchObject({
      username: 'udoh-family',
      existing: false,
    });
    expect(first.body.login.temporaryPassword).toHaveLength(12);
    expect(second.body.login.username).toBe('udoh-family2');
    expect(first.body.link).toMatchObject({
      fullName: 'Mrs Udoh',
      loginKind: 'username',
      username: 'udoh-family',
      paysFees: false,
    });
  });

  test('answers 409 for an email already used by a guardian here and creates nothing', async ({
    api,
    pool,
    schools: { owner, studentLekki, studentIkeja },
  }) => {
    await api(owner)
      .post(`/students/${studentLekki.id}/guardians`)
      .send(emailGuardian('Ngozi Okeke', 'ngozi@example.com'))
      .expect(201);
    const users = (await pool.query('SELECT count(*) FROM "user"')).rows[0]
      .count;

    const res = await api(owner)
      .post(`/students/${studentIkeja.id}/guardians`)
      .send(emailGuardian('Other', 'NGOZI@example.com'))
      .expect(409);

    expect(res.body.message).toBe(
      'ngozi@example.com already belongs to Ngozi Okeke. Link the existing guardian instead.'
    );
    expect(
      (await pool.query('SELECT count(*) FROM "user"')).rows[0].count
    ).toBe(users);
  });

  test('links the existing user of another school instead of creating a second one', async ({
    api,
    pool,
    schools: { owner, ownerB, orgA, orgB, studentLekki, studentB },
  }) => {
    await api(ownerB)
      .post(`/students/${studentB.id}/guardians`)
      .send(emailGuardian('Shared Parent', 'shared@example.com'))
      .expect(201);
    const before = await pool.query(
      `SELECT id, (SELECT password FROM account WHERE "userId" = u.id) AS password
       FROM "user" u WHERE email = 'shared@example.com'`
    );

    const res = await api(owner)
      .post(`/students/${studentLekki.id}/guardians`)
      .send(emailGuardian('Shared Parent', 'shared@example.com'))
      .expect(201);

    expect(res.body.login).toMatchObject({ existing: true });
    expect(res.body.login.temporaryPassword).toBeUndefined();
    const users = await pool.query(
      `SELECT id, (SELECT password FROM account WHERE "userId" = u.id) AS password
       FROM "user" u WHERE email = 'shared@example.com'`
    );
    expect(users.rows).toEqual(before.rows);
    const members = await pool.query(
      `SELECT "organizationId", role FROM member WHERE "userId" = $1 ORDER BY role`,
      [before.rows[0].id]
    );
    expect(
      new Set(members.rows.map((row) => `${row.organizationId}:${row.role}`))
    ).toEqual(new Set([`${orgA.id}:guardian`, `${orgB.id}:guardian`]));
    const guardians = await pool.query(
      `SELECT organization_id FROM guardian WHERE user_id = $1`,
      [before.rows[0].id]
    );
    expect(guardians.rows).toHaveLength(2);
  });

  test('adds the guardian role to a staff member with that email, issues no password and refuses to reset their login', async ({
    api,
    pool,
    addMember,
    createUser,
    schools: { owner, orgA, lekki, studentLekki },
  }) => {
    const teacher = await addMember(orgA, await createUser(), {
      roles: ['teacher'],
      campuses: [lekki],
    });

    const res = await api(owner)
      .post(`/students/${studentLekki.id}/guardians`)
      .send(emailGuardian('Teacher Parent', teacher.email))
      .expect(201);

    expect(res.body.login).toMatchObject({ existing: true });
    const member = await pool.query(
      `SELECT role FROM member WHERE "userId" = $1 AND "organizationId" = $2`,
      [teacher.id, orgA.id]
    );
    expect(member.rows[0].role.split(',').toSorted()).toEqual([
      'guardian',
      'teacher',
    ]);
    const reset = await api(owner)
      .post(`/guardians/${res.body.link.guardianId}/reset-login`)
      .expect(409);
    expect(reset.body.message).toContain('also works at the school');
    await api(teacher).get('/me').expect(200);
  });

  test('answers 400 over the maximum, 409 when already linked, and lowering the maximum keeps what is there', async ({
    api,
    schools: { owner, studentLekki },
  }) => {
    const link = (name: string) =>
      api(owner)
        .post(`/students/${studentLekki.id}/guardians`)
        .send(usernameGuardian(name));
    await api(owner)
      .patch('/school-settings')
      .send({ maxGuardians: 2 })
      .expect(200);
    const second = await link('Second Parent').expect(201);
    const over = await link('Third Parent').expect(400);
    expect(over.body.message).toBe('A student can have at most 2 guardians.');

    await api(owner)
      .post(`/students/${studentLekki.id}/guardians`)
      .send({
        existingGuardianId: second.body.link.guardianId,
        relationship: 'father',
      })
      .expect(409);
    await api(owner)
      .patch('/school-settings')
      .send({ maxGuardians: 1 })
      .expect(200);
    const kept = await api(owner)
      .get(`/students/${studentLekki.id}/guardians`)
      .expect(200);
    expect(kept.body).toHaveLength(2);
    await link('Fourth Parent').expect(400);
  });

  test('answers 403 for a new guardian without guardian:create and 404 for a student out of scope', async ({
    api,
    withPermissions,
    schools: { orgA, lekki, studentLekki, studentIkeja },
  }) => {
    const linker = await withPermissions(
      orgA,
      ['student:read', 'guardian:read', 'guardian:link'],
      { campuses: [lekki] }
    );

    await api(linker)
      .post(`/students/${studentLekki.id}/guardians`)
      .send(usernameGuardian('Nope'))
      .expect(403);
    await api(linker)
      .post(`/students/${studentIkeja.id}/guardians`)
      .send(usernameGuardian('Nope'))
      .expect(404);
    await api(linker)
      .post(`/students/${randomUUID()}/guardians`)
      .send(usernameGuardian('Nope'))
      .expect(404);
  });
});

test.describe('payers and unlinking', () => {
  test('keeps one payer, and a last guardian of a student on the roll while one is required', async ({
    api,
    pool,
    schools: { owner, orgA, studentLekki },
  }) => {
    const only = firstGuardian(studentLekki);
    const url = (id: string) => `/students/${studentLekki.id}/guardians/${id}`;

    const untick = await api(owner)
      .patch(url(only))
      .send({ paysFees: false })
      .expect(409);
    expect(untick.body.message).toBe(
      'At least one guardian must pay the school fees.'
    );
    const last = await api(owner).delete(url(only)).expect(409);
    expect(last.body.message).toBe(
      'A student needs at least one guardian. Add another guardian first.'
    );

    const added = await api(owner)
      .post(`/students/${studentLekki.id}/guardians`)
      .send(usernameGuardian('Second Parent'))
      .expect(201);
    const second = added.body.link.guardianId as string;
    const payer = await api(owner).delete(url(only)).expect(409);
    expect(payer.body.message).toBe(
      'At least one guardian must pay the school fees.'
    );
    await api(owner).patch(url(second)).send({ paysFees: true }).expect(200);
    await api(owner).delete(url(only)).expect(200);

    await api(owner).delete(url(second)).expect(409);
    await pool.query(
      `UPDATE student SET exit_kind = 'left', exit_reason = 'other', archived_at = now(),
         archived_term_id = (SELECT id FROM term WHERE organization_id = $2 AND is_current)
       WHERE id = $1`,
      [studentLekki.id, orgA.id]
    );
    await api(owner).delete(url(second)).expect(200);
  });

  test('removes a guardian’s membership with their last child and restores it on re-link', async ({
    api,
    pool,
    schools: { owner, orgA, studentLekki, studentIkeja },
  }) => {
    await api(owner)
      .patch('/school-settings')
      .send({ requireGuardian: false })
      .expect(200);
    const added = await api(owner)
      .post(`/students/${studentLekki.id}/guardians`)
      .send(usernameGuardian('Roving Parent'))
      .expect(201);
    const guardianId = added.body.link.guardianId as string;
    const userOf = async () =>
      (
        await pool.query(`SELECT user_id FROM guardian WHERE id = $1`, [
          guardianId,
        ])
      ).rows[0].user_id as string;
    const roles = async () =>
      (
        await pool.query(
          `SELECT role FROM member WHERE "userId" = $1 AND "organizationId" = $2`,
          [await userOf(), orgA.id]
        )
      ).rows.map((row) => row.role);
    await api(owner)
      .post(`/students/${studentIkeja.id}/guardians`)
      .send({ existingGuardianId: guardianId, relationship: 'mother' })
      .expect(201);

    await api(owner)
      .patch(`/students/${studentLekki.id}/guardians/${guardianId}`)
      .send({ paysFees: false })
      .expect(200);
    await api(owner)
      .delete(`/students/${studentLekki.id}/guardians/${guardianId}`)
      .expect(200);
    expect(await roles()).toEqual(['guardian']);

    await api(owner)
      .delete(`/students/${studentIkeja.id}/guardians/${guardianId}`)
      .expect(200);
    expect(await roles()).toEqual([]);
    await expectSeatsConsistent(pool, orgA.id);
    const unlinked = await pool.query<{ text: string; data: string }>(
      `SELECT text, data::text AS data FROM activity_event
       WHERE kind = 'guardian.unlinked' AND organization_id = $1 ORDER BY occurred_at`,
      [orgA.id]
    );
    expect(unlinked.rows).toHaveLength(2);
    expect(unlinked.rows[0]?.text).toContain('Roving Parent unlinked from');
    expect(unlinked.rows.map((row) => row.data).join(' ')).not.toMatch(/pass/i);
    const guardian = await pool.query(`SELECT 1 FROM guardian WHERE id = $1`, [
      guardianId,
    ]);
    const user = await pool.query(`SELECT 1 FROM "user" WHERE id = $1`, [
      await userOf(),
    ]);
    expect(guardian.rows).toHaveLength(1);
    expect(user.rows).toHaveLength(1);

    await api(owner)
      .post(`/students/${studentLekki.id}/guardians`)
      .send({ existingGuardianId: guardianId, relationship: 'mother' })
      .expect(201);
    expect(await roles()).toEqual(['guardian']);
  });
});

test.describe('resetting a login', () => {
  test('ends sessions, makes the old password fail and flags the account', async ({
    api,
    pool,
    schools: { owner, studentLekki },
  }) => {
    const added = await api(owner)
      .post(`/students/${studentLekki.id}/guardians`)
      .send(usernameGuardian('Lost Password'))
      .expect(201);
    const { username, temporaryPassword } = added.body.login;
    const signedIn = await api()
      .post('/api/auth/sign-in/username')
      .set('x-forwarded-for', '198.51.100.20')
      .send({ username, password: temporaryPassword })
      .expect(200);
    const cookie = (signedIn.headers['set-cookie'] as unknown as string[])
      .map((value) => value.split(';')[0])
      .join('; ');
    await api({ cookie }).get('/api/auth/get-session').expect(200);

    const reset = await api(owner)
      .post(`/guardians/${added.body.link.guardianId}/reset-login`)
      .expect(201);

    expect(reset.body.username).toBe(username);
    expect(reset.body.temporaryPassword).toHaveLength(12);
    expect(reset.body.temporaryPassword).not.toBe(temporaryPassword);
    await api()
      .post('/api/auth/sign-in/username')
      .set('x-forwarded-for', '198.51.100.21')
      .send({ username, password: temporaryPassword })
      .expect(401);
    await api()
      .post('/api/auth/sign-in/username')
      .set('x-forwarded-for', '198.51.100.22')
      .send({ username, password: reset.body.temporaryPassword })
      .expect(200);
    const sessions = await pool.query(
      `SELECT count(*) FROM session WHERE "userId" = (SELECT user_id FROM guardian WHERE id = $1)`,
      [added.body.link.guardianId]
    );
    expect(Number(sessions.rows[0].count)).toBe(1);
    const flagged = await pool.query(
      `SELECT "mustChangePassword" FROM "user" WHERE username = $1`,
      [username]
    );
    expect(flagged.rows[0].mustChangePassword).toBe(true);
    const activity = await pool.query<{ text: string; data: string }>(
      `SELECT text, data::text AS data FROM activity_event WHERE kind = 'guardian.login_reset'`
    );
    expect(activity.rows).toHaveLength(1);
    const [event] = activity.rows;
    expect(event?.text).toBe('Test User reset Lost Password’s login.');
    expect(`${event?.text} ${event?.data}`).not.toContain(
      reset.body.temporaryPassword
    );
  });

  test('answers 409 and keeps the password when the login belongs to another school’s owner', async ({
    api,
    pool,
    schools: { owner, ownerB, studentLekki },
  }) => {
    const passwordOf = async (userId: string) =>
      (
        await pool.query(
          `SELECT password FROM account WHERE "userId" = $1 AND "providerId" = 'credential'`,
          [userId]
        )
      ).rows[0].password;
    const before = await passwordOf(ownerB.id);
    const added = await api(owner)
      .post(`/students/${studentLekki.id}/guardians`)
      .send(emailGuardian('Borrowed Login', ownerB.email))
      .expect(201);

    const reset = await api(owner)
      .post(`/guardians/${added.body.link.guardianId}/reset-login`)
      .expect(409);

    expect(reset.body.message).toContain('outside this school');
    expect(await passwordOf(ownerB.id)).toBe(before);
    await api(ownerB).get('/me').expect(200);
    const events = await pool.query(
      `SELECT 1 FROM activity_event WHERE kind = 'guardian.login_reset'`
    );
    expect(events.rows).toHaveLength(0);
  });

  test('answers 409 and keeps the password when a guardian of another school shares the login', async ({
    api,
    pool,
    schools: { owner, ownerB, studentLekki, studentB },
  }) => {
    const email = `shared-${randomUUID()}@example.com`;
    const theirs = await api(ownerB)
      .post(`/students/${studentB.id}/guardians`)
      .send(emailGuardian('Shared Parent', email))
      .expect(201);
    const added = await api(owner)
      .post(`/students/${studentLekki.id}/guardians`)
      .send(emailGuardian('Shared Parent', email))
      .expect(201);
    expect(added.body.login.existing).toBe(true);
    const passwordOf = async () =>
      (
        await pool.query(
          `SELECT password FROM account WHERE "userId" = (SELECT user_id FROM guardian WHERE id = $1)`,
          [added.body.link.guardianId]
        )
      ).rows[0].password;
    const before = await passwordOf();

    await api(owner)
      .post(`/guardians/${added.body.link.guardianId}/reset-login`)
      .expect(409);
    await api(ownerB)
      .post(`/guardians/${theirs.body.link.guardianId}/reset-login`)
      .expect(409);

    expect(await passwordOf()).toBe(before);
  });

  test('answers 409 and keeps the password when the login is a platform super admin', async ({
    api,
    pool,
    schools: { owner, studentLekki },
  }) => {
    const email = `platform-${randomUUID()}@example.com`;
    const added = await api(owner)
      .post(`/students/${studentLekki.id}/guardians`)
      .send(emailGuardian('Platform Parent', email))
      .expect(201);
    const userId = (
      await pool.query(`SELECT user_id FROM guardian WHERE id = $1`, [
        added.body.link.guardianId,
      ])
    ).rows[0].user_id;
    await pool.query(`UPDATE "user" SET role = 'superadmin' WHERE id = $1`, [
      userId,
    ]);

    const reset = await api(owner)
      .post(`/guardians/${added.body.link.guardianId}/reset-login`)
      .expect(409);

    expect(reset.body.message).toContain('outside this school');
  });

  test('answers 403 without guardian:update and 404 for a guardian out of scope', async ({
    api,
    withPermissions,
    schools: { owner, orgA, lekki, studentLekki, studentIkeja },
  }) => {
    const reader = await withPermissions(
      orgA,
      ['student:read', 'guardian:read'],
      {
        campuses: [lekki],
      }
    );
    const updater = await withPermissions(
      orgA,
      ['student:read', 'guardian:read', 'guardian:update'],
      { campuses: [lekki] }
    );
    const mine = firstGuardian(studentLekki);
    const theirs = firstGuardian(studentIkeja);

    await api(reader).post(`/guardians/${mine}/reset-login`).expect(403);
    await api(updater).post(`/guardians/${theirs}/reset-login`).expect(404);
    await api(owner).post(`/guardians/${mine}/reset-login`).expect(201);
  });
});

test.describe('guardian photos', () => {
  test('checks the size and type, attaches a school’s own file, and refuses another school’s or an attached one', async ({
    api,
    pool,
    schools: { owner, ownerB, studentLekki, studentIkeja },
  }) => {
    const upload = (user: typeof owner, bytes: Buffer) =>
      api(user)
        .post('/files')
        .field('kind', 'guardian_photo')
        .attach('file', bytes, { filename: 'photo.png' });
    const big = await upload(owner, png(1_048_576)).expect(400);
    const text = await upload(owner, Buffer.from('not an image')).expect(400);
    expect(big.body.message).toBe(
      'That photo is over 1 MB. Please choose a smaller one.'
    );
    expect(text.body.message).toBe('Choose a PNG, JPG or WebP photo.');

    const mine = (await upload(owner, png()).expect(201)).body.id as string;
    const theirs = (await upload(ownerB, png()).expect(201)).body.id as string;
    const guardian = firstGuardian(studentLekki);
    const other = firstGuardian(studentIkeja);

    const attached = await api(owner)
      .patch(`/guardians/${guardian}`)
      .send({ photoFileId: mine })
      .expect(200);
    expect(attached.body.photoUrl).toBe(`/files/${mine}`);
    await api(owner).get(`/files/${mine}`).expect(200);
    await api(owner)
      .patch(`/guardians/${guardian}`)
      .send({ photoFileId: theirs })
      .expect(400);
    await api(owner)
      .patch(`/guardians/${other}`)
      .send({ photoFileId: mine })
      .expect(400);

    const removed = await api(owner)
      .patch(`/guardians/${guardian}`)
      .send({ photoFileId: null })
      .expect(200);
    expect(removed.body.photoUrl).toBeNull();
    const gone = await pool.query(`SELECT 1 FROM file_object WHERE id = $1`, [
      mine,
    ]);
    expect(gone.rows).toHaveLength(0);
  });

  test('takes a photo with a new guardian and refuses an unknown file', async ({
    api,
    schools: { owner, studentLekki },
  }) => {
    const photo = (
      await api(owner)
        .post('/files')
        .field('kind', 'guardian_photo')
        .attach('file', png(), { filename: 'photo.png' })
        .expect(201)
    ).body.id as string;

    const added = await api(owner)
      .post(`/students/${studentLekki.id}/guardians`)
      .send({
        new: { ...usernameGuardian('Photo Parent').new, photoFileId: photo },
      })
      .expect(201);
    await api(owner)
      .post(`/students/${studentLekki.id}/guardians`)
      .send({
        new: {
          ...usernameGuardian('Bad Photo').new,
          photoFileId: randomUUID(),
        },
      })
      .expect(400);

    expect(added.body.link.photoUrl).toBe(`/files/${photo}`);
  });

  test('edits the details of a visible guardian and refuses an unknown key', async ({
    api,
    schools: { owner, studentLekki },
  }) => {
    const id = firstGuardian(studentLekki);

    const edited = await api(owner)
      .patch(`/guardians/${id}`)
      .send({
        fullName: ' New Name ',
        phone: '08099990000',
        address: '9 New Road',
      })
      .expect(200);

    expect(edited.body).toMatchObject({
      fullName: 'New Name',
      phone: '08099990000',
      address: '9 New Road',
    });
    await api(owner)
      .patch(`/guardians/${id}`)
      .send({ email: 'x@y.co' })
      .expect(400);
    await api(owner)
      .patch(`/guardians/${id}`)
      .send({ phone: '123' })
      .expect(400);
  });
});

test.describe('guardian visibility', () => {
  test('narrows the list, the profile and the children to the caller’s campuses', async ({
    api,
    app,
    withPermissions,
    schools: { owner, orgA, lekki, ikeja, studentLekki, studentIkeja },
  }) => {
    const sibling = await createStudent(app, owner, {
      campusId: ikeja.id,
      guardians: [
        {
          existingGuardianId: firstGuardian(studentLekki),
          relationship: 'mother',
          paysFees: true,
        },
      ],
    });
    const viewer = await withPermissions(
      orgA,
      ['student:read', 'guardian:read'],
      {
        campuses: [lekki],
      }
    );
    const shared = firstGuardian(studentLekki);
    const ikejaOnly = firstGuardian(studentIkeja);

    const list = (await api(viewer).get('/guardians').expect(200)).body as {
      id: string;
      phone?: string;
      childFirstNames?: string[];
    }[];
    const card = (await api(viewer).get(`/guardians/${shared}`).expect(200))
      .body;
    await api(viewer).get(`/guardians/${ikejaOnly}`).expect(404);
    await api(viewer).get(`/students/${sibling.id}/guardians`).expect(404);

    expect(list.map((row) => row.id)).toEqual([shared]);
    expect(list[0]?.childFirstNames).toEqual([studentLekki.firstName]);
    expect(
      card.children.map((child: { studentId: string }) => child.studentId)
    ).toEqual([studentLekki.id]);
    const owned = (await api(owner).get(`/guardians/${shared}`).expect(200))
      .body;
    expect(owned.children).toHaveLength(2);
  });

  test('narrows guardians by class scope as it narrows students', async ({
    api,
    app,
    withPermissions,
    schools: { owner, lekki, orgA, studentLekki },
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
    const teacher = await withPermissions(
      orgA,
      ['student:read', 'class:read', 'guardian:read'],
      { campuses: [lekki] }
    );
    await assignClassTeacher(app, owner, { classId: mine, userId: teacher.id });

    const list = (await api(teacher).get('/guardians').expect(200)).body as {
      id: string;
    }[];
    await api(teacher)
      .get(`/guardians/${stranger.guardians?.[0]?.guardianId}`)
      .expect(404);

    expect(list.map((row) => row.id)).toEqual([
      studentLekki.guardians?.[0]?.guardianId,
    ]);
  });

  test('offers an out-of-scope guardian by exact phone or email, with the name only, and links him', async ({
    api,
    app,
    withPermissions,
    schools: { owner, orgA, lekki, ikeja, studentLekki },
  }) => {
    const far = await createStudent(app, owner, {
      campusId: ikeja.id,
      guardians: [
        {
          new: {
            fullName: 'Ifeanyi Okeke',
            phone: '0803 111 2222',
            address: '3 Far Road',
            relationship: 'father',
            paysFees: true,
            login: { kind: 'email', email: 'ifeanyi@example.com' },
          },
        },
      ],
    });
    const farGuardian = firstGuardian(far);
    const clerk = await withPermissions(
      orgA,
      ['student:read', 'guardian:read', 'guardian:link'],
      { campuses: [lekki] }
    );
    const search = async (q: string) =>
      (
        await api(clerk)
          .get(`/guardians?q=${encodeURIComponent(q)}`)
          .expect(200)
      ).body;

    expect(await search('Ifeanyi')).toEqual([]);
    expect(await search('0803')).toEqual([]);
    expect(await search('08031112222')).toEqual([
      { id: farGuardian, fullName: 'Ifeanyi Okeke', outsideScope: true },
    ]);
    expect(await search('IFEANYI@example.com')).toEqual([
      { id: farGuardian, fullName: 'Ifeanyi Okeke', outsideScope: true },
    ]);
    const excluded = await api(clerk)
      .get(`/guardians?q=08031112222&excludeStudentId=${studentLekki.id}`)
      .expect(200);
    expect(excluded.body).toHaveLength(1);

    const linked = await api(clerk)
      .post(`/students/${studentLekki.id}/guardians`)
      .send({ existingGuardianId: farGuardian, relationship: 'father' })
      .expect(201);
    expect(linked.body.link.fullName).toBe('Ifeanyi Okeke');
    await api(clerk).get(`/guardians?excludeStudentId=${far.id}`).expect(404);
  });
});

test.describe('guardian contact data', () => {
  test('needs guardian:read on top of link and update, because the answers carry phone, email and address', async ({
    api,
    withPermissions,
    schools: { owner, orgA, studentLekki, studentIkeja },
  }) => {
    const writer = await withPermissions(orgA, [
      'student:read',
      'guardian:create',
      'guardian:link',
      'guardian:update',
    ]);
    const mine = firstGuardian(studentLekki);
    const other = firstGuardian(studentIkeja);

    await api(writer)
      .post(`/students/${studentLekki.id}/guardians`)
      .send({ existingGuardianId: other, relationship: 'father' })
      .expect(403);
    await api(writer)
      .post(`/students/${studentLekki.id}/guardians`)
      .send(usernameGuardian('Hidden Parent'))
      .expect(403);
    await api(writer)
      .patch(`/students/${studentLekki.id}/guardians/${mine}`)
      .send({ paysFees: true })
      .expect(403);
    await api(writer)
      .patch(`/guardians/${mine}`)
      .send({ phone: '08099990000' })
      .expect(403);

    const links = (
      await api(owner).get(`/students/${studentLekki.id}/guardians`).expect(200)
    ).body;
    expect(links).toHaveLength(1);
    expect(links[0].phone).not.toBe('08099990000');
  });
});

test.describe('isolation', () => {
  test('case 5: a member without guardian permissions gets 403 on every guardian route', async ({
    api,
    schools: { noPermission, studentLekki },
  }) => {
    const student = `/students/${studentLekki.id}`;
    const guardianId = firstGuardian(studentLekki);

    await api(noPermission).get('/guardians').expect(403);
    await api(noPermission).get(`/guardians/${guardianId}`).expect(403);
    await api(noPermission).get(`${student}/guardians`).expect(403);
    await api(noPermission)
      .post(`${student}/guardians`)
      .send(usernameGuardian('Nope'))
      .expect(403);
    await api(noPermission)
      .patch(`${student}/guardians/${guardianId}`)
      .send({ paysFees: true })
      .expect(403);
    await api(noPermission)
      .delete(`${student}/guardians/${guardianId}`)
      .expect(403);
    await api(noPermission)
      .patch(`/guardians/${guardianId}`)
      .send({ phone: '08099990000' })
      .expect(403);
    await api(noPermission)
      .post(`/guardians/${guardianId}/reset-login`)
      .expect(403);
  });

  test('case 6: no session gets 401 on every guardian route', async ({
    api,
    schools: { studentLekki },
  }) => {
    const student = `/students/${studentLekki.id}`;
    const guardianId = firstGuardian(studentLekki);

    await api().get('/guardians').expect(401);
    await api().get(`/guardians/${guardianId}`).expect(401);
    await api().get(`${student}/guardians`).expect(401);
    await api()
      .post(`${student}/guardians`)
      .send(usernameGuardian('Nope'))
      .expect(401);
    await api()
      .patch(`${student}/guardians/${guardianId}`)
      .send({ paysFees: true })
      .expect(401);
    await api().delete(`${student}/guardians/${guardianId}`).expect(401);
    await api()
      .patch(`/guardians/${guardianId}`)
      .send({ phone: '08099990000' })
      .expect(401);
    await api().post(`/guardians/${guardianId}/reset-login`).expect(401);
  });

  test('case 7: linking another school’s guardian to a student answers 404 and links nothing', async ({
    api,
    pool,
    schools: { owner, orgA, studentLekki, studentB },
  }) => {
    const before = await pool.query(
      `SELECT count(*) FROM guardian_student WHERE organization_id = $1`,
      [orgA.id]
    );

    const res = await api(owner)
      .post(`/students/${studentLekki.id}/guardians`)
      .send({
        existingGuardianId: firstGuardian(studentB),
        relationship: 'father',
      })
      .expect(404);

    expect(res.body.message).toBe('Guardian not found');
    const after = await pool.query(
      `SELECT count(*) FROM guardian_student WHERE organization_id = $1`,
      [orgA.id]
    );
    expect(after.rows[0].count).toBe(before.rows[0].count);
    const member = await pool.query(
      `SELECT 1 FROM member WHERE "organizationId" = $1 AND "userId" = (SELECT user_id FROM guardian WHERE id = $2)`,
      [orgA.id, firstGuardian(studentB)]
    );
    expect(member.rows).toHaveLength(0);
  });
});
