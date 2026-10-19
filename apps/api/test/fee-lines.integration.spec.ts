import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { Pool } from 'pg';
import {
  FEE_COPY_NO_SOURCE_MESSAGE,
  FEE_EVERY_CAMPUS_MESSAGE,
  FEE_LINE_ALREADY_RETIRED_MESSAGE,
  FEE_LINE_AMOUNT_MESSAGE,
  FEE_LINE_RETIRED_MESSAGE,
  FEE_OPT_IN_LIMIT,
  FEE_TERM_ENDED_MESSAGE,
  FEE_TYPE_INVALID_MESSAGE,
  FEE_TYPE_NOT_FOUND_MESSAGE,
  feeTermLabel,
  type FeeCandidates,
  type FeeCopyResult,
  type FeeCopySource,
  type FeeGrid,
  type FeeLine,
  type FeeOptIns,
  type FeeOptInsResult,
  type FeePreview,
  type FeeSetup,
  type FeeType,
} from '@eduvault/api-contract';
import { FeeLineRepository } from '../src/app/modules/fee-line/fee-line.repository';
import {
  acting,
  expect,
  type Fixtures,
  type TestUser,
} from './support/base-test';
import { createSchoolYear, YEAR_2027 } from './support/factories/calendar';
import { createFeeLine, feeFixture } from './support/factories/fees';
import { financeTexts, ledgerAccountId } from './support/factories/finance';
import { makeCurrent, termOf } from './support/factories/terms';
import { bareSchoolsTest, schoolsTest as test } from './support/two-schools';

const levelOf = async (pool: Pool, studentId: string): Promise<string> => {
  const { rows } = await pool.query<{ class_level_id: string }>(
    'SELECT class_level_id FROM student_enrollment WHERE student_id = $1',
    [studentId]
  );
  const [row] = rows;
  if (row === undefined) {
    throw new Error('The student has no enrolment');
  }
  return row.class_level_id;
};

const offerBus = async (
  as: { app: INestApplication; pool: Pool; actor: TestUser },
  fixture: Awaited<ReturnType<typeof feeFixture>>,
  students: { id: string }[]
) => {
  const levels = new Set(
    await Promise.all(students.map((student) => levelOf(as.pool, student.id)))
  );
  for (const classLevelId of levels) {
    await createFeeLine({ app: as.app, actor: as.actor }, fixture, {
      classLevelId,
      name: 'School bus',
      feeType: 'School bus',
      amountMinor: 4_500_000,
      isOptional: true,
    });
  }
};

const optInRows = async (pool: Pool, feeTypeId: string): Promise<number> =>
  (
    await pool.query(
      'SELECT 1 FROM student_fee_option WHERE ledger_account_id = $1',
      [feeTypeId]
    )
  ).rowCount ?? 0;

const insertRaw = (
  pool: Pool,
  values: {
    organizationId: string;
    termId: string;
    levelId: string;
    ledgerAccountId: string;
    campusId?: string | null;
    amountMinor?: number;
  }
) =>
  pool.query(
    `INSERT INTO fee_line
       (organization_id, term_id, class_level_id, ledger_account_id, campus_id, name, amount_minor)
     VALUES ($1, $2, $3, $4, $5, 'Raw', $6)`,
    [
      values.organizationId,
      values.termId,
      values.levelId,
      values.ledgerAccountId,
      values.campusId ?? null,
      values.amountMinor ?? 100,
    ]
  );

interface ScheduleRow {
  kind: string;
  pillar: string;
  campus_id: string | null;
  organization_id: string;
  subject_type: string;
  subject_id: string;
  text: string;
  data: Record<string, unknown>;
}

const scheduleRows = async (
  pool: Pool,
  organizationId: string
): Promise<ScheduleRow[]> =>
  (
    await pool.query<ScheduleRow>(
      `SELECT kind, pillar, campus_id, organization_id, subject_type, subject_id, text, data
       FROM activity_event
       WHERE organization_id = $1 AND subject_type IN ('fee_line', 'term')
       ORDER BY occurred_at, id`,
      [organizationId]
    )
  ).rows;

const optionRows = async (
  pool: Pool,
  organizationId: string,
  kindPrefix: 'fee_type' | 'fee_option'
): Promise<ScheduleRow[]> =>
  (
    await pool.query<ScheduleRow>(
      `SELECT kind, pillar, campus_id, organization_id, subject_type, subject_id, text, data
       FROM activity_event
       WHERE organization_id = $1 AND kind LIKE $2
       ORDER BY occurred_at, id`,
      [organizationId, `${kindPrefix}.%`]
    )
  ).rows;

const tuitionBody = (
  fixture: {
    termId: string;
    levelId: (code: string) => string;
    feeTypeId: (name: string) => string;
  },
  over: Record<string, unknown> = {}
) => ({
  termId: fixture.termId,
  classLevelId: fixture.levelId('JSS2'),
  feeTypeId: fixture.feeTypeId('Tuition'),
  campusId: null,
  name: 'Tuition',
  amountMinor: 18_000_000,
  ...over,
});

const termNames = (setup: FeeSetup) =>
  setup.terms.map((term) => feeTermLabel(term));

const copyScenario = async (
  app: INestApplication,
  api: Fixtures['api'],
  schools: { owner: TestUser; lekki: { id: string } }
) => {
  const { owner, lekki } = schools;
  const fixture = await feeFixture(app, api, owner);
  await createSchoolYear(app, owner, YEAR_2027);
  await makeCurrent(api, owner, { year: '2026/2027', sequence: 3 });
  const third = await termOf(api, owner, { year: '2026/2027', sequence: 3 });
  const next = await termOf(api, owner, { year: '2027/2028', sequence: 1 });
  const inThird = { ...fixture, termId: third.id };
  const as = { app, actor: owner };
  await createFeeLine(as, inThird, {
    name: 'Tuition',
    amountMinor: 18_000_000,
  });
  await createFeeLine(as, inThird, {
    name: 'Lekki tuition',
    campusId: lekki.id,
    amountMinor: 17_000_000,
  });
  await createFeeLine(as, inThird, {
    name: 'School bus',
    feeType: 'School bus',
    amountMinor: 4_500_000,
    isOptional: true,
  });
  await createFeeLine(as, inThird, {
    name: 'PTA fee',
    feeType: 'PTA fee',
    amountMinor: 500_000,
    appliesTo: 'new',
  });
  const old = await createFeeLine(as, inThird, {
    name: 'Old PTA',
    level: 'JSS1',
    feeType: 'PTA fee',
    amountMinor: 300_000,
  });
  await api(owner).post(`/fee-lines/${old.id}/retire`).expect(201);
  return { fixture, third, next, inThird };
};

test.describe('fee lines', () => {
  test.describe('isolation', () => {
    test('1: another school reads, updates and retires by id as 404', async ({
      api,
      app,
      schools: { owner, ownerB, studentLekki },
    }) => {
      const fixture = await feeFixture(app, api, owner);
      const line = await createFeeLine({ app, actor: owner }, fixture, {
        name: 'Tuition',
        amountMinor: 1000,
      });

      await api(ownerB)
        .patch(`/fee-lines/${line.id}`)
        .send({ amountMinor: 2000 })
        .expect(404);
      await api(ownerB).post(`/fee-lines/${line.id}/retire`).expect(404);
      await api(ownerB).get(`/fee-lines?termId=${fixture.termId}`).expect(404);
      await api(ownerB)
        .get(`/fee-lines/grid?termId=${fixture.termId}&group=school`)
        .expect(404);
      await api(ownerB)
        .get(
          `/fee-lines/preview?termId=${fixture.termId}&studentId=${studentLekki.id}`
        )
        .expect(404);
      await api(ownerB)
        .get(`/students/${studentLekki.id}/fee-options`)
        .expect(404);
      await api(ownerB)
        .get(`/fee-lines/candidates?termId=${fixture.termId}`)
        .expect(404);
      await api(ownerB)
        .post('/fee-lines/copy')
        .send({ termId: fixture.termId })
        .expect(404);
      await api(ownerB)
        .get(`/fee-lines/copy-source?termId=${fixture.termId}`)
        .expect(404);
      await api(ownerB)
        .put(
          `/students/${studentLekki.id}/fee-options/${fixture.feeTypeId('School bus')}`
        )
        .send({ optedIn: true })
        .expect(404);
      await api(ownerB)
        .get(`/fee-types/${fixture.feeTypeId('School bus')}/opt-ins`)
        .query({ termId: fixture.termId })
        .expect(404);
      await api(ownerB)
        .put(`/fee-types/${fixture.feeTypeId('School bus')}/opt-ins`)
        .send({
          termId: fixture.termId,
          studentIds: [studentLekki.id],
          optedIn: true,
        })
        .expect(404);

      const unchanged = (
        await api(owner).get(`/fee-lines?termId=${fixture.termId}`).expect(200)
      ).body as FeeLine[];
      expect(unchanged.map((row) => row.amountMinor)).toEqual([1000]);
    });

    test('2: each school lists only its own lines', async ({
      api,
      app,
      schools: { owner, ownerB },
    }) => {
      const fixtureA = await feeFixture(app, api, owner);
      const fixtureB = await feeFixture(app, api, ownerB);
      await createFeeLine({ app, actor: owner }, fixtureA, {
        name: 'A tuition',
        amountMinor: 1000,
      });
      await createFeeLine({ app, actor: ownerB }, fixtureB, {
        name: 'B tuition',
        amountMinor: 2000,
      });

      const namesIn = async (user: typeof owner, termId: string) =>
        (
          (await api(user).get(`/fee-lines?termId=${termId}`).expect(200))
            .body as FeeLine[]
        ).map((row) => row.name);
      expect(await namesIn(owner, fixtureA.termId)).toEqual(['A tuition']);
      expect(await namesIn(ownerB, fixtureB.termId)).toEqual(['B tuition']);
    });

    test('3 and 4: a Lekki-only bursar reads every-campus and Lekki lines, never Ikeja, and gets 404 on the Ikeja line', async ({
      api,
      app,
      schools: { owner, lekkiOnly, lekki, ikeja },
    }) => {
      const fixture = await feeFixture(app, api, owner);
      const base = await createFeeLine({ app, actor: owner }, fixture, {
        name: 'Tuition',
        amountMinor: 18_000_000,
      });
      const lekkiLine = await createFeeLine({ app, actor: owner }, fixture, {
        name: 'Tuition (Lekki)',
        amountMinor: 17_000_000,
        campusId: lekki.id,
      });
      const ikejaLine = await createFeeLine({ app, actor: owner }, fixture, {
        name: 'Tuition (Ikeja)',
        amountMinor: 16_500_000,
        campusId: ikeja.id,
      });

      const seen = (
        await api(lekkiOnly)
          .get(`/fee-lines?termId=${fixture.termId}`)
          .expect(200)
      ).body as FeeLine[];
      expect(
        seen.map((row) => row.id).toSorted((a, b) => a.localeCompare(b))
      ).toEqual([base.id, lekkiLine.id].toSorted((a, b) => a.localeCompare(b)));

      const grid = (
        await api(lekkiOnly)
          .get(`/fee-lines/grid?termId=${fixture.termId}&group=school`)
          .expect(200)
      ).body as FeeGrid;
      const cell = grid.rows[0]?.cells[0];
      expect(cell?.overrides.map((row) => row.campusName)).toEqual(['Lekki']);

      await api(lekkiOnly)
        .patch(`/fee-lines/${ikejaLine.id}`)
        .send({ amountMinor: 1 })
        .expect(404);
      await api(lekkiOnly)
        .post(`/fee-lines/${ikejaLine.id}/retire`)
        .expect(404);
    });

    test('3 and 4: a Lekki-only bursar lists no Ikeja student for a fee type and gets 404 on a bulk opt-in naming one', async ({
      api,
      app,
      pool,
      schools: { owner, lekkiOnly, studentLekki, studentIkeja },
    }) => {
      const fixture = await feeFixture(app, api, owner);
      await offerBus({ app, pool, actor: owner }, fixture, [
        studentLekki,
        studentIkeja,
      ]);
      const busId = fixture.feeTypeId('School bus');
      const url = `/fee-types/${busId}/opt-ins`;

      const listed = (
        await api(lekkiOnly)
          .get(url)
          .query({ termId: fixture.termId })
          .expect(200)
      ).body as FeeOptIns;
      const ids = listed.items.map((row) => row.studentId);
      expect(ids).toContain(studentLekki.id);
      expect(ids).not.toContain(studentIkeja.id);
      await api(lekkiOnly)
        .put(url)
        .send({
          termId: fixture.termId,
          studentIds: [studentLekki.id, studentIkeja.id],
          optedIn: true,
        })
        .expect(404);
      expect(await optInRows(pool, busId)).toBe(0);
    });

    test('3 and 4: copy-source gives a Lekki-only bursar the source term but no school-wide counts', async ({
      api,
      app,
      schools: { owner, lekkiOnly, lekki },
    }) => {
      const { next, third } = await copyScenario(app, api, { owner, lekki });
      const seen = (
        await api(lekkiOnly)
          .get(`/fee-lines/copy-source?termId=${next.id}`)
          .expect(200)
      ).body as FeeCopySource;
      expect(seen).toEqual({
        sourceTerm: {
          id: third.id,
          name: 'Third term',
          schoolYearName: '2026/2027',
        },
        liveLineCount: 0,
        targetHasLines: false,
      });
    });

    test('5: a member without feeLine permissions gets 403 on every fee route', async ({
      api,
      schools: { noPermission },
    }) => {
      const id = randomUUID();
      const routes = [
        ['get', `/fee-lines?termId=${id}`],
        ['get', '/fee-lines/setup'],
        ['get', `/fee-lines/grid?termId=${id}&group=school`],
        ['get', `/fee-lines/preview?termId=${id}&studentId=${id}`],
        ['get', `/fee-lines/candidates?termId=${id}`],
        ['post', '/fee-lines'],
        ['patch', `/fee-lines/${id}`],
        ['post', `/fee-lines/${id}/retire`],
        ['get', `/fee-lines/copy-source?termId=${id}`],
        ['post', '/fee-lines/copy'],
        ['get', '/fee-types'],
        ['post', '/fee-types'],
        ['get', `/students/${id}/fee-options`],
        ['put', `/students/${id}/fee-options/${id}`],
        ['get', `/fee-types/${id}/opt-ins?termId=${id}`],
        ['put', `/fee-types/${id}/opt-ins`],
      ] as const;
      for (const [method, path] of routes) {
        const res = await api(noPermission)[method](path).send({});
        expect(res.status, `${method} ${path}`).toBe(403);
      }
    });

    test('5: each write answers 403 for a member holding only the other permissions', async ({
      api,
      app,
      withPermissions,
      schools: { owner, orgA },
    }) => {
      const fixture = await feeFixture(app, api, owner);
      const line = await createFeeLine({ app, actor: owner }, fixture, {
        name: 'Tuition',
        amountMinor: 1000,
      });
      const reader = await withPermissions(orgA, ['feeLine:read']);
      await api(reader)
        .post('/fee-lines')
        .send(tuitionBody(fixture))
        .expect(403);
      await api(reader)
        .patch(`/fee-lines/${line.id}`)
        .send({ amountMinor: 2 })
        .expect(403);
      await api(reader).post(`/fee-lines/${line.id}/retire`).expect(403);
      await api(reader)
        .post('/fee-types')
        .send({ name: 'Sports levy' })
        .expect(403);
      const updater = await withPermissions(orgA, [
        'feeLine:read',
        'feeLine:update',
        'campus:readAll',
      ]);
      await api(updater).post(`/fee-lines/${line.id}/retire`).expect(403);
      await api(updater)
        .post('/fee-lines')
        .send(tuitionBody(fixture))
        .expect(403);
      await api(updater)
        .patch(`/fee-lines/${line.id}`)
        .send({ amountMinor: 2000 })
        .expect(200);
    });

    test('6: no session answers 401 on every fee route', async ({ api }) => {
      const id = randomUUID();
      const routes = [
        ['get', `/fee-lines?termId=${id}`],
        ['get', '/fee-lines/setup'],
        ['get', `/fee-lines/grid?termId=${id}&group=school`],
        ['get', `/fee-lines/preview?termId=${id}&studentId=${id}`],
        ['get', `/fee-lines/candidates?termId=${id}`],
        ['post', '/fee-lines'],
        ['patch', `/fee-lines/${id}`],
        ['post', `/fee-lines/${id}/retire`],
        ['get', `/fee-lines/copy-source?termId=${id}`],
        ['post', '/fee-lines/copy'],
        ['get', '/fee-types'],
        ['post', '/fee-types'],
        ['get', `/students/${id}/fee-options`],
        ['put', `/students/${id}/fee-options/${id}`],
        ['get', `/fee-types/${id}/opt-ins?termId=${id}`],
        ['put', `/fee-types/${id}/opt-ins`],
      ] as const;
      for (const [method, path] of routes) {
        await api()[method](path).send({}).expect(401);
      }
    });

    test('7: a create naming another school’s campus, term or level answers 404 and the composite keys refuse a raw insert', async ({
      api,
      app,
      pool,
      schools: { owner, ownerB, orgA, orgB, campusB },
    }) => {
      const fixture = await feeFixture(app, api, owner);
      const fixtureB = await feeFixture(app, api, ownerB);

      await api(owner)
        .post('/fee-lines')
        .send(tuitionBody(fixture, { campusId: campusB.id }))
        .expect(404);
      await api(owner)
        .post('/fee-lines')
        .send(tuitionBody(fixture, { termId: fixtureB.termId }))
        .expect(404);
      await api(owner)
        .post('/fee-lines')
        .send(tuitionBody(fixture, { classLevelId: fixtureB.levelId('JSS2') }))
        .expect(404);
      await api(owner)
        .post('/fee-lines/copy')
        .send({ termId: fixtureB.termId })
        .expect(404);
      await api(owner)
        .get(`/fee-lines/copy-source?termId=${fixtureB.termId}`)
        .expect(404);
      const foreignType = await api(owner)
        .post('/fee-lines')
        .send(
          tuitionBody(fixture, { feeTypeId: fixtureB.feeTypeId('Tuition') })
        )
        .expect(404);
      expect(foreignType.body.message).toBe(FEE_TYPE_NOT_FOUND_MESSAGE);

      const base = {
        organizationId: orgA.id,
        termId: fixture.termId,
        levelId: fixture.levelId('JSS2'),
        ledgerAccountId: await ledgerAccountId(pool, orgA.id, 4010),
      };
      await expect(
        insertRaw(pool, { ...base, campusId: campusB.id })
      ).rejects.toMatchObject({ code: '23503' });
      await expect(
        insertRaw(pool, { ...base, termId: fixtureB.termId })
      ).rejects.toMatchObject({ code: '23503' });
      await expect(
        insertRaw(pool, { ...base, levelId: fixtureB.levelId('JSS2') })
      ).rejects.toMatchObject({ code: '23503' });
      await expect(
        insertRaw(pool, {
          ...base,
          ledgerAccountId: await ledgerAccountId(pool, orgB.id, 4010),
        })
      ).rejects.toMatchObject({ code: '23514' });
    });

    test('8: the composite keys of student_fee_option refuse another school’s enrolment or fee type', async ({
      api,
      app,
      pool,
      schools: { owner, ownerB, orgA, orgB, studentLekki, studentB },
    }) => {
      await feeFixture(app, api, owner);
      await feeFixture(app, api, ownerB);
      const enrollmentOf = async (studentId: string): Promise<string> => {
        const { rows } = await pool.query<{ id: string }>(
          'SELECT id FROM student_enrollment WHERE student_id = $1',
          [studentId]
        );
        return rows[0]?.id ?? '';
      };
      const insertOption = (
        organizationId: string,
        enrollmentId: string,
        ledgerAccountIdValue: string
      ) =>
        pool.query(
          `INSERT INTO student_fee_option (organization_id, enrollment_id, ledger_account_id)
           VALUES ($1, $2, $3)`,
          [organizationId, enrollmentId, ledgerAccountIdValue]
        );
      const enrollmentA = await enrollmentOf(studentLekki.id);
      const enrollmentB = await enrollmentOf(studentB.id);
      expect(enrollmentA).not.toBe('');
      expect(enrollmentB).not.toBe('');
      const typeA = await ledgerAccountId(pool, orgA.id, 4010);
      const typeB = await ledgerAccountId(pool, orgB.id, 4010);

      await expect(
        insertOption(orgA.id, enrollmentB, typeA)
      ).rejects.toMatchObject({ code: '23503' });
      await expect(
        insertOption(orgA.id, enrollmentA, typeB)
      ).rejects.toMatchObject({ code: '23503' });
      await expect(
        insertOption(orgB.id, enrollmentA, typeB)
      ).rejects.toMatchObject({ code: '23503' });
      await insertOption(orgA.id, enrollmentA, typeA);
    });

    test('12: an acting super admin without a reason is refused every write, and with a reason may write', async ({
      api,
      app,
      makeSuperAdmin,
      createUser,
      schools: { owner, orgA },
    }) => {
      const fixture = await feeFixture(app, api, owner);
      const line = await createFeeLine({ app, actor: owner }, fixture, {
        name: 'Tuition',
        amountMinor: 1000,
      });
      const admin = await makeSuperAdmin(await createUser());
      const writes = [
        () =>
          api(admin)
            .post('/fee-lines')
            .set(acting(orgA.id))
            .send(tuitionBody(fixture)),
        () =>
          api(admin)
            .patch(`/fee-lines/${line.id}`)
            .set(acting(orgA.id))
            .send({ amountMinor: 2 }),
        () =>
          api(admin).post(`/fee-lines/${line.id}/retire`).set(acting(orgA.id)),
        () =>
          api(admin)
            .post('/fee-lines/copy')
            .set(acting(orgA.id))
            .send({ termId: fixture.termId }),
        () =>
          api(admin)
            .post('/fee-types')
            .set(acting(orgA.id))
            .send({ name: 'Trip' }),
        () =>
          api(admin)
            .put(`/students/${randomUUID()}/fee-options/${randomUUID()}`)
            .set(acting(orgA.id))
            .send({ optedIn: true }),
        () =>
          api(admin)
            .put(`/fee-types/${randomUUID()}/opt-ins`)
            .set(acting(orgA.id))
            .send({
              termId: fixture.termId,
              studentIds: [randomUUID()],
              optedIn: true,
            }),
      ];
      for (const write of writes) {
        const res = await write().expect(403);
        expect(res.body.code).toBe('ActingReadOnly');
      }
      await api(admin)
        .get(`/fee-lines?termId=${fixture.termId}`)
        .set(acting(orgA.id))
        .expect(200);
      await api(admin)
        .patch(`/fee-lines/${line.id}`)
        .set(acting(orgA.id, 'Fixing the bursar’s typo'))
        .send({ amountMinor: 2000 })
        .expect(200);
    });
  });

  test.describe('rules', () => {
    test('creates a line with the level, fee type and campus names and the defaults', async ({
      api,
      app,
      schools: { owner, lekki },
    }) => {
      const fixture = await feeFixture(app, api, owner);
      const res = await api(owner)
        .post('/fee-lines')
        .send(tuitionBody(fixture, { campusId: lekki.id }))
        .expect(201);
      expect(res.body).toMatchObject({
        levelName: 'JSS 2',
        feeTypeName: 'Tuition',
        feeTypeCode: 4010,
        campusName: 'Lekki',
        appliesTo: 'all',
        isOptional: false,
        retiredAt: null,
        amountMinor: 18_000_000,
      });
    });

    test('answers 409 for a second live line, and allows it again once the first is retired', async ({
      api,
      app,
      schools: { owner, ikeja },
    }) => {
      const fixture = await feeFixture(app, api, owner);
      const first = await api(owner)
        .post('/fee-lines')
        .send(tuitionBody(fixture))
        .expect(201);
      const duplicate = await api(owner)
        .post('/fee-lines')
        .send(tuitionBody(fixture, { amountMinor: 1 }))
        .expect(409);
      expect(duplicate.body.message).toBe(
        'There is already a Tuition fee for JSS 2 on every campus this term. Change its amount instead.'
      );
      const listed = (
        await api(owner).get(`/fee-lines?termId=${fixture.termId}`).expect(200)
      ).body as FeeLine[];
      expect(listed).toHaveLength(1);

      await api(owner)
        .post('/fee-lines')
        .send(tuitionBody(fixture, { campusId: ikeja.id }))
        .expect(201);
      const campusDuplicate = await api(owner)
        .post('/fee-lines')
        .send(tuitionBody(fixture, { campusId: ikeja.id }))
        .expect(409);
      expect(campusDuplicate.body.message).toContain('on Ikeja this term');

      await api(owner).post(`/fee-lines/${first.body.id}/retire`).expect(201);
      await api(owner)
        .post('/fee-lines')
        .send(tuitionBody(fixture))
        .expect(201);
    });

    test('answers 400 for a zero, negative or unparseable amount and a blank name', async ({
      api,
      app,
      schools: { owner },
    }) => {
      const fixture = await feeFixture(app, api, owner);
      for (const amountMinor of [0, -1, 'abc', null]) {
        const res = await api(owner)
          .post('/fee-lines')
          .send(tuitionBody(fixture, { amountMinor }))
          .expect(400);
        expect(JSON.stringify(res.body)).toContain(FEE_LINE_AMOUNT_MESSAGE);
      }
      await api(owner)
        .post('/fee-lines')
        .send(tuitionBody(fixture, { name: '   ' }))
        .expect(400);
    });

    test('answers 400 for a fee type outside Fee income or hidden, and the database refuses one', async ({
      api,
      app,
      pool,
      schools: { owner, orgA },
    }) => {
      const fixture = await feeFixture(app, api, owner);
      for (const code of [1100, 4000, 4060]) {
        const res = await api(owner)
          .post('/fee-lines')
          .send(
            tuitionBody(fixture, {
              feeTypeId: await ledgerAccountId(pool, orgA.id, code),
            })
          )
          .expect(400);
        expect(res.body.message).toBe(FEE_TYPE_INVALID_MESSAGE);
      }
      await expect(
        insertRaw(pool, {
          organizationId: orgA.id,
          termId: fixture.termId,
          levelId: fixture.levelId('JSS2'),
          ledgerAccountId: await ledgerAccountId(pool, orgA.id, 1100),
        })
      ).rejects.toMatchObject({
        code: '23514',
        constraint: 'fee_line_fee_income_child',
      });
    });

    test('the database refuses a zero amount', async ({
      api,
      app,
      pool,
      schools: { owner, orgA },
    }) => {
      const fixture = await feeFixture(app, api, owner);
      await expect(
        insertRaw(pool, {
          organizationId: orgA.id,
          termId: fixture.termId,
          levelId: fixture.levelId('JSS2'),
          ledgerAccountId: await ledgerAccountId(pool, orgA.id, 4010),
          amountMinor: 0,
        })
      ).rejects.toMatchObject({
        code: '23514',
        constraint: 'fee_line_amount_positive',
      });
    });

    test('changes only the amount, and keeps the retired line and its history', async ({
      api,
      app,
      schools: { owner },
    }) => {
      const fixture = await feeFixture(app, api, owner);
      const line = await createFeeLine({ app, actor: owner }, fixture, {
        name: 'Tuition',
        amountMinor: 1000,
      });
      const changed = await api(owner)
        .patch(`/fee-lines/${line.id}`)
        .send({ amountMinor: 2000 })
        .expect(200);
      expect(changed.body).toMatchObject({
        amountMinor: 2000,
        name: 'Tuition',
      });
      await api(owner)
        .patch(`/fee-lines/${line.id}`)
        .send({ amountMinor: 0 })
        .expect(400);
      await api(owner)
        .patch(`/fee-lines/${line.id}`)
        .send({ amountMinor: 5, name: 'Other' })
        .expect(400);

      const retired = await api(owner)
        .post(`/fee-lines/${line.id}/retire`)
        .expect(201);
      expect(retired.body.retiredAt).not.toBeNull();
      const again = await api(owner)
        .post(`/fee-lines/${line.id}/retire`)
        .expect(409);
      expect(again.body.message).toBe(FEE_LINE_ALREADY_RETIRED_MESSAGE);
      const patched = await api(owner)
        .patch(`/fee-lines/${line.id}`)
        .send({ amountMinor: 3000 })
        .expect(409);
      expect(patched.body.message).toBe(FEE_LINE_RETIRED_MESSAGE);

      const withRetired = (
        await api(owner).get(`/fee-lines?termId=${fixture.termId}`).expect(200)
      ).body as FeeLine[];
      expect(withRetired).toHaveLength(1);
      const liveOnly = (
        await api(owner)
          .get(`/fee-lines?termId=${fixture.termId}&includeRetired=false`)
          .expect(200)
      ).body as FeeLine[];
      expect(liveOnly).toEqual([]);
    });

    test('keeps the line in the list when a term ends, but refuses every write with 400', async ({
      api,
      app,
      clock,
      schools: { owner },
    }) => {
      const fixture = await feeFixture(app, api, owner);
      const line = await createFeeLine({ app, actor: owner }, fixture, {
        name: 'Tuition',
        amountMinor: 1000,
      });
      clock.set('2028-01-10');

      const create = await api(owner)
        .post('/fee-lines')
        .send(tuitionBody(fixture, { feeTypeId: fixture.feeTypeId('PTA fee') }))
        .expect(400);
      expect(create.body.message).toBe(FEE_TERM_ENDED_MESSAGE);
      const patch = await api(owner)
        .patch(`/fee-lines/${line.id}`)
        .send({ amountMinor: 2 })
        .expect(400);
      expect(patch.body.message).toBe(FEE_TERM_ENDED_MESSAGE);
      await api(owner).post(`/fee-lines/${line.id}/retire`).expect(400);
      await api(owner).get(`/fee-lines?termId=${fixture.termId}`).expect(200);
    });

    test('needs access to every campus for every-campus writes, but lets a campus bursar write their own campus', async ({
      api,
      app,
      schools: { owner, lekkiOnly, lekki, ikeja },
    }) => {
      const fixture = await feeFixture(app, api, owner);
      const base = await createFeeLine({ app, actor: owner }, fixture, {
        name: 'Tuition',
        amountMinor: 1000,
      });

      const everyCampus = await api(lekkiOnly)
        .post('/fee-lines')
        .send(tuitionBody(fixture, { feeTypeId: fixture.feeTypeId('PTA fee') }))
        .expect(403);
      expect(everyCampus.body.message).toBe(FEE_EVERY_CAMPUS_MESSAGE);
      await api(lekkiOnly)
        .patch(`/fee-lines/${base.id}`)
        .send({ amountMinor: 2 })
        .expect(403);
      await api(lekkiOnly).post(`/fee-lines/${base.id}/retire`).expect(403);

      const own = await api(lekkiOnly)
        .post('/fee-lines')
        .send(
          tuitionBody(fixture, { campusId: lekki.id, amountMinor: 17_000_000 })
        )
        .expect(201);
      await api(lekkiOnly)
        .patch(`/fee-lines/${own.body.id}`)
        .send({ amountMinor: 17_500_000 })
        .expect(200);
      await api(lekkiOnly)
        .post('/fee-lines')
        .send(tuitionBody(fixture, { campusId: ikeja.id }))
        .expect(404);
      await api(lekkiOnly).post(`/fee-lines/${own.body.id}/retire`).expect(201);
    });
  });

  test.describe('activity', () => {
    test('create, amount change and retire each write one finance row in the line’s campus', async ({
      api,
      app,
      pool,
      schools: { owner, orgA, lekki },
    }) => {
      const fixture = await feeFixture(app, api, owner);
      const everyCampus = await api(owner)
        .post('/fee-lines')
        .send(tuitionBody(fixture))
        .expect(201);
      const campusLine = await api(owner)
        .post('/fee-lines')
        .send(
          tuitionBody(fixture, {
            campusId: lekki.id,
            name: 'Lekki tuition',
            amountMinor: 17_000_000,
          })
        )
        .expect(201);
      await api(owner)
        .patch(`/fee-lines/${campusLine.body.id}`)
        .send({ amountMinor: 17_500_000 })
        .expect(200);
      await api(owner)
        .post(`/fee-lines/${everyCampus.body.id}/retire`)
        .expect(201);

      const rows = await scheduleRows(pool, orgA.id);
      expect(
        rows.map((row) => [row.kind, row.campus_id, row.subject_id])
      ).toEqual([
        ['fee_line.created', null, everyCampus.body.id],
        ['fee_line.created', lekki.id, campusLine.body.id],
        ['fee_line.amount_changed', lekki.id, campusLine.body.id],
        ['fee_line.retired', null, everyCampus.body.id],
      ]);
      for (const row of rows) {
        expect(row).toMatchObject({
          pillar: 'finance',
          organization_id: orgA.id,
          subject_type: 'fee_line',
        });
      }
      expect(rows.map((row) => row.data)).toEqual([
        {
          feeLineId: everyCampus.body.id,
          termId: fixture.termId,
          classLevelId: fixture.levelId('JSS2'),
          feeTypeId: fixture.feeTypeId('Tuition'),
          amountMinor: 18_000_000,
          appliesTo: 'all',
          isOptional: false,
        },
        {
          feeLineId: campusLine.body.id,
          termId: fixture.termId,
          classLevelId: fixture.levelId('JSS2'),
          feeTypeId: fixture.feeTypeId('Tuition'),
          amountMinor: 17_000_000,
          appliesTo: 'all',
          isOptional: false,
        },
        {
          feeLineId: campusLine.body.id,
          termId: fixture.termId,
          previousAmountMinor: 17_000_000,
          amountMinor: 17_500_000,
        },
        {
          feeLineId: everyCampus.body.id,
          termId: fixture.termId,
          amountMinor: 18_000_000,
        },
      ]);
      const term = feeTermLabel(
        (await api(owner).get('/fee-lines/setup').expect(200)).body.terms.find(
          (candidate: { id: string }) => candidate.id === fixture.termId
        )
      );
      expect(rows.map((row) => row.text)).toEqual([
        expect.stringMatching(
          new RegExp(
            String.raw`^.+ added Tuition \(Tuition\) for JSS 2, every campus, ${term}: ₦180,000\.$`
          )
        ),
        expect.stringContaining(`for JSS 2, Lekki, ${term}: ₦170,000.`),
        expect.stringContaining(
          `changed Lekki tuition for JSS 2, Lekki, ${term} from ₦170,000 to ₦175,000.`
        ),
        expect.stringContaining(
          `retired Tuition for JSS 2, every campus, ${term} (₦180,000).`
        ),
      ]);
    });

    test('a duplicate, a same-amount update and every refused write add no row', async ({
      api,
      app,
      clock,
      pool,
      schools: { owner, orgA, lekkiOnly, ikeja },
    }) => {
      const fixture = await feeFixture(app, api, owner);
      const line = await api(owner)
        .post('/fee-lines')
        .send(tuitionBody(fixture))
        .expect(201);
      const ikejaLine = await api(owner)
        .post('/fee-lines')
        .send(tuitionBody(fixture, { campusId: ikeja.id }))
        .expect(201);
      const written = (await scheduleRows(pool, orgA.id)).length;
      expect(written).toBe(2);

      await api(owner)
        .post('/fee-lines')
        .send(tuitionBody(fixture, { amountMinor: 1 }))
        .expect(409);
      await api(owner)
        .patch(`/fee-lines/${line.body.id}`)
        .send({ amountMinor: 18_000_000 })
        .expect(200);
      await api(owner)
        .patch(`/fee-lines/${line.body.id}`)
        .send({ amountMinor: 0 })
        .expect(400);
      await api(lekkiOnly)
        .patch(`/fee-lines/${line.body.id}`)
        .send({ amountMinor: 2 })
        .expect(403);
      await api(lekkiOnly)
        .post(`/fee-lines/${line.body.id}/retire`)
        .expect(403);
      await api(lekkiOnly)
        .patch(`/fee-lines/${ikejaLine.body.id}`)
        .send({ amountMinor: 2 })
        .expect(404);
      await api(lekkiOnly)
        .post(`/fee-lines/${ikejaLine.body.id}/retire`)
        .expect(404);
      expect(await scheduleRows(pool, orgA.id)).toHaveLength(written);

      await api(owner).post(`/fee-lines/${line.body.id}/retire`).expect(201);
      await api(owner).post(`/fee-lines/${line.body.id}/retire`).expect(409);
      await api(owner)
        .patch(`/fee-lines/${line.body.id}`)
        .send({ amountMinor: 3000 })
        .expect(409);
      expect(await scheduleRows(pool, orgA.id)).toHaveLength(written + 1);

      clock.set('2028-01-10');
      await api(owner)
        .patch(`/fee-lines/${ikejaLine.body.id}`)
        .send({ amountMinor: 2 })
        .expect(400);
      await api(owner)
        .post(`/fee-lines/${ikejaLine.body.id}/retire`)
        .expect(400);
      expect(await scheduleRows(pool, orgA.id)).toHaveLength(written + 1);
    });

    test('creating a fee type writes one school-wide row, and a duplicate name writes none', async ({
      api,
      pool,
      schools: { owner, orgA, orgB },
    }) => {
      const created = await api(owner)
        .post('/fee-types')
        .send({ name: 'Sports levy' })
        .expect(201);
      await api(owner)
        .post('/fee-types')
        .send({ name: 'SPORTS LEVY' })
        .expect(409);

      const rows = await optionRows(pool, orgA.id, 'fee_type');
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        kind: 'fee_type.created',
        pillar: 'finance',
        campus_id: null,
        subject_id: created.body.id,
        data: {
          feeTypeId: created.body.id,
          code: 4090,
          name: 'Sports levy',
        },
      });
      expect(rows[0]?.text).toMatch(
        /^.+ added the fee type Sports levy \(4090\)\.$/
      );
      expect(await optionRows(pool, orgB.id, 'fee_type')).toEqual([]);
    });

    test('opting a student in and out writes one row each on the student’s campus, and a repeat writes none', async ({
      api,
      app,
      pool,
      withPermissions,
      schools: { owner, ownerB, orgA, orgB, lekki, ikeja, studentLekki },
    }) => {
      const fixture = await feeFixture(app, api, owner);
      await createFeeLine({ app, actor: owner }, fixture, {
        classLevelId: await levelOf(pool, studentLekki.id),
        name: 'School bus',
        feeType: 'School bus',
        amountMinor: 4_500_000,
        isOptional: true,
      });
      const busId = fixture.feeTypeId('School bus');
      const optionUrl = `/students/${studentLekki.id}/fee-options/${busId}`;
      const optIn = () =>
        api(owner).put(optionUrl).send({ optedIn: true }).expect(200);
      const optOut = () =>
        api(owner).put(optionUrl).send({ optedIn: false }).expect(200);

      await optOut();
      expect(await optionRows(pool, orgA.id, 'fee_option')).toEqual([]);
      await optIn();
      await optIn();
      const [opted, ...extra] = await optionRows(pool, orgA.id, 'fee_option');
      expect(extra).toEqual([]);
      expect(opted).toMatchObject({
        kind: 'fee_option.opted_in',
        pillar: 'finance',
        campus_id: lekki.id,
        subject_id: studentLekki.id,
        data: {
          studentId: studentLekki.id,
          feeTypeId: busId,
          optedIn: true,
        },
      });
      expect(opted?.text).toMatch(/^.+ opted .+ into School bus\.$/);

      const ikejaReader = await withPermissions(orgA, ['payment:read'], {
        campuses: [ikeja],
      });
      const lekkiReader = await withPermissions(orgA, ['payment:read'], {
        campuses: [lekki],
      });
      expect(await financeTexts(api, lekkiReader)).toContain(opted?.text);
      expect(await financeTexts(api, ikejaReader)).not.toContain(opted?.text);

      await optOut();
      await optOut();
      const rows = await optionRows(pool, orgA.id, 'fee_option');
      expect(rows.map((row) => [row.kind, row.campus_id])).toEqual([
        ['fee_option.opted_in', lekki.id],
        ['fee_option.opted_out', lekki.id],
      ]);
      expect(rows[1]?.text).toMatch(/^.+ opted .+ out of School bus\.$/);
      expect(rows[1]?.data).toMatchObject({ optedIn: false });
      expect(await optionRows(pool, orgB.id, 'fee_option')).toEqual([]);
      expect(await financeTexts(api, ownerB)).toEqual([]);
    });

    test('a refused opt-in and an out-of-scope student write no row', async ({
      api,
      app,
      pool,
      schools: { owner, orgA, lekkiOnly, studentLekki, studentIkeja },
    }) => {
      const fixture = await feeFixture(app, api, owner);
      const busId = fixture.feeTypeId('School bus');
      await api(owner)
        .put(`/students/${studentLekki.id}/fee-options/${busId}`)
        .send({ optedIn: true })
        .expect(400);
      await createFeeLine({ app, actor: owner }, fixture, {
        classLevelId: await levelOf(pool, studentIkeja.id),
        name: 'School bus',
        feeType: 'School bus',
        amountMinor: 4_500_000,
        isOptional: true,
      });
      await api(lekkiOnly)
        .put(`/students/${studentIkeja.id}/fee-options/${busId}`)
        .send({ optedIn: true })
        .expect(404);
      expect(await optionRows(pool, orgA.id, 'fee_option')).toEqual([]);
    });

    test('a copy writes one row per campus share about the target term, and a refused copy writes none', async ({
      api,
      app,
      pool,
      schools: { owner, orgA, lekki },
    }) => {
      const { third, next } = await copyScenario(app, api, { owner, lekki });
      const copyRows = async () =>
        (await scheduleRows(pool, orgA.id)).filter(
          (row) => row.kind === 'fee_lines.copied'
        );
      await api(owner)
        .post('/fee-lines/copy')
        .send({ termId: next.id })
        .expect(201);
      await api(owner)
        .post('/fee-lines/copy')
        .send({ termId: next.id })
        .expect(409);

      const rows = await copyRows();
      for (const row of rows) {
        expect(row).toMatchObject({
          pillar: 'finance',
          organization_id: orgA.id,
          subject_type: 'term',
          subject_id: next.id,
        });
      }
      expect(rows).toHaveLength(2);
      expect(rows.map((row) => [row.campus_id, row.data, row.text])).toEqual(
        expect.arrayContaining([
          [
            null,
            { fromTermId: third.id, toTermId: next.id, copied: 3 },
            expect.stringMatching(
              /^.+ copied 3 fee lines from Third term, 2026\/2027 to First term, 2027\/2028 \(for every campus\)\.$/
            ),
          ],
          [
            lekki.id,
            { fromTermId: third.id, toTermId: next.id, copied: 1 },
            expect.stringMatching(
              /^.+ copied 1 fee line from Third term, 2026\/2027 to First term, 2027\/2028 \(for this campus\)\.$/
            ),
          ],
        ])
      );
    });

    test('a campus-scoped finance reader sees only their campus’s share of a copy', async ({
      api,
      app,
      schools: { owner, lekkiOnly, lekki, ikeja },
    }) => {
      const { next, inThird } = await copyScenario(app, api, { owner, lekki });
      const as = { app, actor: owner };
      await createFeeLine(as, inThird, {
        name: 'Ikeja tuition',
        campusId: ikeja.id,
        amountMinor: 16_500_000,
      });
      await createFeeLine(as, inThird, {
        name: 'Ikeja JSS1 tuition',
        level: 'JSS1',
        campusId: ikeja.id,
        amountMinor: 15_000_000,
      });
      await api(owner)
        .post('/fee-lines/copy')
        .send({ termId: next.id })
        .expect(201);

      const seen = (await financeTexts(api, lekkiOnly)).filter((text) =>
        text.includes(' copied ')
      );
      expect(seen).toHaveLength(2);
      expect(seen.join(' ')).toContain('copied 3 fee lines');
      expect(seen.join(' ')).toContain('copied 1 fee line from');
      expect(seen.join(' ')).not.toContain('copied 2 fee lines');
      expect(
        (await financeTexts(api, owner)).filter((text) =>
          text.includes(' copied ')
        )
      ).toHaveLength(3);
    });

    test('a copy from an empty source writes no row', async ({
      api,
      app,
      pool,
      schools: { owner, orgA, lekki },
    }) => {
      const { third, next } = await copyScenario(app, api, { owner, lekki });
      await pool.query(
        'UPDATE fee_line SET retired_at = now() WHERE term_id = $1',
        [third.id]
      );
      await api(owner)
        .post('/fee-lines/copy')
        .send({ termId: next.id })
        .expect(400);
      expect(
        (await scheduleRows(pool, orgA.id)).filter(
          (row) => row.kind === 'fee_lines.copied'
        )
      ).toEqual([]);
    });

    test('two concurrent amount edits chain their previous amounts', async ({
      api,
      app,
      pool,
      schools: { owner, orgA },
    }) => {
      const fixture = await feeFixture(app, api, owner);
      const line = await createFeeLine({ app, actor: owner }, fixture, {
        name: 'Tuition',
        amountMinor: 18_000_000,
      });
      await Promise.all(
        [19_000_000, 20_000_000].map((amountMinor) =>
          api(owner)
            .patch(`/fee-lines/${line.id}`)
            .send({ amountMinor })
            .expect(200)
        )
      );
      const changes = (await scheduleRows(pool, orgA.id)).filter(
        (row) => row.kind === 'fee_line.amount_changed'
      );
      expect(changes).toHaveLength(2);
      const [first, second] = changes.map((row) => ({
        from: row.data['previousAmountMinor'],
        to: row.data['amountMinor'],
      }));
      expect(first?.from).toBe(18_000_000);
      expect(second?.from).toBe(first?.to);
      const { rows } = await pool.query<{ amount_minor: string }>(
        'SELECT amount_minor FROM fee_line WHERE id = $1',
        [line.id]
      );
      expect(Number(rows[0]?.amount_minor)).toBe(second?.to);
    });

    test('a write whose activity row cannot be saved rolls back', async ({
      api,
      app,
      pool,
      schools: { owner, orgA },
    }) => {
      const fixture = await feeFixture(app, api, owner);
      const line = await createFeeLine({ app, actor: owner }, fixture, {
        name: 'Tuition',
        amountMinor: 18_000_000,
      });
      const repository = app.get(FeeLineRepository, { strict: false });
      const refused = (found: FeeLine) => [
        {
          organizationId: orgA.id,
          campusId: found.campusId,
          pillar: 'finance' as const,
          kind: 'fee_line.created',
          actorUserId: 'unused',
          subjectType: 'fee_line',
          subjectId: found.id,
          text: 'refused',
          data: { token: 'x' },
        },
      ];
      const rowCount = async (table: 'fee_line' | 'activity_event') =>
        Number(
          (
            await pool.query<{ count: string }>(
              `SELECT count(*) FROM ${table} WHERE organization_id = $1`,
              [orgA.id]
            )
          ).rows[0]?.count
        );
      const before = {
        lines: await rowCount('fee_line'),
        activity: await rowCount('activity_event'),
      };

      await expect(
        repository.create(
          {
            organizationId: orgA.id,
            userId: owner.id,
            termId: fixture.termId,
            classLevelId: fixture.levelId('JSS2'),
            feeTypeId: fixture.feeTypeId('PTA fee'),
            campusId: null,
            name: 'PTA',
            amountMinor: 1,
            appliesTo: 'all',
            isOptional: false,
          },
          refused
        )
      ).rejects.toThrow('secret');
      await expect(
        repository.updateAmount(
          { organizationId: orgA.id, id: line.id, amountMinor: 2 },
          refused
        )
      ).rejects.toThrow('secret');
      await expect(
        repository.retire(orgA.id, line.id, refused)
      ).rejects.toThrow('secret');

      expect(await rowCount('fee_line')).toBe(before.lines);
      expect(await rowCount('activity_event')).toBe(before.activity);
      const { rows } = await pool.query<{
        amount_minor: string;
        retired_at: Date | null;
      }>('SELECT amount_minor, retired_at FROM fee_line WHERE id = $1', [
        line.id,
      ]);
      expect(Number(rows[0]?.amount_minor)).toBe(18_000_000);
      expect(rows[0]?.retired_at).toBeNull();
    });

    test('a copy whose activity row cannot be saved leaves the target term empty', async ({
      api,
      app,
      pool,
      schools: { owner, orgA, lekki },
    }) => {
      const { third, next } = await copyScenario(app, api, { owner, lekki });
      const repository = app.get(FeeLineRepository, { strict: false });
      const activityBefore = await scheduleRows(pool, orgA.id);

      await expect(
        repository.copyLines(
          {
            organizationId: orgA.id,
            userId: owner.id,
            fromTermId: third.id,
            toTermId: next.id,
          },
          (shares) =>
            shares.map(({ campusId }) => ({
              organizationId: orgA.id,
              campusId,
              pillar: 'finance' as const,
              kind: 'fee_lines.copied',
              actorUserId: owner.id,
              subjectType: 'term',
              subjectId: next.id,
              text: 'refused',
              data: { token: 'x' },
            }))
        )
      ).rejects.toThrow('secret');

      const target = (
        await api(owner).get(`/fee-lines?termId=${next.id}`).expect(200)
      ).body as FeeLine[];
      expect(target).toEqual([]);
      expect(await scheduleRows(pool, orgA.id)).toHaveLength(
        activityBefore.length
      );
    });

    test('fee-line rows stay out of another school’s feed and respect campus scope and finance read', async ({
      api,
      app,
      schools: { owner, ownerB, lekkiOnly, noPermission, lekki, ikeja },
    }) => {
      const fixture = await feeFixture(app, api, owner);
      const as = { app, actor: owner };
      await createFeeLine(as, fixture, {
        name: 'Every campus tuition',
        amountMinor: 18_000_000,
      });
      await createFeeLine(as, fixture, {
        name: 'Lekki tuition',
        campusId: lekki.id,
        amountMinor: 17_000_000,
      });
      await createFeeLine(as, fixture, {
        name: 'Ikeja tuition',
        campusId: ikeja.id,
        amountMinor: 16_500_000,
      });

      expect(await financeTexts(api, owner)).toHaveLength(3);
      expect(await financeTexts(api, ownerB)).toEqual([]);
      const lekkiSees = (await financeTexts(api, lekkiOnly)).join(' ');
      expect(lekkiSees).toContain('Every campus tuition');
      expect(lekkiSees).toContain('Lekki tuition');
      expect(lekkiSees).not.toContain('Ikeja tuition');
      expect(await financeTexts(api, noPermission)).toEqual([]);
    });

    test('a member holding only feeLine:read sees no fee-line row', async ({
      api,
      app,
      withPermissions,
      schools: { owner, orgA, lekki, ikeja },
    }) => {
      const fixture = await feeFixture(app, api, owner);
      await createFeeLine({ app, actor: owner }, fixture, {
        name: 'Tuition',
        amountMinor: 18_000_000,
      });
      const reader = await withPermissions(orgA, ['feeLine:read'], {
        campuses: [lekki, ikeja],
      });
      expect(await financeTexts(api, reader)).toEqual([]);
    });
  });

  test.describe('setup', () => {
    test('gives a bursar with only fee permissions the current and next term and every level, without session:read', async ({
      api,
      app,
      schools: { owner, lekkiOnly },
    }) => {
      const fixture = await feeFixture(app, api, owner);
      await api(lekkiOnly).get('/school-years').expect(403);

      const setup = (await api(lekkiOnly).get('/fee-lines/setup').expect(200))
        .body as FeeSetup;
      expect(termNames(setup)).toEqual([
        'First term, 2026/2027',
        'Second term, 2026/2027',
      ]);
      expect(setup.terms.map((term) => term.isCurrent)).toEqual([true, false]);
      expect(setup.terms[0]?.id).toBe(fixture.termId);
      expect(setup.levels.map((level) => level.id)).toContain(
        fixture.levelId('JSS2')
      );
      expect(setup.levels.map((level) => level.sequence)).toEqual(
        setup.levels.map((level) => level.sequence).toSorted((a, b) => a - b)
      );
    });

    test('answers 200 for a member holding only feeLine:read and 403 without it', async ({
      api,
      app,
      withPermissions,
      schools: { owner, orgA, noPermission },
    }) => {
      await feeFixture(app, api, owner);
      const reader = await withPermissions(orgA, ['feeLine:read']);
      await api(reader).get('/fee-lines/setup').expect(200);
      await api(noPermission).get('/fee-lines/setup').expect(403);
      const other = await withPermissions(orgA, ['session:read']);
      await api(other).get('/fee-lines/setup').expect(403);
    });

    test('moves to the next year’s first term from the third term once that year exists', async ({
      api,
      app,
      schools: { owner, lekkiOnly },
    }) => {
      await feeFixture(app, api, owner);
      await makeCurrent(api, owner, { year: '2026/2027', sequence: 3 });
      const alone = (await api(lekkiOnly).get('/fee-lines/setup').expect(200))
        .body as FeeSetup;
      expect(termNames(alone)).toEqual(['Third term, 2026/2027']);

      await createSchoolYear(app, owner, YEAR_2027);
      const crossing = (
        await api(lekkiOnly).get('/fee-lines/setup').expect(200)
      ).body as FeeSetup;
      expect(termNames(crossing)).toEqual([
        'Third term, 2026/2027',
        'First term, 2027/2028',
      ]);
    });

    test('shows each school only its own terms and levels', async ({
      api,
      app,
      schools: { owner, ownerB },
    }) => {
      const fixtureA = await feeFixture(app, api, owner);
      const fixtureB = await feeFixture(app, api, ownerB);
      const setupOf = async (user: typeof owner) =>
        (await api(user).get('/fee-lines/setup').expect(200)).body as FeeSetup;
      const [a, b] = [await setupOf(owner), await setupOf(ownerB)];

      expect(a.terms.map((term) => term.id)).toContain(fixtureA.termId);
      expect(a.terms.map((term) => term.id)).not.toContain(fixtureB.termId);
      expect(b.terms.map((term) => term.id)).toEqual(
        expect.arrayContaining([fixtureB.termId])
      );
      expect(b.terms.map((term) => term.id)).not.toContain(fixtureA.termId);
      const levelIdsA = new Set(a.levels.map((level) => level.id));
      expect(b.levels.some((level) => levelIdsA.has(level.id))).toBe(false);
    });
  });

  test.describe('grid', () => {
    test('shows tuition with campus overrides and the typical total, and the other fee types on the other grid', async ({
      api,
      app,
      schools: { owner, ikeja },
    }) => {
      const fixture = await feeFixture(app, api, owner);
      await createFeeLine({ app, actor: owner }, fixture, {
        name: 'Tuition',
        amountMinor: 18_000_000,
      });
      await createFeeLine({ app, actor: owner }, fixture, {
        name: 'Tuition (Ikeja)',
        amountMinor: 16_500_000,
        campusId: ikeja.id,
      });
      await createFeeLine({ app, actor: owner }, fixture, {
        name: 'PTA fee',
        feeType: 'PTA fee',
        amountMinor: 1_000_000,
      });
      await createFeeLine({ app, actor: owner }, fixture, {
        name: 'School bus',
        feeType: 'School bus',
        amountMinor: 4_500_000,
        isOptional: true,
      });
      await createFeeLine({ app, actor: owner }, fixture, {
        name: 'Development levy',
        feeType: 'Development levy',
        amountMinor: 2_500_000,
        appliesTo: 'new',
      });
      await createFeeLine({ app, actor: owner }, fixture, {
        name: 'Lab fee',
        feeType: 'Laboratory fee',
        amountMinor: 300_000,
        appliesTo: 'returning',
      });

      const school = (
        await api(owner)
          .get(`/fee-lines/grid?termId=${fixture.termId}&group=school`)
          .expect(200)
      ).body as FeeGrid;
      expect(school.currency).toBe('NGN');
      expect(school.feeTypes.map((row) => row.name)).toEqual(['Tuition']);
      expect(school.rows).toHaveLength(1);
      const [row] = school.rows;
      expect(row?.level.name).toBe('JSS 2');
      expect(row?.cells[0]?.base?.amountMinor).toBe(18_000_000);
      expect(row?.cells[0]?.overrides).toEqual([
        expect.objectContaining({
          campusName: 'Ikeja',
          amountMinor: 16_500_000,
        }),
      ]);
      expect(row?.typicalTotalMinor).toBe(19_300_000);

      const other = (
        await api(owner)
          .get(`/fee-lines/grid?termId=${fixture.termId}&group=other`)
          .expect(200)
      ).body as FeeGrid;
      expect(other.feeTypes.map((type) => type.name)).not.toContain('Tuition');
      expect(other.feeTypes.map((type) => type.name)).not.toContain(
        'Other charges'
      );
      expect(other.rows[0]?.typicalTotalMinor).toBeNull();

      const chip = (
        await api(owner)
          .get(
            `/fee-lines/grid?termId=${fixture.termId}&group=other&feeTypeId=${fixture.feeTypeId('School bus')}`
          )
          .expect(200)
      ).body as FeeGrid;
      expect(chip.feeTypes.map((type) => type.name)).toEqual(['School bus']);
    });

    test('lists lines by group and fee type', async ({
      api,
      app,
      schools: { owner },
    }) => {
      const fixture = await feeFixture(app, api, owner);
      await createFeeLine({ app, actor: owner }, fixture, {
        name: 'Tuition',
        amountMinor: 1000,
      });
      await createFeeLine({ app, actor: owner }, fixture, {
        name: 'PTA fee',
        feeType: 'PTA fee',
        amountMinor: 500,
      });
      const names = async (query: string) =>
        (
          (
            await api(owner)
              .get(`/fee-lines?termId=${fixture.termId}${query}`)
              .expect(200)
          ).body as FeeLine[]
        ).map((line) => line.name);
      expect(await names('&group=school')).toEqual(['Tuition']);
      expect(await names('&group=other')).toEqual(['PTA fee']);
      expect(await names(`&feeTypeId=${fixture.feeTypeId('PTA fee')}`)).toEqual(
        ['PTA fee']
      );
    });
  });

  test.describe('fee types', () => {
    test('lists the children of Fee income without Other charges, in code order', async ({
      api,
      schools: { owner },
    }) => {
      const types = (await api(owner).get('/fee-types').expect(200))
        .body as FeeType[];
      expect(types.map((type) => type.code)).toEqual([
        4010, 4020, 4030, 4040, 4050, 4070, 4080,
      ]);
      expect(types.map((type) => type.name)).not.toContain('Other charges');
    });

    test('adds a fee type under Fee income at the next free code and answers 409 for a repeat in any case', async ({
      api,
      schools: { owner, ownerB },
    }) => {
      const created = await api(owner)
        .post('/fee-types')
        .send({ name: '  Sports levy ' })
        .expect(201);
      expect(created.body).toMatchObject({ code: 4090, name: 'Sports levy' });
      expect(
        (
          (await api(owner).get('/fee-types').expect(200)).body as FeeType[]
        ).map((type) => type.name)
      ).toContain('Sports levy');

      const repeat = await api(owner)
        .post('/fee-types')
        .send({ name: 'SPORTS LEVY' })
        .expect(409);
      expect(repeat.body.message).toBe(
        'A fee type called SPORTS LEVY already exists.'
      );
      await api(owner).post('/fee-types').send({ name: ' ' }).expect(400);

      expect(
        (
          (await api(ownerB).get('/fee-types').expect(200)).body as FeeType[]
        ).map((type) => type.name)
      ).not.toContain('Sports levy');
    });

    test('lets a bursar add a category through the ledger endpoint too, and refuses a reader', async ({
      api,
      withPermissions,
      schools: { owner, orgA },
    }) => {
      const chart = (
        await api(owner).get('/finance/ledger-accounts').expect(200)
      ).body.items as { id: string; code: number }[];
      const feeIncome = chart.find((account) => account.code === 4000)?.id;
      const clerk = await withPermissions(orgA, [
        'feeLine:read',
        'feeLine:create',
      ]);
      await api(clerk)
        .post('/finance/ledger-accounts')
        .send({ parentId: feeIncome, name: 'Uniform levy' })
        .expect(201);
      const reader = await withPermissions(orgA, ['feeLine:read']);
      const refused = await api(reader)
        .post('/finance/ledger-accounts')
        .send({ parentId: feeIncome, name: 'Nope' })
        .expect(403);
      expect(refused.body.message).toBe(
        'Missing permission ledger:manageAccounts or feeLine:create'
      );
    });
  });

  test.describe('preview', () => {
    test('uses the campus override after eligibility and totals the applicable lines', async ({
      api,
      app,
      pool,
      schools: { owner, ikeja, studentIkeja },
    }) => {
      const fixture = await feeFixture(app, api, owner);
      const classLevelId = await levelOf(pool, studentIkeja.id);
      const line = (over: Record<string, unknown>) =>
        createFeeLine({ app, actor: owner }, fixture, {
          classLevelId,
          name: 'Tuition',
          amountMinor: 18_000_000,
          ...over,
        });
      await line({});
      await line({
        name: 'Tuition (Ikeja)',
        amountMinor: 16_500_000,
        campusId: ikeja.id,
        appliesTo: 'new',
      });
      await line({
        name: 'PTA fee',
        feeType: 'PTA fee',
        amountMinor: 1_000_000,
      });
      const url = `/fee-lines/preview?termId=${fixture.termId}&studentId=${studentIkeja.id}`;

      const asNew = (await api(owner).get(url).expect(200)).body as FeePreview;
      expect(asNew.student).toMatchObject({ campusName: 'Ikeja', isNew: true });
      expect(asNew.lines.map((row) => row.description)).toEqual([
        'Tuition (Ikeja)',
        'PTA fee',
      ]);
      expect(asNew.totalMinor).toBe(17_500_000);
      expect(asNew.charged).toBeNull();
      expect(asNew.pendingDiscounts).toEqual([]);

      await pool.query(
        'UPDATE student_enrollment SET is_new_student = FALSE WHERE student_id = $1',
        [studentIkeja.id]
      );
      const returning = (await api(owner).get(url).expect(200))
        .body as FeePreview;
      expect(returning.student.isNew).toBe(false);
      expect(returning.lines.map((row) => row.description)).toEqual([
        'Tuition',
        'PTA fee',
      ]);
      expect(returning.totalMinor).toBe(19_000_000);
    });

    test('shows an optional line only after the student opts in, and the opt-in carries to the next term', async ({
      api,
      app,
      pool,
      schools: { owner, studentLekki },
    }) => {
      const fixture = await feeFixture(app, api, owner);
      const classLevelId = await levelOf(pool, studentLekki.id);
      const second = await termOf(api, owner, {
        year: '2026/2027',
        sequence: 2,
      });
      const bus = (termId: string) =>
        createFeeLine(
          { app, actor: owner },
          { ...fixture, termId },
          {
            classLevelId,
            name: 'School bus',
            feeType: 'School bus',
            amountMinor: 4_500_000,
            isOptional: true,
          }
        );
      await bus(fixture.termId);
      await bus(second.id);
      const first = `/fee-lines/preview?termId=${fixture.termId}&studentId=${studentLekki.id}`;
      const next = `/fee-lines/preview?termId=${second.id}&studentId=${studentLekki.id}`;

      expect(
        ((await api(owner).get(first).expect(200)).body as FeePreview).lines
      ).toEqual([]);
      await api(owner)
        .put(
          `/students/${studentLekki.id}/fee-options/${fixture.feeTypeId('School bus')}`
        )
        .send({ optedIn: true })
        .expect(200);
      for (const url of [first, next]) {
        const preview = (await api(owner).get(url).expect(200))
          .body as FeePreview;
        expect(preview.lines).toEqual([
          expect.objectContaining({ description: 'School bus', optedIn: true }),
        ]);
      }
    });

    test('lists the active students enrolled in the term’s school year within the campus scope, and narrows by search', async ({
      api,
      app,
      schools: { owner, lekkiOnly, studentLekki, studentIkeja },
    }) => {
      const fixture = await feeFixture(app, api, owner);
      const url = `/fee-lines/candidates?termId=${fixture.termId}`;
      const idsOf = (body: FeeCandidates) => body.items.map((row) => row.id);

      const everyone = (await api(owner).get(url).expect(200))
        .body as FeeCandidates;
      expect(idsOf(everyone)).toEqual(
        expect.arrayContaining([studentLekki.id, studentIkeja.id])
      );
      expect(everyone.total).toBe(everyone.items.length);
      expect(everyone.items[0]).toEqual({
        id: expect.any(String),
        name: expect.any(String),
        admissionNumber: expect.any(String),
        levelName: expect.any(String),
      });

      const scoped = (await api(lekkiOnly).get(url).expect(200))
        .body as FeeCandidates;
      expect(idsOf(scoped)).toContain(studentLekki.id);
      expect(idsOf(scoped)).not.toContain(studentIkeja.id);

      const found = (
        await api(owner)
          .get(`${url}&q=${encodeURIComponent(studentIkeja.admissionNumber)}`)
          .expect(200)
      ).body as FeeCandidates;
      expect(idsOf(found)).toEqual([studentIkeja.id]);

      const levelName = everyone.items[0]?.levelName ?? '';
      const byLevel = (
        await api(owner)
          .get(`${url}&q=${encodeURIComponent(levelName)}`)
          .expect(200)
      ).body as FeeCandidates;
      expect(idsOf(byLevel)).toEqual(expect.arrayContaining([studentLekki.id]));

      await createSchoolYear(app, owner, YEAR_2027);
      const future = await termOf(api, owner, {
        year: '2027/2028',
        sequence: 1,
      });
      const nextYear = (
        await api(owner)
          .get(`/fee-lines/candidates?termId=${future.id}`)
          .expect(200)
      ).body as FeeCandidates;
      expect(nextYear).toEqual({ items: [], total: 0 });
    });

    test('refuses the preview and its candidates to a member who cannot read students', async ({
      api,
      app,
      withPermissions,
      schools: { owner, orgA, studentLekki },
    }) => {
      const fixture = await feeFixture(app, api, owner);
      const reader = await withPermissions(orgA, ['feeLine:read']);
      const refused = await api(reader)
        .get(
          `/fee-lines/preview?termId=${fixture.termId}&studentId=${studentLekki.id}`
        )
        .expect(403);
      expect(refused.body.message).toBe('Missing permission student:read');
      await api(reader)
        .get(`/fee-lines/candidates?termId=${fixture.termId}`)
        .expect(403);
      await api(reader).get(`/fee-lines?termId=${fixture.termId}`).expect(200);
    });

    test('answers 404 for a student outside the campus scope or without an enrolment in the term’s year', async ({
      api,
      app,
      schools: { owner, lekkiOnly, studentIkeja, studentLekki },
    }) => {
      const fixture = await feeFixture(app, api, owner);
      await api(lekkiOnly)
        .get(
          `/fee-lines/preview?termId=${fixture.termId}&studentId=${studentIkeja.id}`
        )
        .expect(404);
      await api(lekkiOnly)
        .get(
          `/fee-lines/preview?termId=${fixture.termId}&studentId=${studentLekki.id}`
        )
        .expect(200);

      await createSchoolYear(app, owner, YEAR_2027);
      const future = await termOf(api, owner, {
        year: '2027/2028',
        sequence: 1,
      });
      await api(owner)
        .get(
          `/fee-lines/preview?termId=${future.id}&studentId=${studentLekki.id}`
        )
        .expect(404);
    });
  });

  test.describe('opt-ins', () => {
    test('lists the optional fee types for the level and records both choices', async ({
      api,
      app,
      pool,
      schools: { owner, studentLekki },
    }) => {
      const fixture = await feeFixture(app, api, owner);
      const classLevelId = await levelOf(pool, studentLekki.id);
      await createFeeLine({ app, actor: owner }, fixture, {
        classLevelId,
        name: 'School bus',
        feeType: 'School bus',
        amountMinor: 4_500_000,
        isOptional: true,
      });
      await createFeeLine({ app, actor: owner }, fixture, {
        classLevelId,
        name: 'Tuition',
        amountMinor: 18_000_000,
      });
      const busId = fixture.feeTypeId('School bus');
      const optionsUrl = `/students/${studentLekki.id}/fee-options`;

      expect((await api(owner).get(optionsUrl).expect(200)).body).toEqual([
        { feeTypeId: busId, name: 'School bus', optedIn: false },
      ]);
      expect(
        (
          await api(owner)
            .put(`${optionsUrl}/${busId}`)
            .send({ optedIn: true })
            .expect(200)
        ).body
      ).toEqual({ feeTypeId: busId, optedIn: true });
      await api(owner)
        .put(`${optionsUrl}/${busId}`)
        .send({ optedIn: true })
        .expect(200);
      expect(
        (await api(owner).get(optionsUrl).expect(200)).body[0].optedIn
      ).toBe(true);
      const { rows } = await pool.query(
        'SELECT 1 FROM student_fee_option WHERE ledger_account_id = $1',
        [busId]
      );
      expect(rows).toHaveLength(1);

      await api(owner)
        .put(`${optionsUrl}/${busId}`)
        .send({ optedIn: false })
        .expect(200);
      expect(
        (await api(owner).get(optionsUrl).expect(200)).body[0].optedIn
      ).toBe(false);
    });

    test('switches an opt-in off after the only optional line is retired', async ({
      api,
      app,
      pool,
      schools: { owner, studentLekki },
    }) => {
      const fixture = await feeFixture(app, api, owner);
      const line = await createFeeLine({ app, actor: owner }, fixture, {
        classLevelId: await levelOf(pool, studentLekki.id),
        name: 'School bus',
        feeType: 'School bus',
        amountMinor: 4_500_000,
        isOptional: true,
      });
      const busId = fixture.feeTypeId('School bus');
      const optionUrl = `/students/${studentLekki.id}/fee-options/${busId}`;
      await api(owner).put(optionUrl).send({ optedIn: true }).expect(200);
      await api(owner).post(`/fee-lines/${line.id}/retire`).expect(201);

      await api(owner).put(optionUrl).send({ optedIn: true }).expect(400);
      await api(owner).put(optionUrl).send({ optedIn: false }).expect(200);
      const { rows } = await pool.query(
        'SELECT 1 FROM student_fee_option WHERE ledger_account_id = $1',
        [busId]
      );
      expect(rows).toHaveLength(0);
    });

    test('stores nothing for an opt-out of a fee type that was never optional and answers 404 for a school year that is not the school’s', async ({
      api,
      app,
      pool,
      schools: { owner, studentLekki },
    }) => {
      const fixture = await feeFixture(app, api, owner);
      const ptaId = fixture.feeTypeId('PTA fee');
      const optionUrl = `/students/${studentLekki.id}/fee-options/${ptaId}`;

      const off = await api(owner)
        .put(optionUrl)
        .send({ optedIn: false })
        .expect(200);
      expect(off.body).toEqual({ feeTypeId: ptaId, optedIn: false });
      const { rows } = await pool.query(
        'SELECT 1 FROM student_fee_option WHERE ledger_account_id = $1',
        [ptaId]
      );
      expect(rows).toHaveLength(0);

      await api(owner)
        .put(optionUrl)
        .send({ optedIn: false, sessionId: randomUUID() })
        .expect(404);
      await api(owner)
        .get(`/students/${studentLekki.id}/fee-options`)
        .query({ sessionId: randomUUID() })
        .expect(404);
    });

    test('offers only the optional fee types of the student’s campus and of every campus', async ({
      api,
      app,
      pool,
      schools: { owner, ikeja, studentLekki },
    }) => {
      const fixture = await feeFixture(app, api, owner);
      const classLevelId = await levelOf(pool, studentLekki.id);
      await createFeeLine({ app, actor: owner }, fixture, {
        classLevelId,
        name: 'School bus (Ikeja)',
        feeType: 'School bus',
        amountMinor: 4_500_000,
        isOptional: true,
        campusId: ikeja.id,
      });
      await createFeeLine({ app, actor: owner }, fixture, {
        classLevelId,
        name: 'PTA fee',
        feeType: 'PTA fee',
        amountMinor: 1_000_000,
        isOptional: true,
      });
      const optionsUrl = `/students/${studentLekki.id}/fee-options`;

      expect((await api(owner).get(optionsUrl).expect(200)).body).toEqual([
        {
          feeTypeId: fixture.feeTypeId('PTA fee'),
          name: 'PTA fee',
          optedIn: false,
        },
      ]);
      await api(owner)
        .put(`${optionsUrl}/${fixture.feeTypeId('School bus')}`)
        .send({ optedIn: true })
        .expect(400);
    });

    test('answers 400 for a fee type with no optional line for the level', async ({
      api,
      app,
      schools: { owner, studentLekki },
    }) => {
      const fixture = await feeFixture(app, api, owner);
      await api(owner)
        .put(
          `/students/${studentLekki.id}/fee-options/${fixture.feeTypeId('Tuition')}`
        )
        .send({ optedIn: true })
        .expect(400);
    });

    test('answers 404 for a student outside the campus scope', async ({
      api,
      app,
      schools: { owner, lekkiOnly, studentIkeja },
    }) => {
      const fixture = await feeFixture(app, api, owner);
      await api(lekkiOnly)
        .get(`/students/${studentIkeja.id}/fee-options`)
        .expect(404);
      await api(lekkiOnly)
        .put(
          `/students/${studentIkeja.id}/fee-options/${fixture.feeTypeId('School bus')}`
        )
        .send({ optedIn: true })
        .expect(404);
    });

    test.describe('bulk', () => {
      test('opts several students in at once, shows the line in the preview and replays without a new row', async ({
        api,
        app,
        pool,
        schools: { owner, orgA, studentLekki, studentIkeja },
      }) => {
        const fixture = await feeFixture(app, api, owner);
        const students = [studentLekki, studentIkeja];
        await offerBus({ app, pool, actor: owner }, fixture, students);
        const busId = fixture.feeTypeId('School bus');
        const url = `/fee-types/${busId}/opt-ins`;
        const body = {
          termId: fixture.termId,
          studentIds: students.map((student) => student.id),
          optedIn: true,
        };

        const before = (
          await api(owner)
            .get(url)
            .query({ termId: fixture.termId })
            .expect(200)
        ).body as FeeOptIns;
        expect(before.schoolYearName).toEqual(expect.any(String));
        expect(before.items).toEqual(
          expect.arrayContaining(
            students.map((student) =>
              expect.objectContaining({
                studentId: student.id,
                admissionNumber: student.admissionNumber,
                optedIn: false,
              })
            )
          )
        );
        expect(before.total).toBe(before.items.length);

        const done = await api(owner).put(url).send(body).expect(200);
        expect(done.body as FeeOptInsResult).toEqual({
          feeTypeId: busId,
          optedIn: true,
          changed: 2,
          unchanged: 0,
        });
        expect(await optInRows(pool, busId)).toBe(2);
        expect(await optionRows(pool, orgA.id, 'fee_option')).toHaveLength(2);
        const after = (
          await api(owner)
            .get(url)
            .query({ termId: fixture.termId })
            .expect(200)
        ).body as FeeOptIns;
        expect(
          after.items.filter((row) => row.optedIn).map((row) => row.studentId)
        ).toEqual(expect.arrayContaining(body.studentIds));
        const preview = (
          await api(owner)
            .get('/fee-lines/preview')
            .query({ termId: fixture.termId, studentId: studentLekki.id })
            .expect(200)
        ).body as FeePreview;
        expect(preview.lines).toEqual([
          expect.objectContaining({ description: 'School bus', optedIn: true }),
        ]);

        const replay = await api(owner).put(url).send(body).expect(200);
        expect(replay.body).toMatchObject({ changed: 0, unchanged: 2 });
        expect(await optInRows(pool, busId)).toBe(2);
        expect(await optionRows(pool, orgA.id, 'fee_option')).toHaveLength(2);

        const off = await api(owner)
          .put(url)
          .send({ ...body, optedIn: false })
          .expect(200);
        expect(off.body).toMatchObject({ optedIn: false, changed: 2 });
        expect(await optInRows(pool, busId)).toBe(0);
        expect(await optionRows(pool, orgA.id, 'fee_option')).toHaveLength(4);
      });

      test('lists students who already opted in after the line is retired, and narrows by search', async ({
        api,
        app,
        pool,
        schools: { owner, studentLekki, studentIkeja },
      }) => {
        const fixture = await feeFixture(app, api, owner);
        const classLevelId = await levelOf(pool, studentLekki.id);
        const line = await createFeeLine({ app, actor: owner }, fixture, {
          classLevelId,
          name: 'School bus',
          feeType: 'School bus',
          amountMinor: 4_500_000,
          isOptional: true,
        });
        const busId = fixture.feeTypeId('School bus');
        const url = `/fee-types/${busId}/opt-ins`;
        const ids = async (q?: string) =>
          (
            (
              await api(owner)
                .get(url)
                .query({
                  termId: fixture.termId,
                  ...(q === undefined ? {} : { q }),
                })
                .expect(200)
            ).body as FeeOptIns
          ).items.map((row) => row.studentId);

        await api(owner)
          .put(url)
          .send({
            termId: fixture.termId,
            studentIds: [studentLekki.id],
            optedIn: true,
          })
          .expect(200);
        expect(await ids(studentLekki.admissionNumber)).toEqual([
          studentLekki.id,
        ]);
        await api(owner).post(`/fee-lines/${line.id}/retire`).expect(201);

        const listed = await ids();
        expect(listed).toContain(studentLekki.id);
        expect(listed).not.toContain(studentIkeja.id);
        await api(owner)
          .put(url)
          .send({
            termId: fixture.termId,
            studentIds: [studentIkeja.id],
            optedIn: true,
          })
          .expect(400);
      });

      test('answers 404 to another school on both routes and saves nothing', async ({
        api,
        app,
        pool,
        schools: { owner, ownerB, studentLekki, studentIkeja },
      }) => {
        const fixture = await feeFixture(app, api, owner);
        const fixtureB = await feeFixture(app, api, ownerB);
        await offerBus({ app, pool, actor: owner }, fixture, [
          studentLekki,
          studentIkeja,
        ]);
        const busId = fixture.feeTypeId('School bus');
        const busB = fixtureB.feeTypeId('School bus');
        const studentIds = [studentLekki.id, studentIkeja.id];

        await api(ownerB)
          .get(`/fee-types/${busId}/opt-ins`)
          .query({ termId: fixture.termId })
          .expect(404);
        await api(ownerB)
          .get(`/fee-types/${busB}/opt-ins`)
          .query({ termId: fixture.termId })
          .expect(404);
        await api(ownerB)
          .put(`/fee-types/${busId}/opt-ins`)
          .send({ termId: fixture.termId, studentIds, optedIn: true })
          .expect(404);
        await api(ownerB)
          .put(`/fee-types/${busB}/opt-ins`)
          .send({ termId: fixtureB.termId, studentIds, optedIn: true })
          .expect(404);
        await api(owner)
          .put(`/fee-types/${busId}/opt-ins`)
          .send({ termId: fixtureB.termId, studentIds, optedIn: true })
          .expect(404);
        await api(owner)
          .get(`/fee-types/${busB}/opt-ins`)
          .query({ termId: fixture.termId })
          .expect(404);
        expect(await optInRows(pool, busId)).toBe(0);
        expect(await optInRows(pool, busB)).toBe(0);
      });

      test('keeps other campuses out of the list and answers 404 with nothing saved when one student is out of scope', async ({
        api,
        app,
        pool,
        schools: { owner, lekkiOnly, studentLekki, studentIkeja },
      }) => {
        const fixture = await feeFixture(app, api, owner);
        await offerBus({ app, pool, actor: owner }, fixture, [
          studentLekki,
          studentIkeja,
        ]);
        const busId = fixture.feeTypeId('School bus');
        const url = `/fee-types/${busId}/opt-ins`;

        const scoped = (
          await api(lekkiOnly)
            .get(url)
            .query({ termId: fixture.termId })
            .expect(200)
        ).body as FeeOptIns;
        const scopedIds = scoped.items.map((row) => row.studentId);
        expect(scopedIds).toContain(studentLekki.id);
        expect(scopedIds).not.toContain(studentIkeja.id);

        await api(lekkiOnly)
          .put(url)
          .send({
            termId: fixture.termId,
            studentIds: [studentLekki.id, studentIkeja.id],
            optedIn: true,
          })
          .expect(404);
        expect(await optInRows(pool, busId)).toBe(0);

        const own = await api(lekkiOnly)
          .put(url)
          .send({
            termId: fixture.termId,
            studentIds: [studentLekki.id],
            optedIn: true,
          })
          .expect(200);
        expect(own.body).toMatchObject({ changed: 1, unchanged: 0 });
      });

      test('caps the list at the limit and reports the full total', async ({
        api,
        app,
        pool,
        schools: { owner, studentLekki },
      }) => {
        const fixture = await feeFixture(app, api, owner);
        await offerBus({ app, pool, actor: owner }, fixture, [studentLekki]);
        await pool.query(
          `INSERT INTO student
             (organization_id, campus_id, first_name, last_name, gender, date_of_birth, admission_number, admitted_on)
           SELECT organization_id, campus_id, 'Clone' || g, 'Bulk', gender, date_of_birth, 'CL-' || g, admitted_on
           FROM student, generate_series(1, $2::int) AS g
           WHERE id = $1`,
          [studentLekki.id, FEE_OPT_IN_LIMIT + 5]
        );
        await pool.query(
          `INSERT INTO student_enrollment (organization_id, student_id, session_id, class_level_id)
           SELECT e.organization_id, s.id, e.session_id, e.class_level_id
           FROM student_enrollment e
           JOIN student s ON s.organization_id = e.organization_id AND s.last_name = 'Bulk'
           WHERE e.student_id = $1`,
          [studentLekki.id]
        );
        const { rows } = await pool.query<{ count: number }>(
          `SELECT count(*)::int AS count FROM student_enrollment
           WHERE class_level_id = $1 AND status = 'active'`,
          [await levelOf(pool, studentLekki.id)]
        );

        const listed = (
          await api(owner)
            .get(`/fee-types/${fixture.feeTypeId('School bus')}/opt-ins`)
            .query({ termId: fixture.termId })
            .expect(200)
        ).body as FeeOptIns;

        expect(listed.items).toHaveLength(FEE_OPT_IN_LIMIT);
        expect(listed.total).toBe(rows[0]?.count);
        expect(listed.total).toBeGreaterThan(FEE_OPT_IN_LIMIT);
      });

      test('answers 403 without the permissions and for an acting super admin without a reason', async ({
        api,
        app,
        pool,
        withPermissions,
        makeSuperAdmin,
        createUser,
        schools: { owner, orgA, studentLekki },
      }) => {
        const fixture = await feeFixture(app, api, owner);
        await offerBus({ app, pool, actor: owner }, fixture, [studentLekki]);
        const busId = fixture.feeTypeId('School bus');
        const url = `/fee-types/${busId}/opt-ins`;
        const query = { termId: fixture.termId };
        const body = {
          termId: fixture.termId,
          studentIds: [studentLekki.id],
          optedIn: true,
        };

        const reader = await withPermissions(orgA, [
          'feeLine:read',
          'student:read',
        ]);
        await api(reader).get(url).query(query).expect(200);
        await api(reader).put(url).send(body).expect(403);
        const feeOnly = await withPermissions(orgA, ['feeLine:read']);
        await api(feeOnly).get(url).query(query).expect(403);
        const studentOnly = await withPermissions(orgA, ['student:read']);
        await api(studentOnly).get(url).query(query).expect(403);
        const writer = await withPermissions(orgA, [
          'feeLine:update',
          'campus:readAll',
        ]);
        await api(writer).put(url).send(body).expect(200);

        const admin = await makeSuperAdmin(await createUser());
        const refused = await api(admin)
          .put(url)
          .set(acting(orgA.id))
          .send({ ...body, optedIn: false })
          .expect(403);
        expect(refused.body.code).toBe('ActingReadOnly');
        await api(admin).get(url).query(query).set(acting(orgA.id)).expect(200);
        expect(await optInRows(pool, busId)).toBe(1);
      });
    });
  });

  test.describe('copy', () => {
    test('copies the live lines of the third term into the first term of the next year', async ({
      api,
      app,
      pool,
      schools: { owner, lekki },
    }) => {
      const { third, next } = await copyScenario(app, api, { owner, lekki });

      const copied = (
        await api(owner)
          .post('/fee-lines/copy')
          .send({ termId: next.id })
          .expect(201)
      ).body as FeeCopyResult;
      expect(copied).toEqual({
        copied: 4,
        sourceTerm: {
          id: third.id,
          name: 'Third term',
          schoolYearName: '2026/2027',
        },
      });

      const target = (
        await api(owner).get(`/fee-lines?termId=${next.id}`).expect(200)
      ).body as FeeLine[];
      expect(
        target.map((row) => row.name).toSorted((a, b) => a.localeCompare(b))
      ).toEqual(['Lekki tuition', 'PTA fee', 'School bus', 'Tuition']);
      const bus = target.find((row) => row.name === 'School bus');
      expect(bus).toMatchObject({
        amountMinor: 4_500_000,
        isOptional: true,
        feeTypeName: 'School bus',
      });
      expect(target.find((row) => row.name === 'PTA fee')?.appliesTo).toBe(
        'new'
      );
      expect(target.find((row) => row.name === 'Lekki tuition')?.campusId).toBe(
        lekki.id
      );
      expect(target.every((row) => row.retiredAt === null)).toBe(true);

      const source = (
        await api(owner).get(`/fee-lines?termId=${third.id}`).expect(200)
      ).body as FeeLine[];
      expect(source).toHaveLength(5);
      expect(source.filter((row) => row.retiredAt !== null)).toHaveLength(1);

      const { rows } = await pool.query<{ created_by: string }>(
        'SELECT created_by FROM fee_line WHERE term_id = $1',
        [next.id]
      );
      expect(rows.map((row) => row.created_by)).toEqual(
        Array.from({ length: 4 }, () => owner.id)
      );
    });

    test('answers 409 for a second copy and saves nothing', async ({
      api,
      app,
      schools: { owner, lekki },
    }) => {
      const { next } = await copyScenario(app, api, { owner, lekki });
      await api(owner)
        .post('/fee-lines/copy')
        .send({ termId: next.id })
        .expect(201);

      const second = await api(owner)
        .post('/fee-lines/copy')
        .send({ termId: next.id })
        .expect(409);
      expect(second.body.message).toBe(
        'First term, 2027/2028 already has fees. Change them one at a time instead.'
      );
      const target = (
        await api(owner).get(`/fee-lines?termId=${next.id}`).expect(200)
      ).body as FeeLine[];
      expect(target).toHaveLength(4);
    });

    test('refuses a Lekki bursar and a member holding only feeLine:read with 403', async ({
      api,
      app,
      withPermissions,
      schools: { owner, orgA, lekkiOnly, lekki },
    }) => {
      const { next } = await copyScenario(app, api, { owner, lekki });
      const refused = await api(lekkiOnly)
        .post('/fee-lines/copy')
        .send({ termId: next.id })
        .expect(403);
      expect(refused.body.message).toBe(FEE_EVERY_CAMPUS_MESSAGE);
      const reader = await withPermissions(orgA, ['feeLine:read']);
      await api(reader)
        .post('/fee-lines/copy')
        .send({ termId: next.id })
        .expect(403);
      await api(reader)
        .get(`/fee-lines/copy-source?termId=${next.id}`)
        .expect(200);
      const target = (
        await api(owner).get(`/fee-lines?termId=${next.id}`).expect(200)
      ).body as FeeLine[];
      expect(target).toEqual([]);
    });

    test('answers 400 for a term that has ended', async ({
      api,
      app,
      clock,
      schools: { owner, lekki },
    }) => {
      const { next } = await copyScenario(app, api, { owner, lekki });
      clock.set('2029-01-10');
      const ended = await api(owner)
        .post('/fee-lines/copy')
        .send({ termId: next.id })
        .expect(400);
      expect(ended.body.message).toBe(FEE_TERM_ENDED_MESSAGE);
    });

    test('answers 400 when there is no earlier term', async ({
      api,
      app,
      schools: { owner },
    }) => {
      await feeFixture(app, api, owner);
      const first = await termOf(api, owner, {
        year: '2026/2027',
        sequence: 1,
      });
      const refused = await api(owner)
        .post('/fee-lines/copy')
        .send({ termId: first.id })
        .expect(400);
      expect(refused.body.message).toBe(FEE_COPY_NO_SOURCE_MESSAGE);
    });

    test('reports the source term, its live count and whether the target has lines', async ({
      api,
      app,
      schools: { owner, lekki },
    }) => {
      const { next, third, inThird } = await copyScenario(app, api, {
        owner,
        lekki,
      });
      const before = (
        await api(owner)
          .get(`/fee-lines/copy-source?termId=${next.id}`)
          .expect(200)
      ).body as FeeCopySource;
      expect(before).toEqual({
        sourceTerm: {
          id: third.id,
          name: 'Third term',
          schoolYearName: '2026/2027',
        },
        liveLineCount: 4,
        targetHasLines: false,
      });

      await createFeeLine(
        { app, actor: owner },
        { ...inThird, termId: next.id },
        {
          name: 'Tuition',
          amountMinor: 19_000_000,
        }
      );
      const after = (
        await api(owner)
          .get(`/fee-lines/copy-source?termId=${next.id}`)
          .expect(200)
      ).body as FeeCopySource;
      expect(after.targetHasLines).toBe(true);
    });

    test('treats a target term with only retired lines as empty', async ({
      api,
      app,
      schools: { owner, lekki },
    }) => {
      const { next, inThird } = await copyScenario(app, api, { owner, lekki });
      const stale = await createFeeLine(
        { app, actor: owner },
        { ...inThird, termId: next.id },
        { name: 'Tuition', amountMinor: 19_000_000 }
      );
      await api(owner).post(`/fee-lines/${stale.id}/retire`).expect(201);

      const before = (
        await api(owner)
          .get(`/fee-lines/copy-source?termId=${next.id}`)
          .expect(200)
      ).body as FeeCopySource;
      expect(before.targetHasLines).toBe(false);
      await api(owner)
        .post('/fee-lines/copy')
        .send({ termId: next.id })
        .expect(201);
      const target = (
        await api(owner).get(`/fee-lines?termId=${next.id}`).expect(200)
      ).body as FeeLine[];
      expect(target.filter((row) => row.retiredAt === null)).toHaveLength(4);
    });

    test('answers 409 to the second of two concurrent copies and saves one set of lines', async ({
      api,
      app,
      pool,
      schools: { owner, lekki },
    }) => {
      const { next } = await copyScenario(app, api, { owner, lekki });
      const statuses = (
        await Promise.all(
          [1, 2].map(() =>
            api(owner).post('/fee-lines/copy').send({ termId: next.id })
          )
        )
      )
        .map((res) => res.status)
        .toSorted((a, b) => a - b);
      expect(statuses).toEqual([201, 409]);
      const target = (
        await api(owner).get(`/fee-lines?termId=${next.id}`).expect(200)
      ).body as FeeLine[];
      expect(target).toHaveLength(4);
      const { rows } = await pool.query(
        `SELECT campus_id FROM activity_event WHERE kind = 'fee_lines.copied' AND subject_id = $1`,
        [next.id]
      );
      expect(rows).toHaveLength(2);
    });
  });
});

bareSchoolsTest.describe('fee setup before a school year exists', () => {
  bareSchoolsTest(
    'answers with no terms while the school has no current term',
    async ({ api, schools: { ownerB } }) => {
      const setup = (await api(ownerB).get('/fee-lines/setup').expect(200))
        .body as FeeSetup;
      expect(setup.terms).toEqual([]);
    }
  );
});
