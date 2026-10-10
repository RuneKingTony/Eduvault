import { expect } from './support/base-test';
import { schoolsTest } from './support/two-schools';

const test = schoolsTest;

const names = (rows: { name: string }[]) => rows.map((row) => row.name);

const FEE = { name: 'Tuition', amountMinor: 10_000, currency: 'NGN' };

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
    expect(ikeja.counts).toEqual({ classes: 0, students: 0, staff: 1 });
    expect(lekkiCard.principals).toEqual([
      { userId: principal.id, name: 'Test User' },
    ]);
    expect(lekkiCard.counts).toEqual({ classes: 0, students: 0, staff: 3 });
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

  test('answers 409 while a fee schedule references it and keeps the team', async ({
    api,
    createCampus,
    schools: { owner, orgA },
  }) => {
    const annex = await createCampus(orgA, 'Annex');
    await api(owner)
      .post('/fee-schedules')
      .send({ ...FEE, campusId: annex.id })
      .expect(201);

    await api(owner).delete(`/campuses/${annex.id}`).expect(409);
    await api(owner).get(`/campuses/${annex.id}`).expect(200);
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
});
