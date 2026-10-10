import { readFileSync } from 'node:fs';
import { acting, expect } from './support/base-test';
import { schoolsTest } from './support/two-schools';

const test = schoolsTest;

const MIGRATION = readFileSync(
  new URL(
    '../db/migrations/20261010120000_school_settings_and_files.sql',
    import.meta.url
  ),
  'utf8'
);

const statement = (start: string): string => {
  const begin = MIGRATION.indexOf(start);
  return MIGRATION.slice(begin, MIGRATION.indexOf(';', begin) + 1);
};

const REASON = 'SUP-3001 fix the school phone';

test.describe('reading', () => {
  test('any member reads the profile and the rules', async ({
    api,
    schools: { orgA, lekkiOnly, noPermission },
  }) => {
    for (const user of [lekkiOnly, noPermission]) {
      const profile = await api(user).get('/school-account').expect(200);
      expect(profile.body).toMatchObject({
        organizationId: orgA.id,
        currency: 'NGN',
        logoFileId: null,
        logoUrl: null,
      });
      const rules = await api(user).get('/school-settings').expect(200);
      expect(rules.body).toEqual({ maxGuardians: 4, requireGuardian: true });
    }
  });
});

test.describe('writing', () => {
  test('is refused without schoolAccount:update', async ({
    api,
    schools: { lekkiOnly, noPermission },
  }) => {
    for (const user of [lekkiOnly, noPermission]) {
      await api(user).patch('/school-account').send({ name: 'x' }).expect(403);
      await api(user)
        .put('/school-account/logo')
        .send({ fileId: crypto.randomUUID() })
        .expect(403);
      await api(user).delete('/school-account/logo').expect(403);
      await api(user)
        .patch('/school-settings')
        .send({ maxGuardians: 3 })
        .expect(403);
    }
  });

  test('is refused to an acting super admin until a reason is given', async ({
    api,
    createUser,
    makeSuperAdmin,
    schools: { orgA },
  }) => {
    const admin = await makeSuperAdmin(await createUser());

    for (const [path, body] of [
      ['/school-account', { phone: '0801' }],
      ['/school-settings', { maxGuardians: 2 }],
    ] as const) {
      const refused = await api(admin)
        .patch(path)
        .set(acting(orgA.id))
        .send(body)
        .expect(403);
      expect(refused.body.code).toBe('ActingReadOnly');
      await api(admin)
        .patch(path)
        .set(acting(orgA.id, REASON))
        .send(body)
        .expect(200);
    }
  });

  test('saves the profile, records who changed it and renames the organization', async ({
    api,
    pool,
    schools: { owner, orgA },
  }) => {
    const res = await api(owner)
      .patch('/school-account')
      .send({
        name: '  Greenfield College ',
        address: '1 Palm Road',
        city: 'Lagos',
        phone: '08012345678',
        email: 'info@greenfield.ng',
      })
      .expect(200);

    expect(res.body).toMatchObject({
      name: 'Greenfield College',
      address: '1 Palm Road',
      city: 'Lagos',
      phone: '08012345678',
      email: 'info@greenfield.ng',
    });
    const account = await pool.query(
      `SELECT updated_by FROM school_account WHERE organization_id = $1`,
      [orgA.id]
    );
    expect(account.rows[0].updated_by).toBe(owner.id);
    const organization = await pool.query(
      `SELECT name FROM organization WHERE id = $1`,
      [orgA.id]
    );
    expect(organization.rows[0].name).toBe('Greenfield College');
  });

  test('refuses an empty name and a bad email', async ({
    api,
    schools: { owner },
  }) => {
    await api(owner).patch('/school-account').send({ name: ' ' }).expect(400);
    await api(owner)
      .patch('/school-account')
      .send({ email: 'not-an-email' })
      .expect(400);
  });

  test('never changes the currency', async ({
    api,
    pool,
    schools: { owner, orgA },
  }) => {
    await api(owner)
      .patch('/school-account')
      .send({ currency: 'USD', name: 'Changed' })
      .expect(400);
    await api(owner).patch('/school-account').send({ phone: '1' }).expect(200);

    const { rows } = await pool.query(
      `SELECT currency, name FROM school_account WHERE organization_id = $1`,
      [orgA.id]
    );
    expect(rows[0].currency).toBe('NGN');
    expect(rows[0].name).not.toBe('Changed');
  });
});

test.describe('admissions rules', () => {
  test('save the guardian limit and whether one is needed', async ({
    api,
    pool,
    schools: { owner, orgA },
  }) => {
    const res = await api(owner)
      .patch('/school-settings')
      .send({ maxGuardians: 3, requireGuardian: false })
      .expect(200);

    expect(res.body).toEqual({ maxGuardians: 3, requireGuardian: false });
    expect((await api(owner).get('/school-settings').expect(200)).body).toEqual(
      res.body
    );
    const { rows } = await pool.query(
      `SELECT updated_by FROM school_setting WHERE organization_id = $1`,
      [orgA.id]
    );
    expect(rows[0].updated_by).toBe(owner.id);
  });

  test('answer 400 outside 1 to 6 and the database check agrees', async ({
    api,
    pool,
    schools: { owner, orgA },
  }) => {
    for (const maxGuardians of [0, 7]) {
      const res = await api(owner)
        .patch('/school-settings')
        .send({ maxGuardians })
        .expect(400);
      expect(res.body.issues[0].message).toBe('Choose a number from 1 to 6.');
    }
    await expect(
      pool.query(
        `UPDATE school_setting SET max_guardians = 7 WHERE organization_id = $1`,
        [orgA.id]
      )
    ).rejects.toThrow(/school_setting_max_guardians_check/);
  });
});

test.describe('a new school', () => {
  test('created through the platform gets its settings row', async ({
    pool,
    createUser,
    makeSuperAdmin,
    createSchoolViaPlatform,
  }) => {
    const admin = await makeSuperAdmin(await createUser());
    const school = await createSchoolViaPlatform(admin, {
      ownerEmail: 'owner@settings.test',
    });

    const { rows } = await pool.query(
      `SELECT max_guardians, require_guardian FROM school_setting
       WHERE organization_id = $1`,
      [school.school.id]
    );
    expect(rows).toEqual([{ max_guardians: 4, require_guardian: true }]);
  });

  test('the migration backfill adds a settings row and an account for a school with neither', async ({
    pool,
  }) => {
    await pool.query(
      `INSERT INTO organization (id, name, slug, "createdAt")
       VALUES ('legacy-school', 'Legacy Academy', 'legacy-academy', now())`
    );

    await pool.query(statement('INSERT INTO school_account'));
    await pool.query(statement('INSERT INTO school_setting'));
    await pool.query(statement('INSERT INTO school_account'));
    await pool.query(statement('INSERT INTO school_setting'));

    const account = await pool.query(
      `SELECT name, currency, admission_prefix FROM school_account
       WHERE organization_id = 'legacy-school'`
    );
    expect(account.rows).toEqual([
      { name: 'Legacy Academy', currency: 'NGN', admission_prefix: 'LEG' },
    ]);
    const settings = await pool.query(
      `SELECT max_guardians FROM school_setting WHERE organization_id = 'legacy-school'`
    );
    expect(settings.rows).toEqual([{ max_guardians: 4 }]);
  });
});
