import type { Test } from 'supertest';
import type {
  CreatedSchoolYear,
  DayOffEntry,
  SchoolYear,
  SchoolYearList,
  Term,
} from '@eduvault/api-contract';
import {
  acting,
  baseTest,
  expect,
  type Fixtures,
  type TestUser,
} from './support/base-test';
import {
  YEAR_2026,
  YEAR_2027,
  createSchoolYear,
} from './support/factories/calendar';
import { twoSchools, type TwoSchools } from './support/two-schools';

const test = baseTest.extend<{ schools: TwoSchools }>({
  schools: async (
    { app, createUser, createOrganization, createCampus, addMember },
    use
  ) => {
    await use(
      await twoSchools({
        app,
        createUser,
        createOrganization,
        createCampus,
        addMember,
      })
    );
  },
});

const TODAY = '2026-10-07';

type Api = Fixtures['api'];

const termOf = (
  year: SchoolYear | CreatedSchoolYear,
  sequence: number
): Term => {
  const term = year.terms.find((candidate) => candidate.sequence === sequence);
  if (term === undefined) {
    throw new Error(`no term ${sequence}`);
  }
  return term;
};

test.describe('create', () => {
  test('2027/2028 gets three terms on the PRD dates and a first year makes First term current', async ({
    api,
    clock,
    schools: { owner },
  }) => {
    clock.set(TODAY);
    const res = await api(owner)
      .post('/school-years')
      .send(YEAR_2027)
      .expect(201);
    const year = res.body as CreatedSchoolYear;
    expect(year.madeCurrent).toBe(true);
    expect(
      year.terms.map((term) => [term.name, term.startsOn, term.endsOn])
    ).toEqual([
      ['First term', '2027-09-06', '2027-12-10'],
      ['Second term', '2028-01-03', '2028-03-31'],
      ['Third term', '2028-04-24', '2028-07-28'],
    ]);
    expect(year.terms.map((term) => term.isCurrent)).toEqual([
      true,
      false,
      false,
    ]);
  });

  test('a second year leaves the current term where it is', async ({
    api,
    clock,
    schools: { owner, orgA, owner: actor },
    app,
  }) => {
    clock.set(TODAY);
    const first = await createSchoolYear(app, actor, YEAR_2026);
    const second = (
      await api(owner).post('/school-years').send(YEAR_2027).expect(201)
    ).body as CreatedSchoolYear;
    expect(second.madeCurrent).toBe(false);
    const list = (await api(owner).get('/school-years').expect(200))
      .body as SchoolYearList;
    expect(list.total).toBe(2);
    expect(list.items.map((year) => year.name)).toEqual([
      '2027/2028',
      '2026/2027',
    ]);
    expect(termOf(list.items[1]!, 1).isCurrent).toBe(true);
    expect(first.id).toBe(list.items[1]?.id);
    expect(orgA.id).toBeDefined();
  });

  test('refuses bad names, dates and lengths with the PRD copy', async ({
    api,
    schools: { owner },
  }) => {
    const nameMessage =
      'Write the year as two years in a row, for example 2028/2029.';
    for (const name of ['2027/2029', '27/28', '2027/2028 and then some']) {
      const res = await api(owner)
        .post('/school-years')
        .send({ ...YEAR_2027, name })
        .expect(400);
      expect(res.body.message).toBe(nameMessage);
    }
    const reversed = await api(owner)
      .post('/school-years')
      .send({ ...YEAR_2027, endsOn: '2027-09-06' })
      .expect(400);
    expect(reversed.body.message).toBe(
      'Choose valid dates: the end must be after the start.'
    );
    const short = await api(owner)
      .post('/school-years')
      .send({ ...YEAR_2027, endsOn: '2027-11-28' })
      .expect(400);
    expect(short.body.message).toBe('A school year needs at least 12 weeks.');
  });

  test('answers 409 for a duplicate name and for overlapping dates', async ({
    api,
    clock,
    app,
    schools: { owner },
  }) => {
    clock.set(TODAY);
    await createSchoolYear(app, owner, YEAR_2026);
    const duplicate = await api(owner)
      .post('/school-years')
      .send(YEAR_2026)
      .expect(409);
    expect(duplicate.body.message).toBe('2026/2027 already exists.');
    const overlap = await api(owner)
      .post('/school-years')
      .send({ ...YEAR_2027, startsOn: '2027-07-01' })
      .expect(409);
    expect(overlap.body.message).toBe(
      'These dates overlap another school year.'
    );
  });
});

test.describe('database constraints', () => {
  test('refuse a duplicate name, an overlapping year, a second current term and a taken date', async ({
    pool,
    app,
    clock,
    schools: { owner, orgA },
  }) => {
    clock.set(TODAY);
    const year = await createSchoolYear(app, owner, YEAR_2026);
    const insertYear = (name: string, startsOn: string, endsOn: string) =>
      pool.query(
        `INSERT INTO academic_session (organization_id, name, starts_on, ends_on)
         VALUES ($1, $2, $3, $4)`,
        [orgA.id, name, startsOn, endsOn]
      );
    await expect(
      insertYear('2026/2027', '2030-09-01', '2031-07-31')
    ).rejects.toMatchObject({ code: '23505' });
    await expect(
      insertYear('2029/2030', '2027-07-01', '2028-07-28')
    ).rejects.toMatchObject({
      code: '23P01',
      constraint: 'academic_session_no_overlap',
    });
    await expect(
      insertYear('2029/2030', '2030-09-01', '2030-11-01')
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      pool.query(`UPDATE term SET is_current = TRUE WHERE id = $1`, [
        termOf(year, 2).id,
      ])
    ).rejects.toMatchObject({ code: '23505', constraint: 'term_one_current' });
    await pool.query(
      `INSERT INTO school_holiday (organization_id, term_id, date, name)
       VALUES ($1, $2, '2026-10-01', 'Independence Day')`,
      [orgA.id, termOf(year, 1).id]
    );
    await expect(
      pool.query(
        `INSERT INTO school_holiday (organization_id, term_id, date, name)
         VALUES ($1, $2, '2026-10-01', 'Again')`,
        [orgA.id, termOf(year, 1).id]
      )
    ).rejects.toMatchObject({ code: '23505' });
  });
});

test.describe('make current', () => {
  test('moves within the year and onto next year’s first term only', async ({
    api,
    clock,
    app,
    schools: { owner },
  }) => {
    clock.set(TODAY);
    const year = await createSchoolYear(app, owner, YEAR_2026);
    const next = await createSchoolYear(app, owner, YEAR_2027);
    const second = (
      await api(owner)
        .post(`/terms/${termOf(year, 2).id}/make-current`)
        .expect(200)
    ).body as Term;
    expect(second.isCurrent).toBe(true);

    const refused = await api(owner)
      .post(`/terms/${termOf(next, 2).id}/make-current`)
      .expect(409);
    expect(refused.body.message).toBe(
      'Only a term of this school year, or the first term of the next one, can be made current.'
    );
    await api(owner)
      .post(`/terms/${termOf(next, 3).id}/make-current`)
      .expect(409);
    const first = (
      await api(owner)
        .post(`/terms/${termOf(next, 1).id}/make-current`)
        .expect(200)
    ).body as Term;
    expect(first).toMatchObject({ isCurrent: true, schoolYearId: next.id });
    const list = (await api(owner).get('/school-years').expect(200))
      .body as SchoolYearList;
    const currents = list.items.flatMap((item) =>
      item.terms.filter((term) => term.isCurrent)
    );
    expect(currents).toHaveLength(1);
  });

  test('two concurrent calls leave exactly one current term', async ({
    api,
    clock,
    app,
    pool,
    schools: { owner, orgA },
  }) => {
    clock.set(TODAY);
    const year = await createSchoolYear(app, owner, YEAR_2026);
    const results = await Promise.all([
      api(owner).post(`/terms/${termOf(year, 2).id}/make-current`),
      api(owner).post(`/terms/${termOf(year, 3).id}/make-current`),
    ]);
    expect(results.map((res) => res.status)).toEqual([200, 200]);
    const { rows } = await pool.query(
      `SELECT count(*)::int AS current FROM term WHERE organization_id = $1 AND is_current`,
      [orgA.id]
    );
    expect(rows[0].current).toBe(1);
  });
});

test.describe('edit dates', () => {
  test('moves a start later and drops the school days', async ({
    api,
    clock,
    app,
    schools: { owner },
  }) => {
    clock.set(TODAY);
    const year = await createSchoolYear(app, owner, YEAR_2026);
    const before = termOf(year, 2).schoolDays;
    const res = await api(owner)
      .patch(`/terms/${termOf(year, 2).id}`)
      .send({ startsOn: '2027-01-11' })
      .expect(200);
    expect(res.body).toMatchObject({ startsOn: '2027-01-11' });
    expect(res.body.schoolDays).toBe(before - 5);
  });

  test('refuses an overlap, dates outside the year and a stranded holiday with 400', async ({
    api,
    clock,
    app,
    schools: { owner },
  }) => {
    clock.set(TODAY);
    const year = await createSchoolYear(app, owner, YEAR_2026);
    const overlap = await api(owner)
      .patch(`/terms/${termOf(year, 2).id}`)
      .send({ endsOn: '2027-04-23' })
      .expect(400);
    expect(overlap.body.message).toBe('These dates overlap Third term.');
    const outside = await api(owner)
      .patch(`/terms/${termOf(year, 1).id}`)
      .send({ startsOn: '2026-09-01' })
      .expect(400);
    expect(outside.body.message).toBe(
      'Keep the term inside 2026/2027: 7 Sep 2026 – 23 Jul 2027.'
    );
    await api(owner)
      .post(`/terms/${termOf(year, 1).id}/holidays`)
      .send({ date: '2026-10-29', name: 'Mid-term break' })
      .expect(201);
    const stranded = await api(owner)
      .patch(`/terms/${termOf(year, 1).id}`)
      .send({ startsOn: '2026-11-02' })
      .expect(400);
    expect(stranded.body.message).toBe(
      '29 Oct 2026 is a holiday in this term that would fall outside it. Remove the holiday first.'
    );
  });

  test('refuses an ended term with 409', async ({
    api,
    clock,
    app,
    schools: { owner },
  }) => {
    clock.set(TODAY);
    const year = await createSchoolYear(app, owner, YEAR_2026);
    clock.set('2026-12-14');
    const res = await api(owner)
      .patch(`/terms/${termOf(year, 1).id}`)
      .send({ endsOn: '2026-12-10' })
      .expect(409);
    expect(res.body.message).toBe(
      'This term has already ended, so its dates can’t change.'
    );
  });
});

test.describe('holidays', () => {
  test('adding lowers the school days, removing restores them', async ({
    api,
    clock,
    app,
    schools: { owner },
  }) => {
    clock.set(TODAY);
    const year = await createSchoolYear(app, owner, YEAR_2026);
    const first = termOf(year, 1).id;
    for (const [date, name] of [
      ['2026-10-01', 'Independence Day'],
      ['2026-10-29', 'Mid-term break'],
      ['2026-10-30', 'Mid-term break'],
    ] as const) {
      await api(owner)
        .post(`/terms/${first}/holidays`)
        .send({ date, name })
        .expect(201);
    }
    const added = await api(owner)
      .post(`/terms/${first}/holidays`)
      .send({ date: '2026-11-02', name: 'Sports day' })
      .expect(201);
    expect(added.body.term.schoolDays).toBe(66);
    expect(added.body.holiday).toMatchObject({ date: '2026-11-02' });
    const removed = await api(owner)
      .delete(`/holidays/${added.body.holiday.id}`)
      .expect(200);
    expect(removed.body.term.schoolDays).toBe(67);
  });

  test('refuses a past term, a date outside, a weekend and a taken date', async ({
    api,
    clock,
    app,
    schools: { owner },
  }) => {
    clock.set(TODAY);
    const year = await createSchoolYear(app, owner, YEAR_2026);
    const first = termOf(year, 1).id;
    const outside = await api(owner)
      .post(`/terms/${first}/holidays`)
      .send({ date: '2026-12-14', name: 'x' })
      .expect(400);
    expect(outside.body.message).toBe(
      'Choose a date inside First term: 7 Sep 2026 – 11 Dec 2026.'
    );
    const weekend = await api(owner)
      .post(`/terms/${first}/holidays`)
      .send({ date: '2026-10-03', name: 'x' })
      .expect(400);
    expect(weekend.body.message).toBe(
      '3 Oct 2026 is a weekend. Holidays are school days off.'
    );
    await api(owner)
      .post(`/terms/${first}/holidays`)
      .send({ date: '2026-10-01', name: 'Independence Day' })
      .expect(201);
    const taken = await api(owner)
      .post(`/terms/${first}/holidays`)
      .send({ date: '2026-10-01', name: 'Again' })
      .expect(409);
    expect(taken.body.message).toBe(
      '1 Oct 2026 is already a holiday: Independence Day.'
    );
    clock.set('2026-12-14');
    const past = await api(owner)
      .post(`/terms/${first}/holidays`)
      .send({ date: '2026-12-01', name: 'x' })
      .expect(400);
    expect(past.body.message).toBe(
      'Cannot add a holiday to a past term. Choose a current or future term.'
    );
  });

  test('removing one from an ended term answers 409', async ({
    api,
    clock,
    app,
    schools: { owner },
  }) => {
    clock.set(TODAY);
    const year = await createSchoolYear(app, owner, YEAR_2026);
    const added = await api(owner)
      .post(`/terms/${termOf(year, 1).id}/holidays`)
      .send({ date: '2026-10-01', name: 'Independence Day' })
      .expect(201);
    clock.set('2026-12-14');
    const res = await api(owner)
      .delete(`/holidays/${added.body.holiday.id}`)
      .expect(409);
    expect(res.body.message).toBe(
      'This term has already ended, so its holidays can’t change.'
    );
  });
});

test.describe('delete', () => {
  test('is refused once the year has started', async ({
    api,
    clock,
    app,
    schools: { owner },
  }) => {
    clock.set(TODAY);
    const year = await createSchoolYear(app, owner, YEAR_2026);
    const res = await api(owner).delete(`/school-years/${year.id}`).expect(409);
    expect(res.body.message).toBe(
      'A school year that has already started cannot be deleted.'
    );
  });

  test('is refused while the year holds the current term', async ({
    api,
    clock,
    app,
    schools: { owner },
  }) => {
    clock.set(TODAY);
    await createSchoolYear(app, owner, YEAR_2026);
    const next = await createSchoolYear(app, owner, YEAR_2027);
    await api(owner)
      .post(`/terms/${termOf(next, 1).id}/make-current`)
      .expect(200);
    const res = await api(owner).delete(`/school-years/${next.id}`).expect(409);
    expect(res.body.message).toBe(
      'The current term is in this school year, so it cannot be deleted.'
    );
  });

  test('is refused when another table references the year', async ({
    api,
    clock,
    app,
    pool,
    schools: { owner },
  }) => {
    clock.set(TODAY);
    await createSchoolYear(app, owner, YEAR_2026);
    const next = await createSchoolYear(app, owner, YEAR_2027);
    await pool.query(
      `CREATE TABLE calendar_test_reference (
         id SERIAL PRIMARY KEY,
         session_id UUID NOT NULL REFERENCES academic_session (id)
       )`
    );
    try {
      await pool.query(
        `INSERT INTO calendar_test_reference (session_id) VALUES ($1)`,
        [next.id]
      );
      const res = await api(owner)
        .delete(`/school-years/${next.id}`)
        .expect(409);
      expect(res.body.message).toBe(
        'This school year has students, charges or payments, so it cannot be deleted.'
      );
    } finally {
      await pool.query(`DROP TABLE calendar_test_reference`);
    }
  });

  test('removes an empty future year with its terms and holidays', async ({
    api,
    clock,
    app,
    pool,
    schools: { owner, orgA },
  }) => {
    clock.set(TODAY);
    await createSchoolYear(app, owner, YEAR_2026);
    const next = await createSchoolYear(app, owner, YEAR_2027);
    await api(owner)
      .post(`/terms/${termOf(next, 1).id}/holidays`)
      .send({ date: '2027-10-01', name: 'Independence Day' })
      .expect(201);
    const listed = (await api(owner).get('/school-years').expect(200))
      .body as SchoolYearList;
    expect(listed.items[0]?.deletable).toEqual({ ok: true, reason: null });
    const res = await api(owner).delete(`/school-years/${next.id}`).expect(200);
    expect(res.body).toEqual({ id: next.id });
    const { rows } = await pool.query(
      `SELECT
         (SELECT count(*)::int FROM academic_session WHERE organization_id = $1) AS years,
         (SELECT count(*)::int FROM term WHERE organization_id = $1) AS terms,
         (SELECT count(*)::int FROM school_holiday WHERE organization_id = $1) AS holidays`,
      [orgA.id]
    );
    expect(rows[0]).toEqual({ years: 1, terms: 3, holidays: 0 });
  });
});

test.describe('current term and days off', () => {
  test('answer a member with no roles, with term null before any year', async ({
    api,
    schools: { noPermission },
  }) => {
    const current = await api(noPermission)
      .get('/calendar/current')
      .expect(200);
    expect(current.body).toEqual({
      term: null,
      schoolYear: null,
      schoolDays: 0,
      schoolDaysSoFar: 0,
    });
    const off = await api(noPermission).get('/calendar/days-off').expect(200);
    expect(off.body).toEqual([]);
  });

  test('carry the current term and merge a mid-term break into one entry', async ({
    api,
    clock,
    app,
    schools: { owner, noPermission },
  }) => {
    clock.set(TODAY);
    const year = await createSchoolYear(app, owner, YEAR_2026);
    for (const date of ['2026-10-29', '2026-10-30']) {
      await api(owner)
        .post(`/terms/${termOf(year, 1).id}/holidays`)
        .send({ date, name: 'Mid-term break' })
        .expect(201);
    }
    const current = await api(noPermission)
      .get('/calendar/current')
      .expect(200);
    expect(current.body.term).toMatchObject({
      name: 'First term',
      isCurrent: true,
    });
    expect(current.body.schoolYear).toMatchObject({ name: '2026/2027' });
    expect(current.body.schoolDays).toBe(68);
    expect(current.body.schoolDaysSoFar).toBe(23);
    const off = await api(noPermission)
      .get('/calendar/days-off?limit=2')
      .expect(200);
    expect(off.body).toEqual([
      {
        kind: 'holiday',
        name: 'Mid-term break',
        start: '2026-10-29',
        end: '2026-10-30',
        days: 2,
      },
      expect.objectContaining({ kind: 'break', name: 'Christmas break' }),
    ]);
  });
});

test.describe('permissions', () => {
  test('refuse each write without its permission and each read without session:read', async ({
    api,
    clock,
    app,
    withPermissions,
    schools: { owner, orgA, noPermission },
  }) => {
    clock.set(TODAY);
    const year = await createSchoolYear(app, owner, YEAR_2026);
    const term = termOf(year, 2).id;
    const reader = await withPermissions(orgA, ['session:read']);
    const updater = await withPermissions(orgA, ['session:update']);
    const setter = await withPermissions(orgA, ['session:setCurrent']);
    const creator = await withPermissions(orgA, ['session:create']);

    const holiday = { date: '2027-01-08', name: 'x' };
    const writes = [
      (u: TestUser) => api(u).post('/school-years').send(YEAR_2027),
      (u: TestUser) => api(u).delete(`/school-years/${year.id}`),
      (u: TestUser) => api(u).patch(`/terms/${term}`).send({}),
      (u: TestUser) => api(u).post(`/terms/${term}/make-current`),
      (u: TestUser) => api(u).post(`/terms/${term}/holidays`).send(holiday),
      (u: TestUser) =>
        api(u).delete('/holidays/00000000-0000-4000-8000-000000000000'),
    ];
    for (const write of writes) {
      await write(noPermission).expect(403);
      await write(reader).expect(403);
    }
    await api(reader).post('/school-years').send(YEAR_2027).expect(403);
    await api(updater).post('/school-years').send(YEAR_2027).expect(403);
    await api(updater).post(`/terms/${term}/make-current`).expect(403);
    await api(setter).patch(`/terms/${term}`).send({}).expect(403);
    await api(creator)
      .post(`/terms/${term}/holidays`)
      .send(holiday)
      .expect(403);

    await api(noPermission).get('/school-years').expect(403);
    await api(noPermission).get(`/school-years/${year.id}`).expect(403);
    const allowed = await Promise.all([
      api(reader).get('/school-years'),
      api(reader).get(`/school-years/${year.id}`),
    ]);
    expect(allowed.map((res) => res.status)).toEqual([200, 200]);
    const made = await api(setter).post(`/terms/${term}/make-current`);
    expect(made.status).toBe(200);
    const created = await api(creator).post('/school-years').send(YEAR_2027);
    expect(created.status).toBe(201);
  });
});

test.describe('administrator starter role', () => {
  test('sets up the calendar with every session permission', async ({
    api,
    clock,
    addMember,
    createUser,
    schools: { orgA },
  }) => {
    clock.set(TODAY);
    const administrator = await addMember(orgA, await createUser(), {
      roles: ['administrator'],
    });
    const year = (
      await api(administrator).post('/school-years').send(YEAR_2026).expect(201)
    ).body as CreatedSchoolYear;
    expect(year.terms).toHaveLength(3);
    await api(administrator).get('/school-years').expect(200);
    await api(administrator)
      .post(`/terms/${termOf(year, 2).id}/make-current`)
      .expect(200);
    const added = await api(administrator)
      .post(`/terms/${termOf(year, 2).id}/holidays`)
      .send({ date: '2027-01-08', name: 'Eid' })
      .expect(201);
    expect(added.body.holiday.name).toBe('Eid');
  });
});

const seed = async (
  app: Parameters<typeof createSchoolYear>[0],
  api: Api,
  owner: TestUser
) => {
  const year = await createSchoolYear(app, owner, YEAR_2026);
  const res = await api(owner)
    .post(`/terms/${termOf(year, 1).id}/holidays`)
    .send({ date: '2026-10-01', name: 'Independence Day' })
    .expect(201);
  return { year, holiday: res.body.holiday as { id: string } };
};

test.describe('isolation', () => {
  test('1: another school reads, edits, deletes and adds to A’s year, term and holiday as 404', async ({
    api,
    clock,
    app,
    schools: { owner, ownerB },
  }) => {
    clock.set(TODAY);
    const { year, holiday } = await seed(app, api, owner);
    const term = termOf(year, 2).id;
    await api(ownerB).get(`/school-years/${year.id}`).expect(404);
    await api(ownerB).delete(`/school-years/${year.id}`).expect(404);
    await api(ownerB)
      .patch(`/terms/${term}`)
      .send({ endsOn: '2027-03-26' })
      .expect(404);
    await api(ownerB).post(`/terms/${term}/make-current`).expect(404);
    await api(ownerB)
      .post(`/terms/${term}/holidays`)
      .send({ date: '2027-01-08', name: 'x' })
      .expect(404);
    await api(ownerB).delete(`/holidays/${holiday.id}`).expect(404);
    const stillThere = (
      await api(owner).get(`/school-years/${year.id}`).expect(200)
    ).body as SchoolYear;
    expect(termOf(stillThere, 1).holidayCount).toBe(1);
  });

  test('2: lists, the current term and days off never mix schools', async ({
    api,
    clock,
    app,
    schools: { owner, ownerB },
  }) => {
    clock.set(TODAY);
    const { year: yearA } = await seed(app, api, owner);
    const listB = (await api(ownerB).get('/school-years').expect(200))
      .body as SchoolYearList;
    expect(listB).toEqual({ items: [], total: 0 });
    const currentB = await api(ownerB).get('/calendar/current').expect(200);
    expect(currentB.body.term).toBeNull();
    expect(
      (await api(ownerB).get('/calendar/days-off').expect(200)).body
    ).toEqual([]);

    const yearB = await createSchoolYear(app, ownerB, YEAR_2026);
    const listBAfter = (await api(ownerB).get('/school-years').expect(200))
      .body as SchoolYearList;
    expect(listBAfter.items.map((item) => item.id)).toEqual([yearB.id]);
    const termsA = new Set(yearA.terms.map((term) => term.id));
    const termsB = listBAfter.items.flatMap((item) =>
      item.terms.map((term) => term.id)
    );
    expect(termsB).toHaveLength(3);
    expect(termsB.filter((id) => termsA.has(id))).toEqual([]);
    expect(
      listBAfter.items.flatMap((item) =>
        item.terms.flatMap((term) => term.holidays)
      )
    ).toEqual([]);
    await api(owner)
      .post(`/terms/${termOf(yearA, 1).id}/holidays`)
      .send({ date: '2026-10-29', name: 'Founders Day' })
      .expect(201);
    const offA = (await api(owner).get('/calendar/days-off').expect(200))
      .body as DayOffEntry[];
    expect(offA.map((entry) => entry.name)).toContain('Founders Day');
    const offB = (await api(ownerB).get('/calendar/days-off').expect(200))
      .body as DayOffEntry[];
    expect(offB.map((entry) => entry.name)).not.toContain('Founders Day');

    const listA = (await api(owner).get('/school-years').expect(200))
      .body as SchoolYearList;
    expect(listA.items.map((item) => item.id)).toEqual([yearA.id]);
    expect(
      listA.items.flatMap((item) => item.terms.flatMap((t) => t.holidays))
    ).toHaveLength(2);
  });

  test('5: a member without session permissions gets 403 on every gated route', async ({
    api,
    clock,
    app,
    schools: { owner, noPermission },
  }) => {
    clock.set(TODAY);
    const { year, holiday } = await seed(app, api, owner);
    const term = termOf(year, 1).id;
    const responses = await Promise.all([
      api(noPermission).get('/school-years'),
      api(noPermission).get(`/school-years/${year.id}`),
      api(noPermission).post('/school-years').send(YEAR_2027),
      api(noPermission).delete(`/school-years/${year.id}`),
      api(noPermission).patch(`/terms/${term}`).send({}),
      api(noPermission).post(`/terms/${term}/make-current`),
      api(noPermission)
        .post(`/terms/${term}/holidays`)
        .send({ date: '2026-10-02', name: 'x' }),
      api(noPermission).delete(`/holidays/${holiday.id}`),
    ]);
    expect(responses.map((res) => res.status)).toEqual(
      Array.from({ length: 8 }, () => 403)
    );
  });

  test('6: no session answers 401 on every route', async ({ api }) => {
    const id = '00000000-0000-4000-8000-000000000000';
    const body = { date: '2026-10-02', name: 'x' };
    const responses = await Promise.all([
      api().get('/school-years'),
      api().get(`/school-years/${id}`),
      api().post('/school-years').send(YEAR_2027),
      api().delete(`/school-years/${id}`),
      api().patch(`/terms/${id}`).send({}),
      api().post(`/terms/${id}/make-current`),
      api().post(`/terms/${id}/holidays`).send(body),
      api().delete(`/holidays/${id}`),
      api().get('/calendar/current'),
      api().get('/calendar/days-off'),
    ]);
    expect(responses.map((res) => res.status)).toEqual(
      Array.from({ length: 10 }, () => 401)
    );
  });

  test('7: the composite foreign keys refuse a term or holiday that points across schools', async ({
    api,
    clock,
    app,
    pool,
    schools: { owner, orgA, orgB },
  }) => {
    clock.set(TODAY);
    const { year } = await seed(app, api, owner);
    const { rows } = await pool.query(
      `INSERT INTO academic_session (organization_id, name, starts_on, ends_on)
       VALUES ($1, '2030/2031', '2030-09-02', '2031-07-25') RETURNING id`,
      [orgA.id]
    );
    await expect(
      pool.query(
        `INSERT INTO term (organization_id, session_id, sequence, name, starts_on, ends_on)
         VALUES ($1, $2, 1, 'Mine now', '2030-09-02', '2030-12-13')`,
        [orgB.id, rows[0].id]
      )
    ).rejects.toMatchObject({ code: '23503' });
    await expect(
      pool.query(
        `INSERT INTO school_holiday (organization_id, term_id, date, name)
         VALUES ($1, $2, '2026-10-02', 'Mine now')`,
        [orgB.id, termOf(year, 1).id]
      )
    ).rejects.toMatchObject({ code: '23503' });
  });

  test('12: an acting super admin without a reason is refused on every write', async ({
    api,
    clock,
    app,
    createUser,
    makeSuperAdmin,
    schools: { owner, orgA },
  }) => {
    clock.set(TODAY);
    const { year, holiday } = await seed(app, api, owner);
    const term = termOf(year, 2).id;
    const admin = await makeSuperAdmin(await createUser());
    const refused = async (request: Test) => {
      const res = await request.set(acting(orgA.id)).expect(403);
      expect(res.body.code).toBe('ActingReadOnly');
    };
    await refused(api(admin).post('/school-years').send(YEAR_2027));
    await refused(api(admin).delete(`/school-years/${year.id}`));
    await refused(api(admin).patch(`/terms/${term}`).send({}));
    await refused(api(admin).post(`/terms/${term}/make-current`));
    await refused(
      api(admin)
        .post(`/terms/${term}/holidays`)
        .send({ date: '2027-01-08', name: 'x' })
    );
    await refused(api(admin).delete(`/holidays/${holiday.id}`));
    await api(admin).get('/school-years').set(acting(orgA.id)).expect(200);
    await api(admin)
      .post('/school-years')
      .set(acting(orgA.id, 'SUP-1 set up the year'))
      .send(YEAR_2027)
      .expect(201);
  });
});
