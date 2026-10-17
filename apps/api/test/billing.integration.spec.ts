import {
  BILLING_ALREADY_SENT_MESSAGE,
  BILLING_CANCELLED_MESSAGE,
  BILLING_ONLY_DRAFTS_MESSAGE,
  BILLING_OUT_OF_SCOPE_MESSAGE,
  BILLING_TERM_MESSAGE,
  type BillingRunList,
  type BillingTerm,
  type DashboardCharged,
  type DashboardTask,
  type FeeLine,
  type FeePreview,
} from '@eduvault/api-contract';
import { acting, expect } from './support/base-test';
import {
  BUS_MINOR,
  TUITION_MINOR,
  addDiscount,
  chargeFixture,
  entriesFor,
  invoicesOf,
  prepare,
  receivableBalance,
  runOf,
  sendRun,
} from './support/factories/billing';
import { createClass } from './support/factories/classes';
import { createFeeLine, feeFixture } from './support/factories/fees';
import { ledgerAccountId } from './support/factories/finance';
import { createStudent } from './support/factories/students';
import { makeCurrent } from './support/factories/terms';
import { schoolsTest as test } from './support/two-schools';

const SECOND_TERM_TOTAL = TUITION_MINOR + BUS_MINOR;

const notCharged = (tasks: DashboardTask[]) =>
  tasks.find((task) => task.kind === 'notCharged');

test.describe('charge students', () => {
  test('prepares a draft charge per student with the fee lines of the term', async ({
    api,
    app,
    schools: { owner, studentLekki, studentIkeja },
  }) => {
    const fixture = await chargeFixture(app, api, owner);

    const result = await prepare(api, owner, {
      termId: fixture.secondTermId,
      scope: 'school',
    });

    expect(result).toMatchObject({
      created: 2,
      skipped: 0,
      none: 0,
      termId: fixture.secondTermId,
    });
    expect(result.number).toMatch(/^BR-\d{4}-0001$/);
    const run = await runOf(api, owner, result.runId ?? '');
    expect(run).toMatchObject({
      status: 'draft',
      scopeLabel: 'Whole school',
      chargeCount: 2,
      totalMinor: 2 * SECOND_TERM_TOTAL,
      feesChangedSincePrepared: false,
      sentCount: 0,
    });
    expect(
      run.charges
        .map((charge) => charge.studentId)
        .toSorted((a, b) => a.localeCompare(b))
    ).toEqual(
      [studentLekki.id, studentIkeja.id].toSorted((a, b) => a.localeCompare(b))
    );
    for (const charge of run.charges) {
      expect(charge).toMatchObject({
        number: null,
        status: 'draft',
        kind: 'term',
        feeCount: 2,
        totalMinor: SECOND_TERM_TOTAL,
      });
    }
  });

  test('prepares nothing twice: a second prepare skips and consumes no round number', async ({
    api,
    app,
    schools: { owner },
  }) => {
    const fixture = await chargeFixture(app, api, owner);
    const body = { termId: fixture.secondTermId, scope: 'school' } as const;
    const first = await prepare(api, owner, body);
    const again = await prepare(api, owner, body);

    expect(again).toEqual({
      runId: null,
      number: null,
      created: 0,
      skipped: 2,
      none: 0,
      termId: fixture.secondTermId,
    });

    await api(owner).post(`/billing-runs/${first.runId}/cancel`).expect(201);
    const third = await prepare(api, owner, body);
    expect(third.created).toBe(2);
    expect(third.number).toMatch(/^BR-\d{4}-0002$/);
  });

  test('two prepares at the same moment charge each student once', async ({
    api,
    app,
    schools: { owner },
  }) => {
    const fixture = await chargeFixture(app, api, owner);
    const body = { termId: fixture.secondTermId, scope: 'school' } as const;

    const results = await Promise.all([
      prepare(api, owner, body),
      prepare(api, owner, body),
    ]);

    expect(results.reduce((sum, result) => sum + result.created, 0)).toBe(2);
    expect(results.reduce((sum, result) => sum + result.skipped, 0)).toBe(2);
    const list = (await api(owner).get('/billing-runs').expect(200))
      .body as BillingRunList;
    expect(list.items.reduce((sum, run) => sum + run.chargeCount, 0)).toBe(2);
    expect((await invoicesOf(api, owner)).total).toBe(2);
  });

  test('charges each student once when overlapping prepares run at the same moment', async ({
    api,
    app,
    schools: { owner, lekki },
  }) => {
    const fixture = await chargeFixture(app, api, owner);
    const termId = fixture.secondTermId;

    const results = await Promise.all([
      prepare(api, owner, { termId, scope: 'school' }),
      prepare(api, owner, { termId, scope: 'campus', scopeId: lekki.id }),
      prepare(api, owner, { termId, scope: 'school' }),
    ]);

    expect(results.reduce((sum, result) => sum + result.created, 0)).toBe(2);
    expect((await invoicesOf(api, owner)).total).toBe(2);
  });

  test('refuses a term that is neither the current nor the next', async ({
    api,
    app,
    schools: { owner },
  }) => {
    const fixture = await chargeFixture(app, api, owner);
    const res = await api(owner)
      .post('/billing-runs')
      .send({ termId: fixture.thirdTermId, scope: 'school' })
      .expect(400);
    expect(res.body.message).toBe(BILLING_TERM_MESSAGE);
  });

  test('refuses a term that has already passed', async ({
    api,
    app,
    schools: { owner },
  }) => {
    const fixture = await chargeFixture(app, api, owner);
    await makeCurrent(api, owner, { year: '2026/2027', sequence: 2 });

    const res = await api(owner)
      .post('/billing-runs')
      .send({ termId: fixture.firstTermId, scope: 'school' })
      .expect(400);

    expect(res.body.message).toBe(BILLING_TERM_MESSAGE);
  });

  test('leaves out students whose enrolment is withdrawn or completed without counting them', async ({
    api,
    app,
    pool,
    schools: { owner, studentLekki, studentIkeja },
  }) => {
    const fixture = await chargeFixture(app, api, owner);
    await pool.query(
      `UPDATE student_enrollment SET status = 'withdrawn' WHERE student_id = $1`,
      [studentLekki.id]
    );
    await pool.query(
      `UPDATE student_enrollment SET status = 'completed' WHERE student_id = $1`,
      [studentIkeja.id]
    );

    const result = await prepare(api, owner, {
      termId: fixture.secondTermId,
      scope: 'school',
    });

    expect(result).toMatchObject({
      runId: null,
      created: 0,
      skipped: 0,
      none: 0,
    });
  });

  test('refuses a campus or level scope with no id', async ({
    api,
    app,
    schools: { owner },
  }) => {
    const fixture = await chargeFixture(app, api, owner);
    for (const scope of ['campus', 'level']) {
      await api(owner)
        .post('/billing-runs')
        .send({ termId: fixture.secondTermId, scope })
        .expect(400);
    }
  });

  test('counts a student with no fee lines for their level as none', async ({
    api,
    app,
    schools: { owner, lekki, studentLekki },
  }) => {
    const fixture = await chargeFixture(app, api, owner);
    const upper = await createClass(app, owner, {
      campusId: lekki.id,
      levelCode: 'JSS2',
    });
    const jss2 = await createStudent(app, owner, {
      campusId: lekki.id,
      classArmId: upper.id,
    });

    const result = await prepare(api, owner, {
      termId: fixture.secondTermId,
      scope: 'school',
    });

    expect(result).toMatchObject({ created: 2, skipped: 0, none: 1 });
    const run = await runOf(api, owner, result.runId ?? '');
    expect(run.charges.map((charge) => charge.studentId)).not.toContain(
      jss2.id
    );
    expect(run.charges.map((charge) => charge.studentId)).toContain(
      studentLekki.id
    );
  });

  test('leaves out inactive and departed students without counting them', async ({
    api,
    app,
    pool,
    clock,
    schools: { owner, studentLekki, studentIkeja },
  }) => {
    clock.set('2026-10-16');
    const fixture = await chargeFixture(app, api, owner);
    await pool.query(
      `UPDATE student SET not_seen_since = '2026-08-01' WHERE id = $1`,
      [studentLekki.id]
    );
    await api(owner)
      .post(`/students/${studentIkeja.id}/leave`)
      .send({ reason: 'relocated', lastDay: '2026-10-01' })
      .expect(201);

    const result = await prepare(api, owner, {
      termId: fixture.secondTermId,
      scope: 'school',
    });

    expect(result).toMatchObject({
      runId: null,
      created: 0,
      skipped: 0,
      none: 0,
    });
  });

  test('freezes the campus on the charge and charges only the chosen campus', async ({
    api,
    app,
    pool,
    schools: { owner, lekki, ikeja, studentLekki },
  }) => {
    const fixture = await chargeFixture(app, api, owner);

    const result = await prepare(api, owner, {
      termId: fixture.secondTermId,
      scope: 'campus',
      scopeId: lekki.id,
    });

    expect(result.created).toBe(1);
    const run = await runOf(api, owner, result.runId ?? '');
    expect(run.scopeLabel).toBe('Campus: Lekki');
    expect(run.charges.map((charge) => charge.studentId)).toEqual([
      studentLekki.id,
    ]);
    const { rows } = await pool.query<{ campus_id: string }>(
      'SELECT campus_id FROM invoice WHERE billing_run_id = $1',
      [result.runId]
    );
    expect(rows.map((row) => row.campus_id)).toEqual([lekki.id]);
    const other = await prepare(api, owner, {
      termId: fixture.secondTermId,
      scope: 'campus',
      scopeId: ikeja.id,
    });
    expect(other.created).toBe(1);
  });

  test('charges one level only', async ({
    api,
    app,
    pool,
    schools: { owner, orgA },
  }) => {
    const fixture = await chargeFixture(app, api, owner);
    const { rows } = await pool.query<{ id: string }>(
      `SELECT id FROM class_level WHERE organization_id = $1 AND code = 'JSS2'`,
      [orgA.id]
    );
    const none = await prepare(api, owner, {
      termId: fixture.secondTermId,
      scope: 'level',
      scopeId: rows[0]?.id ?? '',
    });
    expect(none).toMatchObject({
      created: 0,
      skipped: 0,
      none: 0,
      runId: null,
    });
  });

  test('reports the already-charged students of a campus or level round as skipped and leaves the others uncounted', async ({
    api,
    app,
    pool,
    schools: { owner, orgA, lekki, ikeja },
  }) => {
    const fixture = await chargeFixture(app, api, owner);
    const upper = await createClass(app, owner, {
      campusId: lekki.id,
      levelCode: 'JSS2',
    });
    await createStudent(app, owner, {
      campusId: lekki.id,
      classArmId: upper.id,
    });
    const { rows } = await pool.query<{ id: string }>(
      `SELECT id FROM class_level WHERE organization_id = $1 AND code = 'JSS1'`,
      [orgA.id]
    );
    const campus = {
      termId: fixture.secondTermId,
      scope: 'campus',
      scopeId: lekki.id,
    } as const;

    expect(await prepare(api, owner, campus)).toMatchObject({
      created: 1,
      skipped: 0,
      none: 1,
    });
    expect(await prepare(api, owner, campus)).toMatchObject({
      created: 0,
      skipped: 1,
      none: 1,
      runId: null,
    });

    const level = await prepare(api, owner, {
      termId: fixture.secondTermId,
      scope: 'level',
      scopeId: rows[0]?.id ?? '',
    });
    expect(level).toMatchObject({ created: 1, skipped: 1, none: 0 });

    expect(
      await prepare(api, owner, {
        termId: fixture.secondTermId,
        scope: 'campus',
        scopeId: ikeja.id,
      })
    ).toMatchObject({ created: 0, skipped: 1, none: 0, runId: null });
  });
});

test.describe('send and cancel', () => {
  test('sends every charge, numbering by surname and posting a balanced entry each', async ({
    api,
    app,
    pool,
    schools: { owner, orgA, lekki, studentLekki, studentIkeja },
  }) => {
    const fixture = await chargeFixture(app, api, owner);
    const { runId } = await prepare(api, owner, {
      termId: fixture.secondTermId,
      scope: 'school',
    });

    const sent = await sendRun(api, owner, runId ?? '');

    expect(sent).toMatchObject({
      status: 'issued',
      sentCount: 2,
      totalMinor: 2 * SECOND_TERM_TOTAL,
    });
    expect(sent.issuedAt).not.toBeNull();
    const numbers = sent.charges.map((charge) => charge.number);
    expect(
      numbers.every((number) => /^CHG-\d{4}-\d{5}$/.test(number ?? ''))
    ).toBe(true);
    expect(new Set(numbers).size).toBe(2);
    for (const charge of sent.charges) {
      const lines = await entriesFor(pool, orgA.id, charge.number ?? '');
      const debits = lines.reduce(
        (sum, line) => sum + Number(line.debit_minor),
        0
      );
      const credits = lines.reduce(
        (sum, line) => sum + Number(line.credit_minor),
        0
      );
      expect(debits).toBe(SECOND_TERM_TOTAL);
      expect(credits).toBe(SECOND_TERM_TOTAL);
      expect(
        lines
          .filter((line) => line.code === 1100)
          .every((line) => line.student_id === charge.studentId)
      ).toBe(true);
    }
    expect(await receivableBalance(pool, orgA.id, studentLekki.id)).toBe(
      SECOND_TERM_TOTAL
    );
    expect(await receivableBalance(pool, orgA.id, studentIkeja.id)).toBe(
      SECOND_TERM_TOTAL
    );
    const lekkiCharge = sent.charges.find(
      (charge) => charge.studentId === studentLekki.id
    );
    const lekkiLines = await entriesFor(
      pool,
      orgA.id,
      lekkiCharge?.number ?? ''
    );
    expect(lekkiLines.every((line) => line.campus_id === lekki.id)).toBe(true);
  });

  test('refuses a second send and a cancel of a sent round without posting again', async ({
    api,
    app,
    pool,
    schools: { owner },
  }) => {
    const fixture = await chargeFixture(app, api, owner);
    const { runId } = await prepare(api, owner, {
      termId: fixture.secondTermId,
      scope: 'school',
    });
    await sendRun(api, owner, runId ?? '');
    const entries = async () =>
      Number(
        (
          await pool.query<{ total: string }>(
            `SELECT count(*)::text AS total FROM journal_entry WHERE kind = 'invoice'`
          )
        ).rows[0]?.total
      );
    const before = await entries();

    const again = await api(owner)
      .post(`/billing-runs/${runId}/issue`)
      .expect(409);
    const cancel = await api(owner)
      .post(`/billing-runs/${runId}/cancel`)
      .expect(409);

    expect(again.body.message).toBe(BILLING_ALREADY_SENT_MESSAGE);
    expect(cancel.body.message).toBe(BILLING_ONLY_DRAFTS_MESSAGE);
    expect(await entries()).toBe(before);
  });

  test('sends a round once when two sends arrive together', async ({
    api,
    app,
    pool,
    schools: { owner },
  }) => {
    const fixture = await chargeFixture(app, api, owner);
    const { runId } = await prepare(api, owner, {
      termId: fixture.secondTermId,
      scope: 'school',
    });

    const statuses = await Promise.all([
      api(owner).post(`/billing-runs/${runId}/issue`),
      api(owner).post(`/billing-runs/${runId}/issue`),
    ]).then((responses) => responses.map((response) => response.status));

    expect(statuses.toSorted((a, b) => a - b)).toEqual([201, 409]);
    const { rows } = await pool.query<{ total: string }>(
      `SELECT count(*)::text AS total FROM journal_entry WHERE kind = 'invoice'`
    );
    expect(rows[0]?.total).toBe('2');
  });

  test('cancels a draft round, posts nothing and frees the students', async ({
    api,
    app,
    pool,
    schools: { owner },
  }) => {
    const fixture = await chargeFixture(app, api, owner);
    const body = { termId: fixture.secondTermId, scope: 'school' } as const;
    const { runId } = await prepare(api, owner, body);

    const cancelled = (
      await api(owner).post(`/billing-runs/${runId}/cancel`).expect(201)
    ).body;

    expect(cancelled).toMatchObject({
      status: 'cancelled',
      cancelledBy: expect.any(String),
    });
    expect(
      cancelled.charges.map((charge: { status: string }) => charge.status)
    ).toEqual(['cancelled', 'cancelled']);
    const { rows } = await pool.query<{ total: string }>(
      `SELECT count(*)::text AS total FROM journal_entry`
    );
    expect(rows[0]?.total).toBe('0');
    const again = await api(owner)
      .post(`/billing-runs/${runId}/issue`)
      .expect(409);
    expect(again.body.message).toBe(BILLING_CANCELLED_MESSAGE);
    expect((await prepare(api, owner, body)).created).toBe(2);
  });

  test('refuses to cancel a round that was already cancelled', async ({
    api,
    app,
    schools: { owner },
  }) => {
    const fixture = await chargeFixture(app, api, owner);
    const { runId } = await prepare(api, owner, {
      termId: fixture.secondTermId,
      scope: 'school',
    });
    await api(owner).post(`/billing-runs/${runId}/cancel`).expect(201);

    const again = await api(owner)
      .post(`/billing-runs/${runId}/cancel`)
      .expect(409);

    expect(again.body.message).toBe(BILLING_ONLY_DRAFTS_MESSAGE);
  });

  test('posts the campus a charge was prepared for even after the student moves', async ({
    api,
    app,
    pool,
    schools: { owner, orgA, lekki, ikeja, studentLekki },
  }) => {
    const fixture = await chargeFixture(app, api, owner);
    const { runId } = await prepare(api, owner, {
      termId: fixture.secondTermId,
      scope: 'school',
    });
    await pool.query(
      `UPDATE enrollment_placement SET campus_id = $2
       WHERE enrollment_id IN (SELECT id FROM student_enrollment WHERE student_id = $1)`,
      [studentLekki.id, ikeja.id]
    );

    const sent = await sendRun(api, owner, runId ?? '');

    const moved = sent.charges.find(
      (charge) => charge.studentId === studentLekki.id
    );
    const lines = await entriesFor(pool, orgA.id, moved?.number ?? '');
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.every((line) => line.campus_id === lekki.id)).toBe(true);
  });

  test('sends a student who left between prepare and send', async ({
    api,
    app,
    schools: { owner, studentIkeja },
  }) => {
    const fixture = await chargeFixture(app, api, owner);
    const { runId } = await prepare(api, owner, {
      termId: fixture.secondTermId,
      scope: 'school',
    });
    await api(owner)
      .post(`/students/${studentIkeja.id}/leave`)
      .send({
        reason: 'relocated',
        lastDay: new Date().toISOString().slice(0, 10),
      })
      .expect(201);

    const sent = await sendRun(api, owner, runId ?? '');

    expect(sent.sentCount).toBe(2);
  });
});

test.describe('discounts on a charge', () => {
  test('applies an approved sibling discount to the fee type and posts it to Discounts given', async ({
    api,
    app,
    pool,
    schools: { owner, orgA, studentLekki },
  }) => {
    const fixture = await chargeFixture(app, api, owner);
    const tuition = await ledgerAccountId(pool, orgA.id, 4010);
    await addDiscount(pool, {
      organizationId: orgA.id,
      studentId: studentLekki.id,
      fromTermId: fixture.firstTermId,
      feeTypeId: tuition,
    });
    const { runId } = await prepare(api, owner, {
      termId: fixture.secondTermId,
      scope: 'school',
    });
    const run = await runOf(api, owner, runId ?? '');
    const draft = run.charges.find(
      (charge) => charge.studentId === studentLekki.id
    );
    expect(draft?.totalMinor).toBe(SECOND_TERM_TOTAL - 900_000);

    const sent = await sendRun(api, owner, runId ?? '');

    const charge = sent.charges.find(
      (row) => row.studentId === studentLekki.id
    );
    const lines = await entriesFor(pool, orgA.id, charge?.number ?? '');
    expect(
      lines.filter((line) => line.code === 5000).map((line) => line.debit_minor)
    ).toEqual(['900000']);
    expect(await receivableBalance(pool, orgA.id, studentLekki.id)).toBe(
      SECOND_TERM_TOTAL - 900_000
    );
  });

  test('ignores a discount that is waiting for approval', async ({
    api,
    app,
    pool,
    schools: { owner, orgA, studentLekki },
  }) => {
    const fixture = await chargeFixture(app, api, owner);
    await addDiscount(pool, {
      organizationId: orgA.id,
      studentId: studentLekki.id,
      fromTermId: fixture.firstTermId,
      status: 'submitted',
      kind: 'percent',
      value: 50,
    });
    const { runId } = await prepare(api, owner, {
      termId: fixture.secondTermId,
      scope: 'school',
    });
    const run = await runOf(api, owner, runId ?? '');
    expect(
      run.charges.every((charge) => charge.totalMinor === SECOND_TERM_TOTAL)
    ).toBe(true);
  });
});

test.describe('terms to charge', () => {
  test('marks the default term and how much of each is charged', async ({
    api,
    app,
    schools: { owner },
  }) => {
    const fixture = await chargeFixture(app, api, owner);
    const before = (await api(owner).get('/billing-runs/terms').expect(200))
      .body as BillingTerm[];
    expect(
      before.map((term) => [term.termId, term.charged, term.isDefault])
    ).toEqual([
      [fixture.firstTermId, 'none', true],
      [fixture.secondTermId, 'none', false],
    ]);

    await prepare(api, owner, { termId: fixture.firstTermId, scope: 'school' });
    const after = (await api(owner).get('/billing-runs/terms').expect(200))
      .body as BillingTerm[];
    expect(after.map((term) => [term.charged, term.isDefault])).toEqual([
      ['all', false],
      ['none', true],
    ]);
  });

  test('offers only the levels with an enrolment in the term’s year', async ({
    api,
    app,
    schools: { owner },
  }) => {
    await chargeFixture(app, api, owner);
    const levels = (await api(owner).get('/class-levels').expect(200)).body as {
      id: string;
      code: string;
    }[];
    const jss1 = levels.find((level) => level.code === 'JSS1');

    const terms = (await api(owner).get('/billing-runs/terms').expect(200))
      .body as BillingTerm[];

    expect(terms.map((term) => term.levelIds)).toEqual([
      [jss1?.id],
      [jss1?.id],
    ]);
    expect(levels.length).toBeGreaterThan(1);
  });

  test('says partly charged after one campus is charged', async ({
    api,
    app,
    schools: { owner, lekki },
  }) => {
    const fixture = await chargeFixture(app, api, owner);
    await prepare(api, owner, {
      termId: fixture.firstTermId,
      scope: 'campus',
      scopeId: lekki.id,
    });
    const terms = (await api(owner).get('/billing-runs/terms').expect(200))
      .body as BillingTerm[];
    expect(terms[0]).toMatchObject({ charged: 'partly', isDefault: true });
  });
});

test.describe('campus scope', () => {
  test('a Lekki bursar prepares only Lekki students and sees only Lekki rounds', async ({
    api,
    app,
    schools: { owner, lekkiOnly, ikeja, studentLekki },
  }) => {
    const fixture = await chargeFixture(app, api, owner);
    const mine = await prepare(api, lekkiOnly, {
      termId: fixture.secondTermId,
      scope: 'school',
    });
    expect(mine.created).toBe(1);
    const theirs = await prepare(api, owner, {
      termId: fixture.firstTermId,
      scope: 'campus',
      scopeId: ikeja.id,
    });
    expect(theirs.created).toBe(1);

    const list = (await api(lekkiOnly).get('/billing-runs').expect(200))
      .body as BillingRunList;
    expect(list.items.map((run) => run.id)).toEqual([mine.runId]);
    await api(lekkiOnly).get(`/billing-runs/${theirs.runId}`).expect(404);
    expect(
      (await invoicesOf(api, lekkiOnly)).items.map((c) => c.studentId)
    ).toEqual([studentLekki.id]);
  });

  test('answers 404 to send or cancel a round with no charge on the caller’s campuses', async ({
    api,
    app,
    pool,
    schools: { owner, lekkiOnly, ikeja },
  }) => {
    const fixture = await chargeFixture(app, api, owner);
    const { runId } = await prepare(api, owner, {
      termId: fixture.secondTermId,
      scope: 'campus',
      scopeId: ikeja.id,
    });

    await api(lekkiOnly).post(`/billing-runs/${runId}/issue`).expect(404);
    await api(lekkiOnly).post(`/billing-runs/${runId}/cancel`).expect(404);

    expect((await runOf(api, owner, runId ?? '')).status).toBe('draft');
    const { rows } = await pool.query<{ total: string }>(
      `SELECT count(*)::text AS total FROM journal_entry`
    );
    expect(rows[0]?.total).toBe('0');
  });

  test('refuses to send or cancel a round holding charges on other campuses', async ({
    api,
    app,
    pool,
    schools: { owner, lekkiOnly },
  }) => {
    const fixture = await chargeFixture(app, api, owner);
    const { runId } = await prepare(api, owner, {
      termId: fixture.secondTermId,
      scope: 'school',
    });

    const send = await api(lekkiOnly)
      .post(`/billing-runs/${runId}/issue`)
      .expect(403);
    const cancel = await api(lekkiOnly)
      .post(`/billing-runs/${runId}/cancel`)
      .expect(403);

    expect(send.body.message).toBe(BILLING_OUT_OF_SCOPE_MESSAGE);
    expect(cancel.body.message).toBe(BILLING_OUT_OF_SCOPE_MESSAGE);
    expect((await runOf(api, owner, runId ?? '')).status).toBe('draft');
    const { rows } = await pool.query<{ total: string }>(
      `SELECT count(*)::text AS total FROM journal_entry`
    );
    expect(rows[0]?.total).toBe('0');
  });
});

test.describe('numbering and fee changes', () => {
  test('numbers the charges by surname, first name and admission number', async ({
    api,
    app,
    schools: { owner, lekki },
  }) => {
    const fixture = await chargeFixture(app, api, owner);
    await createStudent(app, owner, {
      campusId: lekki.id,
      firstName: 'Zara',
      lastName: 'Adeyemi',
    });
    await createStudent(app, owner, {
      campusId: lekki.id,
      firstName: 'Bayo',
      lastName: 'Adeyemi',
    });
    const { runId } = await prepare(api, owner, {
      termId: fixture.secondTermId,
      scope: 'school',
    });

    const sent = await sendRun(api, owner, runId ?? '');

    const byNumber = sent.charges.toSorted((a, b) =>
      (a.number ?? '').localeCompare(b.number ?? '')
    );
    expect(byNumber.map((charge) => charge.studentName)).toEqual([
      'Bayo Adeyemi',
      'Zara Adeyemi',
      expect.stringContaining('Tester'),
      expect.stringContaining('Tester'),
    ]);
  });

  test('flags a draft round whose fees changed and keeps its drafts as prepared', async ({
    api,
    app,
    schools: { owner },
  }) => {
    const fixture = await chargeFixture(app, api, owner);
    const { runId } = await prepare(api, owner, {
      termId: fixture.secondTermId,
      scope: 'school',
    });
    expect(
      (await runOf(api, owner, runId ?? '')).feesChangedSincePrepared
    ).toBe(false);
    const lines = (
      await api(owner)
        .get(`/fee-lines?termId=${fixture.secondTermId}`)
        .expect(200)
    ).body as FeeLine[];
    const tuition = lines.find((line) => line.feeTypeName === 'Tuition');

    await api(owner)
      .patch(`/fee-lines/${tuition?.id}`)
      .send({ amountMinor: TUITION_MINOR + 1_000_000 })
      .expect(200);

    const run = await runOf(api, owner, runId ?? '');
    expect(run.feesChangedSincePrepared).toBe(true);
    expect(run.totalMinor).toBe(2 * SECOND_TERM_TOTAL);
    const sent = await sendRun(api, owner, runId ?? '');
    expect(sent.feesChangedSincePrepared).toBe(false);
    expect(sent.totalMinor).toBe(2 * SECOND_TERM_TOTAL);
  });

  test('cuts a second discount so the fee type never goes below zero', async ({
    api,
    app,
    pool,
    schools: { owner, orgA, studentLekki },
  }) => {
    const fixture = await chargeFixture(app, api, owner);
    const tuition = await ledgerAccountId(pool, orgA.id, 4010);
    const base = {
      organizationId: orgA.id,
      studentId: studentLekki.id,
      fromTermId: fixture.firstTermId,
      feeTypeId: tuition,
    };
    await addDiscount(pool, {
      ...base,
      value: 60,
      reason: 'Scholarship',
      approvedAt: '2026-09-01T10:00:00Z',
    });
    await addDiscount(pool, {
      ...base,
      value: 50,
      reason: 'Staff child',
      approvedAt: '2026-09-02T10:00:00Z',
    });
    const { runId } = await prepare(api, owner, {
      termId: fixture.secondTermId,
      scope: 'school',
    });
    const run = await runOf(api, owner, runId ?? '');
    const charge = run.charges.find((c) => c.studentId === studentLekki.id);

    expect(charge?.totalMinor).toBe(BUS_MINOR);
    const invoice = await api(owner).get(`/invoices/${charge?.id}`).expect(200);
    expect(
      (invoice.body.lines as { amountMinor: number }[])
        .filter((line) => line.amountMinor < 0)
        .map((line) => line.amountMinor)
    ).toEqual([-10_800_000, -7_200_000]);
  });

  test('previews exactly the lines a prepare puts on the charge', async ({
    api,
    app,
    pool,
    schools: { owner, orgA, studentLekki },
  }) => {
    const fixture = await chargeFixture(app, api, owner);
    await addDiscount(pool, {
      organizationId: orgA.id,
      studentId: studentLekki.id,
      fromTermId: fixture.firstTermId,
      feeTypeId: await ledgerAccountId(pool, orgA.id, 4010),
    });
    await addDiscount(pool, {
      organizationId: orgA.id,
      studentId: studentLekki.id,
      fromTermId: fixture.secondTermId,
      status: 'submitted',
      reason: 'Academic scholarship, top of JSS 1',
      value: 50,
    });
    const query = `termId=${fixture.secondTermId}&studentId=${studentLekki.id}`;
    const before = (
      await api(owner).get(`/fee-lines/preview?${query}`).expect(200)
    ).body as FeePreview;
    expect(before.charged).toBeNull();
    expect(before.pendingDiscounts).toEqual([
      'Academic scholarship, top of JSS 1',
    ]);

    const { runId } = await prepare(api, owner, {
      termId: fixture.secondTermId,
      scope: 'school',
    });
    const charge = (await runOf(api, owner, runId ?? '')).charges.find(
      (row) => row.studentId === studentLekki.id
    );
    const invoice = await api(owner).get(`/invoices/${charge?.id}`).expect(200);

    expect(
      before.lines.map((line) => [line.description, line.amountMinor])
    ).toEqual(
      (
        invoice.body.lines as { description: string; amountMinor: number }[]
      ).map((line) => [line.description, line.amountMinor])
    );
    expect(before.totalMinor).toBe(charge?.totalMinor);
    const after = (
      await api(owner).get(`/fee-lines/preview?${query}`).expect(200)
    ).body as FeePreview;
    expect(after.charged).toEqual({ status: 'draft', number: null });
    const sent = await sendRun(api, owner, runId ?? '');
    const number = sent.charges.find(
      (row) => row.studentId === studentLekki.id
    )?.number;
    const final = (
      await api(owner).get(`/fee-lines/preview?${query}`).expect(200)
    ).body as FeePreview;
    expect(final.charged).toEqual({ status: 'sent', number });
  });
});

test.describe('discount caps and the preview', () => {
  test('caps a fixed discount at the fee it applies to', async ({
    api,
    app,
    pool,
    schools: { owner, orgA, studentLekki },
  }) => {
    const fixture = await chargeFixture(app, api, owner);
    await addDiscount(pool, {
      organizationId: orgA.id,
      studentId: studentLekki.id,
      fromTermId: fixture.firstTermId,
      kind: 'fixed',
      value: TUITION_MINOR * 2,
      feeTypeId: await ledgerAccountId(pool, orgA.id, 4010),
    });
    const { runId } = await prepare(api, owner, {
      termId: fixture.secondTermId,
      scope: 'school',
    });
    const charge = (await runOf(api, owner, runId ?? '')).charges.find(
      (row) => row.studentId === studentLekki.id
    );

    const invoice = await api(owner).get(`/invoices/${charge?.id}`).expect(200);

    expect(
      (invoice.body.lines as { amountMinor: number }[]).map(
        (line) => line.amountMinor
      )
    ).toEqual([TUITION_MINOR, BUS_MINOR, -TUITION_MINOR]);
    expect(charge?.totalMinor).toBe(BUS_MINOR);
  });

  test('prices a student with no placement in the term from their latest placement, in the preview and the prepared charge', async ({
    api,
    app,
    pool,
    schools: { owner, ikeja, studentLekki },
  }) => {
    const fixture = await chargeFixture(app, api, owner);
    const fees = await feeFixture(app, api, owner);
    await createFeeLine(
      { app, actor: owner },
      { ...fees, termId: fixture.secondTermId },
      {
        level: 'JSS1',
        name: 'JSS 1 Tuition Ikeja',
        campusId: ikeja.id,
        amountMinor: 15_000_000,
      }
    );
    await pool.query(
      `UPDATE enrollment_placement SET campus_id = $2
       WHERE enrollment_id IN (SELECT id FROM student_enrollment WHERE student_id = $1)`,
      [studentLekki.id, ikeja.id]
    );
    const query = `termId=${fixture.secondTermId}&studentId=${studentLekki.id}`;
    const preview = (
      await api(owner).get(`/fee-lines/preview?${query}`).expect(200)
    ).body as FeePreview;

    const { runId } = await prepare(api, owner, {
      termId: fixture.secondTermId,
      scope: 'school',
    });
    const charge = (await runOf(api, owner, runId ?? '')).charges.find(
      (row) => row.studentId === studentLekki.id
    );
    const invoice = await api(owner).get(`/invoices/${charge?.id}`).expect(200);

    expect(preview.totalMinor).toBe(15_000_000 + BUS_MINOR);
    expect(
      preview.lines.map((line) => [line.description, line.amountMinor])
    ).toEqual(
      (
        invoice.body.lines as { description: string; amountMinor: number }[]
      ).map((line) => [line.description, line.amountMinor])
    );
  });

  test('leaves the charge status and the discounts out of the preview without invoice:read', async ({
    api,
    app,
    pool,
    withPermissions,
    schools: { owner, orgA, studentLekki },
  }) => {
    const fixture = await chargeFixture(app, api, owner);
    await addDiscount(pool, {
      organizationId: orgA.id,
      studentId: studentLekki.id,
      fromTermId: fixture.secondTermId,
      status: 'submitted',
      reason: 'Academic scholarship, top of JSS 1',
      value: 50,
    });
    await prepare(api, owner, {
      termId: fixture.secondTermId,
      scope: 'school',
    });
    const query = `termId=${fixture.secondTermId}&studentId=${studentLekki.id}`;
    const feeReader = await withPermissions(orgA, [
      'feeLine:read',
      'student:read',
      'campus:readAll',
    ]);

    const preview = (
      await api(feeReader).get(`/fee-lines/preview?${query}`).expect(200)
    ).body as FeePreview;

    expect(preview).not.toHaveProperty('charged');
    expect(preview.pendingDiscounts).toEqual([]);
    expect(preview.totalMinor).toBe(SECOND_TERM_TOTAL);
    const owned = (
      await api(owner).get(`/fee-lines/preview?${query}`).expect(200)
    ).body as FeePreview;
    expect(owned.charged).toEqual({ status: 'draft', number: null });
    expect(owned.pendingDiscounts).toEqual([
      'Academic scholarship, top of JSS 1',
    ]);
  });
});

test.describe('acting and dashboard', () => {
  test('a super admin acting without a reason can read but not prepare, send or cancel', async ({
    api,
    app,
    createUser,
    makeSuperAdmin,
    schools: { owner, orgA },
  }) => {
    const fixture = await chargeFixture(app, api, owner);
    const { runId } = await prepare(api, owner, {
      termId: fixture.secondTermId,
      scope: 'school',
    });
    const admin = await makeSuperAdmin(await createUser());

    await api(admin).get('/billing-runs').set(acting(orgA.id)).expect(200);
    await api(admin).get('/invoices').set(acting(orgA.id)).expect(200);
    for (const path of [
      '/billing-runs',
      `/billing-runs/${runId}/issue`,
      `/billing-runs/${runId}/cancel`,
    ]) {
      const refused = await api(admin)
        .post(path)
        .set(acting(orgA.id))
        .send({ termId: fixture.secondTermId, scope: 'school' })
        .expect(403);
      expect(refused.body).toMatchObject({ code: 'ActingReadOnly' });
    }
    expect((await runOf(api, owner, runId ?? '')).status).toBe('draft');
  });

  test('shows the bursar an unsent round and the students not charged yet, and the charged figure', async ({
    api,
    app,
    schools: { owner, lekkiOnly },
  }) => {
    const fixture = await chargeFixture(app, api, owner);
    const tasksOf = async (actor: typeof owner) =>
      (await api(actor).get('/dashboard/tasks').expect(200))
        .body as DashboardTask[];

    expect(notCharged(await tasksOf(lekkiOnly))).toMatchObject({
      count: 1,
      termId: fixture.firstTermId,
    });
    const { runId } = await prepare(api, lekkiOnly, {
      termId: fixture.firstTermId,
      scope: 'school',
    });
    const drafted = await tasksOf(lekkiOnly);
    expect(drafted.find((task) => task.kind === 'unsentRound')).toMatchObject({
      runId,
      count: 1,
    });
    expect(notCharged(drafted)).toBeUndefined();
    expect(notCharged(await tasksOf(owner))).toMatchObject({ count: 1 });

    await sendRun(api, lekkiOnly, runId ?? '');
    expect(
      (await tasksOf(lekkiOnly)).filter((task) => task.kind === 'unsentRound')
    ).toEqual([]);
    const charged = (await api(lekkiOnly).get('/dashboard/charged').expect(200))
      .body as DashboardCharged;
    expect(charged).toMatchObject({
      termId: fixture.firstTermId,
      chargedMinor: TUITION_MINOR,
      chargeCount: 1,
    });
  });

  test('keeps one school’s charges off another school’s dashboard and needs a session', async ({
    api,
    app,
    schools: { owner, ownerB },
  }) => {
    const fixture = await chargeFixture(app, api, owner);
    const { runId } = await prepare(api, owner, {
      termId: fixture.firstTermId,
      scope: 'school',
    });
    const tasksOf = async (actor: typeof owner) =>
      (await api(actor).get('/dashboard/tasks').expect(200))
        .body as DashboardTask[];

    expect(
      (await tasksOf(owner)).find((task) => task.kind === 'unsentRound')
    ).toMatchObject({ runId });
    expect(
      (await tasksOf(ownerB)).filter((task) => task.kind === 'unsentRound')
    ).toEqual([]);

    await sendRun(api, owner, runId ?? '');
    const chargedOf = async (actor: typeof owner) =>
      (await api(actor).get('/dashboard/charged').expect(200))
        .body as DashboardCharged;
    expect(await chargedOf(owner)).toMatchObject({ chargeCount: 2 });
    expect(await chargedOf(ownerB)).toMatchObject({
      chargedMinor: 0,
      chargeCount: 0,
    });
    await api().get('/dashboard/charged').expect(401);
    await api().get('/dashboard/tasks').expect(401);
  });

  test('hides the charge tasks and figure from a holder of invoice:read only', async ({
    api,
    app,
    withPermissions,
    schools: { owner, orgA },
  }) => {
    await chargeFixture(app, api, owner);
    const reader = await withPermissions(orgA, [
      'invoice:read',
      'campus:readAll',
    ]);
    const tasks = (await api(reader).get('/dashboard/tasks').expect(200))
      .body as DashboardTask[];
    expect(tasks.map((task) => task.kind)).not.toContain('notCharged');
    await api(reader).get('/dashboard/charged').expect(200);
    const nobody = await withPermissions(orgA, ['student:read']);
    await api(nobody).get('/dashboard/charged').expect(403);
  });
});
