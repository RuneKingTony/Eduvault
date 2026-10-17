import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect } from './support/base-test';
import { createAnnouncement } from './support/factories/announcements';
import { createClass } from './support/factories/classes';
import { createFeeLine, feeFixture } from './support/factories/fees';
import { bankAccount } from './support/factories/payments';
import { createItem, openStock, receive } from './support/factories/store';
import { schoolsTest } from './support/two-schools';

const test = schoolsTest;

const storesOf = async (
  pool: {
    query: (sql: string, values: string[]) => Promise<{ rows: unknown[] }>;
  },
  campusId: string
) =>
  (await pool.query('SELECT name FROM store WHERE campus_id = $1', [campusId]))
    .rows;

const names = (rows: { name: string }[]) => rows.map((row) => row.name);

test.describe('campus summary', () => {
  test('answers 403 without team:read while GET /campuses still answers', async ({
    api,
    schools: { lekkiOnly, noPermission },
  }) => {
    for (const user of [lekkiOnly, noPermission]) {
      const res = await api(user).get('/campuses/summary').expect(403);
      expect(res.body.message).toBe('Missing permission team:read');
    }
    expect(
      names((await api(lekkiOnly).get('/campuses').expect(200)).body)
    ).toEqual(['Lekki']);
  });

  test('lists every campus by name for the owner with its principals and counts', async ({
    api,
    createUser,
    addMember,
    schools: { owner, orgA, lekki },
  }) => {
    const principal = await addMember(orgA, await createUser(), {
      roles: ['principal'],
      campuses: [lekki],
    });

    const body = (await api(owner).get('/campuses/summary').expect(200)).body;

    expect(names(body)).toEqual(['Ikeja', 'Lekki']);
    const [ikeja, lekkiCard] = body;
    expect(ikeja.principals).toEqual([]);
    expect(ikeja.counts).toEqual({ classes: 1, students: 1, staff: 1 });
    expect(lekkiCard.principals).toEqual([
      { userId: principal.id, name: 'Test User' },
    ]);
    expect(lekkiCard.counts).toEqual({ classes: 1, students: 1, staff: 3 });
  });

  test('counts only the active classes of each campus', async ({
    api,
    app,
    schools: { owner, lekki, ikeja },
  }) => {
    const gold = await createClass(app, owner, { campusId: lekki.id });
    await createClass(app, owner, { campusId: lekki.id });
    await createClass(app, owner, { campusId: ikeja.id });
    await api(owner)
      .patch(`/classes/${gold.id}`)
      .send({ archived: true })
      .expect(200);

    const body = (await api(owner).get('/campuses/summary').expect(200)).body;

    expect(
      body.map((card: { name: string; counts: { classes: number } }) => [
        card.name,
        card.counts.classes,
      ])
    ).toEqual([
      ['Ikeja', 2],
      ['Lekki', 2],
    ]);
  });

  test('limits the summary and the list to the caller’s campuses', async ({
    api,
    withPermissions,
    schools: { orgA, lekki },
  }) => {
    const reader = await withPermissions(orgA, ['team:read'], {
      campuses: [lekki],
    });

    const summary = (await api(reader).get('/campuses/summary').expect(200))
      .body;
    const list = (await api(reader).get('/campuses').expect(200)).body;

    expect(names(summary)).toEqual(['Lekki']);
    expect(names(list)).toEqual(['Lekki']);
  });
});

test.describe('campus names', () => {
  test('refuse a name that differs only in case, on create and on rename', async ({
    api,
    schools: { owner, ikeja },
  }) => {
    const created = await api(owner)
      .post('/campuses')
      .send({ name: 'LEKKI' })
      .expect(409);
    expect(created.body.message).toBe('LEKKI already exists.');

    const renamed = await api(owner)
      .patch(`/campuses/${ikeja.id}`)
      .send({ name: 'lekki' })
      .expect(409);
    expect(renamed.body.message).toBe('lekki already exists.');
    expect((await api(owner).get(`/campuses/${ikeja.id}`)).body.name).toBe(
      'Ikeja'
    );
  });

  test('let a campus change the case of its own name', async ({
    api,
    schools: { owner, lekki },
  }) => {
    const res = await api(owner)
      .patch(`/campuses/${lekki.id}`)
      .send({ name: 'LEKKI' })
      .expect(200);
    expect(res.body.name).toBe('LEKKI');
  });

  test('are also checked when Better Auth’s own team routes are called', async ({
    api,
    schools: { owner, orgA, ikeja },
  }) => {
    await api(owner)
      .post('/api/auth/organization/create-team')
      .send({ name: 'lekki', organizationId: orgA.id })
      .expect(409);
    await api(owner)
      .post('/api/auth/organization/update-team')
      .send({ teamId: ikeja.id, data: { name: 'LEKKI' } })
      .expect(409);
  });
});

test.describe('creating a campus', () => {
  test('enrols the creator in the new team', async ({
    api,
    pool,
    schools: { owner },
  }) => {
    const res = await api(owner)
      .post('/campuses')
      .send({ name: 'Ajah', address: '22 Addo Road, Ajah' })
      .expect(201);

    expect(res.body).toMatchObject({
      name: 'Ajah',
      address: '22 Addo Road, Ajah',
    });
    const { rows } = await pool.query(
      `SELECT 1 FROM "teamMember" WHERE "teamId" = $1 AND "userId" = $2`,
      [res.body.id, owner.id]
    );
    expect(rows).toHaveLength(1);
  });

  test('removes the team again when the campus row cannot be written', async ({
    api,
    pool,
    schools: { owner },
  }) => {
    await pool.query(`
      CREATE FUNCTION fail_campus_insert() RETURNS trigger AS $$
      BEGIN RAISE EXCEPTION 'campus insert refused'; END
      $$ LANGUAGE plpgsql`);
    await pool.query(`
      CREATE TRIGGER fail_campus_insert BEFORE INSERT ON campus
      FOR EACH ROW EXECUTE FUNCTION fail_campus_insert()`);
    try {
      const res = await api(owner).post('/campuses').send({ name: 'Ajah' });
      expect(res.status).toBeGreaterThanOrEqual(500);
    } finally {
      await pool.query(`DROP TRIGGER fail_campus_insert ON campus`);
      await pool.query(`DROP FUNCTION fail_campus_insert()`);
    }

    const { rows } = await pool.query(
      `SELECT 1 FROM team WHERE lower(name) = 'ajah'`
    );
    expect(rows).toHaveLength(0);
  });
});

test.describe('a campus store', () => {
  test('is created with every new campus, named after it', async ({
    api,
    pool,
    schools: { owner },
  }) => {
    const res = await api(owner)
      .post('/campuses')
      .send({ name: 'Ajah' })
      .expect(201);

    expect(await storesOf(pool, res.body.id)).toEqual([
      { name: 'Ajah campus store' },
    ]);
  });

  test('is given to a campus that had none by the migration backfill', async ({
    pool,
    schools: { lekki, ikeja },
  }) => {
    await pool.query('DELETE FROM store');
    const migration = readFileSync(
      join(
        import.meta.dirname,
        '../db/migrations/20261017090200_create_store_items_and_deliveries.sql'
      ),
      'utf8'
    );
    const backfill = /INSERT INTO store[^;]*;/.exec(migration)?.[0];

    await pool.query(backfill ?? 'SELECT 1/0');

    expect(await storesOf(pool, lekki.id)).toEqual([
      { name: 'Lekki campus store' },
    ]);
    expect(await storesOf(pool, ikeja.id)).toEqual([
      { name: 'Ikeja campus store' },
    ]);
  });

  test('keeps the name it was given when the campus is renamed', async ({
    api,
    pool,
    schools: { owner, lekki },
  }) => {
    await api(owner)
      .patch(`/campuses/${lekki.id}`)
      .send({ name: 'Lekki Phase 1' })
      .expect(200);

    expect(await storesOf(pool, lekki.id)).toEqual([
      { name: 'Lekki campus store' },
    ]);
  });
});

test.describe('deleting a campus', () => {
  test('answers 409 while a student references it and keeps the team', async ({
    api,
    schools: { owner, lekki },
  }) => {
    const res = await api(owner).delete(`/campuses/${lekki.id}`).expect(409);

    expect(res.body.message).toBe(
      'This campus still has classes, students or money records, so it can’t be deleted.'
    );
    await api(owner).get(`/campuses/${lekki.id}`).expect(200);
  });

  test('answers the in-use message while an announcement references it, even a withdrawn one', async ({
    api,
    app,
    createCampus,
    schools: { owner, orgA },
  }) => {
    const annex = await createCampus(orgA, 'Annex');
    const item = await createAnnouncement(app, owner, { campusId: annex.id });
    const blocked = await api(owner)
      .delete(`/campuses/${annex.id}`)
      .expect(409);
    expect(blocked.body.message).toBe(
      'This campus still has classes, students or money records, so it can’t be deleted.'
    );

    await api(owner).post(`/announcements/${item.id}/withdraw`).expect(201);
    await api(owner).delete(`/campuses/${annex.id}`).expect(409);
    await api(owner).get(`/campuses/${annex.id}`).expect(200);
  });

  test('answers 409 while a class references it, even an archived one, and keeps the team', async ({
    api,
    app,
    createCampus,
    schools: { owner, orgA },
  }) => {
    const annex = await createCampus(orgA, 'Annex');
    const arm = await createClass(app, owner, { campusId: annex.id });
    await api(owner).delete(`/campuses/${annex.id}`).expect(409);

    await api(owner)
      .patch(`/classes/${arm.id}`)
      .send({ archived: true })
      .expect(200);
    await api(owner).delete(`/campuses/${annex.id}`).expect(409);
    await api(owner).get(`/campuses/${annex.id}`).expect(200);
  });

  test('answers 409 while a fee line references it and keeps the team', async ({
    api,
    app,
    createCampus,
    schools: { owner, orgA },
  }) => {
    const annex = await createCampus(orgA, 'Annex');
    const fixture = await feeFixture(app, api, owner);
    const line = await createFeeLine({ app, actor: owner }, fixture, {
      name: 'Annex tuition',
      amountMinor: 10_000,
      campusId: annex.id,
    });

    await api(owner).delete(`/campuses/${annex.id}`).expect(409);
    await api(owner).get(`/campuses/${annex.id}`).expect(200);

    await api(owner).post(`/fee-lines/${line.id}/retire`).expect(201);
    await api(owner).delete(`/campuses/${annex.id}`).expect(409);
  });

  test('removes a campus nothing references', async ({
    api,
    createCampus,
    schools: { owner, orgA },
  }) => {
    const annex = await createCampus(orgA, 'Annex');

    await api(owner).delete(`/campuses/${annex.id}`).expect(200);
    await api(owner).get(`/campuses/${annex.id}`).expect(404);
  });

  test('removes a campus with only an empty store, and the store goes with it', async ({
    api,
    createCampus,
    pool,
    schools: { owner, orgA },
  }) => {
    const annex = await createCampus(orgA, 'Annex');
    const before = await pool.query(
      'SELECT 1 FROM store WHERE campus_id = $1',
      [annex.id]
    );
    expect(before.rows).toHaveLength(1);

    await api(owner).delete(`/campuses/${annex.id}`).expect(200);

    const after = await pool.query('SELECT 1 FROM store WHERE campus_id = $1', [
      annex.id,
    ]);
    expect(after.rows).toHaveLength(0);
  });

  test('answers 409 while its store has a delivery and keeps the team and the store', async ({
    api,
    app,
    createCampus,
    pool,
    schools: { owner, orgA },
  }) => {
    const annex = await createCampus(orgA, 'Annex');
    const shirt = await createItem(api, owner);
    await openStock(api, owner, {
      campusId: annex.id,
      lines: [{ itemId: shirt.id, quantity: 4, unitCostMinor: 350_000 }],
    });
    const bank = await bankAccount(app, owner);
    await receive(api, owner, {
      campusId: annex.id,
      accountId: bank.id,
      lines: [{ itemId: shirt.id, quantity: 2, unitCostMinor: 350_000 }],
    });

    const res = await api(owner).delete(`/campuses/${annex.id}`).expect(409);

    expect(res.body.message).toBe(
      'This campus still has classes, students or money records, so it can’t be deleted.'
    );
    await api(owner).get(`/campuses/${annex.id}`).expect(200);
    const stores = await pool.query(
      'SELECT 1 FROM store WHERE campus_id = $1',
      [annex.id]
    );
    expect(stores.rows).toHaveLength(1);
  });
});
