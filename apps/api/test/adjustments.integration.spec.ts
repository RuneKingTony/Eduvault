import {
  ADJUSTMENT_ACCOUNT_RETIRED_NOW_MESSAGE,
  ALREADY_DECIDED_MESSAGE,
  DECLINE_REASON_MESSAGE,
  PAYMENT_ACCOUNT_GATEWAY_MESSAGE,
  PAYMENT_REFERENCE_TAKEN_MESSAGE,
  SELF_APPROVAL_MESSAGE,
  adjustmentReferenceUsedMessage,
  adjustmentRefundCapMessage,
  adjustmentRefundNowCapMessage,
  adjustmentWriteOffCapMessage,
  type Adjustment,
  type AdjustmentList,
} from '@eduvault/api-contract';
import { expect } from './support/base-test';
import {
  approveAdjustment,
  askAdjustment,
  entryCount,
  holdCredit,
  switchApproval,
} from './support/factories/approvals';
import {
  chargeFixture,
  entriesFor,
  invoicesOf,
  prepare,
  receivableBalance,
  sendRun,
} from './support/factories/billing';
import { ledgerAccountId, postEntry } from './support/factories/finance';
import { bankAccount, owes, recordCash } from './support/factories/payments';
import { schoolsTest as test } from './support/two-schools';

const OWED = 1_200_000;
const CREDIT = 500_000;

const adjustmentOf = async (
  api: (user: { cookie: string }) => {
    get: (path: string) => import('supertest').Test;
  },
  actor: { cookie: string },
  id: string
): Promise<Adjustment> =>
  (await api(actor).get(`/finance/adjustments/${id}`).expect(200))
    .body as Adjustment;

const ask = (studentId: string, over: Record<string, unknown> = {}) => ({
  kind: 'credit_note' as const,
  studentId,
  amountMinor: 100_000,
  reason: 'Late enrolment',
  reference: 'DEMO-ADJ-1',
  ...over,
});

test.describe('asking with a reference', () => {
  test('the same request again answers the first adjustment and adds no row', async ({
    api,
    pool,
    schools: { owner, studentLekki },
  }) => {
    const first = await askAdjustment(api, owner, ask(studentLekki.id));
    const again = await askAdjustment(api, owner, ask(studentLekki.id));

    expect(again.adjustment.id).toBe(first.adjustment.id);
    expect(
      (
        await pool.query(`SELECT 1 FROM adjustment WHERE reference = $1`, [
          'DEMO-ADJ-1',
        ])
      ).rowCount
    ).toBe(1);
  });

  test('requests sent together apply once', async ({
    api,
    pool,
    schools: { owner, studentLekki },
  }) => {
    const made = await Promise.all(
      [1, 2, 3].map(() => askAdjustment(api, owner, ask(studentLekki.id)))
    );

    expect(new Set(made.map((one) => one.adjustment.id)).size).toBe(1);
    expect(
      (
        await pool.query(`SELECT 1 FROM adjustment WHERE reference = $1`, [
          'DEMO-ADJ-1',
        ])
      ).rowCount
    ).toBe(1);
  });

  test('another request on the reference answers 409 with the number', async ({
    api,
    schools: { owner, studentLekki },
  }) => {
    const first = await askAdjustment(api, owner, ask(studentLekki.id));

    const res = await api(owner)
      .post('/finance/adjustments')
      .send(ask(studentLekki.id, { amountMinor: 200_000 }))
      .expect(409);

    expect(res.body).toMatchObject({
      message: adjustmentReferenceUsedMessage(
        'DEMO-ADJ-1',
        first.adjustment.number
      ),
    });
  });

  test('a system prefix is refused with 400', async ({
    api,
    schools: { owner, studentLekki },
  }) => {
    await api(owner)
      .post('/finance/adjustments')
      .send(ask(studentLekki.id, { reference: 'ADJ-2026-0001' }))
      .expect(400);
  });

  test('another school can use the same reference, and never sees A’s row', async ({
    api,
    pool,
    schools: { owner, ownerB, orgA, orgB, studentLekki, studentB },
  }) => {
    const a = await askAdjustment(api, owner, ask(studentLekki.id));
    const b = await askAdjustment(api, ownerB, ask(studentB.id));

    expect(b.adjustment.id).not.toBe(a.adjustment.id);
    const { rows } = await pool.query(
      `SELECT organization_id FROM adjustment WHERE reference = $1 ORDER BY organization_id`,
      ['DEMO-ADJ-1']
    );
    expect(
      rows
        .map((row) => row.organization_id)
        .toSorted((left, right) => left.localeCompare(right))
    ).toEqual(
      [orgA.id, orgB.id].toSorted((left, right) => left.localeCompare(right))
    );
    await api(ownerB)
      .get(`/finance/adjustments/${a.adjustment.id}`)
      .expect(404);
  });

  test('a user outside the holder’s campus answers 409 without the number', async ({
    api,
    schools: { owner, lekkiOnly, studentIkeja, studentLekki },
  }) => {
    await askAdjustment(api, owner, ask(studentIkeja.id));

    const res = await api(lekkiOnly)
      .post('/finance/adjustments')
      .send(ask(studentLekki.id))
      .expect(409);

    expect(res.body).toMatchObject({
      message: PAYMENT_REFERENCE_TAKEN_MESSAGE,
    });
  });
});

test.describe('asking for a correction', () => {
  test('each kind posts nothing when asked and gets an ADJ number', async ({
    api,
    app,
    pool,
    schools: { owner, lekkiOnly, studentLekki },
  }) => {
    await owes(app, owner, { studentId: studentLekki.id, amountMinor: OWED });
    const account = await bankAccount(app, owner);
    const before = await pool.query(`SELECT 1 FROM journal_entry`);

    const creditNote = await askAdjustment(api, lekkiOnly, {
      kind: 'credit_note',
      studentId: studentLekki.id,
      amountMinor: 1_000_000,
      reason: 'Late enrolment',
    });
    const writeOff = await askAdjustment(api, lekkiOnly, {
      kind: 'write_off',
      studentId: studentLekki.id,
      amountMinor: OWED,
      reason: 'Left the school',
    });
    await recordCash(api, owner, {
      accountId: account.id,
      allocations: [{ studentId: studentLekki.id, amountMinor: OWED + CREDIT }],
    });
    const refund = await askAdjustment(api, lekkiOnly, {
      kind: 'refund',
      studentId: studentLekki.id,
      amountMinor: CREDIT,
      moneyAccountId: account.id,
      reason: 'Overpaid',
    });

    const made = [creditNote, writeOff, refund];
    expect(made.map((one) => one.adjustment.number)).toEqual([
      expect.stringMatching(/^ADJ-\d{4}-0001$/),
      expect.stringMatching(/^ADJ-\d{4}-0002$/),
      expect.stringMatching(/^ADJ-\d{4}-0003$/),
    ]);
    expect(made.map((one) => one.adjustment.status)).toEqual([
      'submitted',
      'submitted',
      'submitted',
    ]);
    expect(made.map((one) => one.autoApproved)).toEqual([false, false, false]);
    expect((await pool.query(`SELECT 1 FROM journal_entry`)).rowCount).toBe(
      (before.rowCount ?? 0) + 1
    );
  });

  test('approving a fee reduction posts Dr discounts given, Cr fees receivable on the student’s campus', async ({
    api,
    app,
    pool,
    schools: { owner, orgA, lekki, lekkiOnly, studentLekki },
  }) => {
    await owes(app, owner, { studentId: studentLekki.id, amountMinor: OWED });
    const { adjustment } = await askAdjustment(api, lekkiOnly, {
      kind: 'credit_note',
      studentId: studentLekki.id,
      amountMinor: 1_000_000,
      reason: 'Late enrolment',
    });

    const approved = await approveAdjustment(api, owner, adjustment.id);

    expect(approved).toMatchObject({
      status: 'approved',
      journalEntryId: expect.any(String),
    });
    const lines = await entriesFor(pool, orgA.id, adjustment.number);
    expect(
      lines.map((line) => [
        line.code,
        line.student_id,
        line.campus_id,
        line.debit_minor,
        line.credit_minor,
      ])
    ).toEqual(
      [
        [1100, studentLekki.id, lekki.id, '0', '1000000'],
        [5000, null, lekki.id, '1000000', '0'],
      ].toSorted((a, b) => Number(a[0]) - Number(b[0]))
    );
    expect(await receivableBalance(pool, orgA.id, studentLekki.id)).toBe(
      OWED - 1_000_000
    );
  });

  test('a fee reduction can debit an income category and name one of the student’s sent charges', async ({
    api,
    app,
    pool,
    schools: { owner, orgA, lekkiOnly, studentLekki, studentIkeja },
  }) => {
    const fixture = await chargeFixture(app, api, owner);
    const { runId } = await prepare(api, owner, {
      termId: fixture.secondTermId,
      scope: 'school',
    });
    await sendRun(api, owner, runId ?? '');
    const charges = await invoicesOf(api, owner);
    const mine = charges.items.find(
      (item) => item.studentId === studentLekki.id
    );
    const theirs = charges.items.find(
      (item) => item.studentId === studentIkeja.id
    );
    const tuition = await ledgerAccountId(pool, orgA.id, 4010);

    const { adjustment } = await askAdjustment(api, lekkiOnly, {
      kind: 'credit_note',
      studentId: studentLekki.id,
      amountMinor: 500_000,
      reason: 'Reduced tuition',
      ledgerAccountId: tuition,
      invoiceId: mine?.id ?? '',
    });
    expect(adjustment).toMatchObject({
      ledgerAccountId: tuition,
      invoiceId: mine?.id,
    });
    await approveAdjustment(api, owner, adjustment.id);
    expect(
      (await entriesFor(pool, orgA.id, adjustment.number)).map(
        (line) => line.code
      )
    ).toContain(4010);

    const wrong = await api(owner)
      .post('/finance/adjustments')
      .send({
        kind: 'credit_note',
        studentId: studentLekki.id,
        amountMinor: 100,
        reason: 'x',
        invoiceId: theirs?.id,
      })
      .expect(400);
    expect(wrong.body.message).toContain('sent charges');
  });

  test('approving a cancelled balance posts Dr bad debt, Cr fees receivable and the balance goes to zero', async ({
    api,
    app,
    pool,
    schools: { owner, orgA, lekkiOnly, studentLekki },
  }) => {
    await owes(app, owner, { studentId: studentLekki.id, amountMinor: OWED });
    const { adjustment } = await askAdjustment(api, lekkiOnly, {
      kind: 'write_off',
      studentId: studentLekki.id,
      amountMinor: OWED,
      reason: 'Left the school',
    });

    await approveAdjustment(api, owner, adjustment.id);

    const lines = await entriesFor(pool, orgA.id, adjustment.number);
    expect(
      lines.map((line) => [line.code, line.debit_minor, line.credit_minor])
    ).toEqual([
      [1100, '0', String(OWED)],
      [5100, String(OWED), '0'],
    ]);
    expect(await receivableBalance(pool, orgA.id, studentLekki.id)).toBe(0);
  });

  test('approving a refund posts Dr fees receivable, Cr the money account and clears the credit', async ({
    api,
    app,
    pool,
    schools: { owner, orgA, lekkiOnly, studentLekki },
  }) => {
    await holdCredit(app, owner, {
      studentId: studentLekki.id,
      amountMinor: CREDIT,
    });
    const account = await bankAccount(app, owner);
    const { adjustment } = await askAdjustment(api, lekkiOnly, {
      kind: 'refund',
      studentId: studentLekki.id,
      amountMinor: CREDIT,
      moneyAccountId: account.id,
      reason: 'Overpaid',
    });

    await approveAdjustment(api, owner, adjustment.id);

    const lines = await entriesFor(pool, orgA.id, adjustment.number);
    expect(
      lines.map((line) => [
        line.code,
        line.student_id,
        line.debit_minor,
        line.credit_minor,
      ])
    ).toEqual(
      expect.arrayContaining([[1100, studentLekki.id, String(CREDIT), '0']])
    );
    expect(lines).toHaveLength(2);
    expect(await receivableBalance(pool, orgA.id, studentLekki.id)).toBe(0);
  });

  test('a write-off above what is owed answers 400 when asked and 409 when approved after the family paid', async ({
    api,
    app,
    pool,
    schools: { owner, orgA, lekkiOnly, studentLekki },
  }) => {
    await owes(app, owner, { studentId: studentLekki.id, amountMinor: OWED });
    const tooMuch = await api(lekkiOnly)
      .post('/finance/adjustments')
      .send({
        kind: 'write_off',
        studentId: studentLekki.id,
        amountMinor: 1_500_000,
        reason: 'x',
      })
      .expect(400);
    expect(tooMuch.body.message).toBe(
      adjustmentWriteOffCapMessage(
        `${studentLekki.firstName} ${studentLekki.lastName}`,
        OWED
      )
    );

    const { adjustment } = await askAdjustment(api, lekkiOnly, {
      kind: 'write_off',
      studentId: studentLekki.id,
      amountMinor: OWED,
      reason: 'Left the school',
    });
    const account = await bankAccount(app, owner);
    await recordCash(api, owner, {
      accountId: account.id,
      allocations: [{ studentId: studentLekki.id, amountMinor: 700_000 }],
    });

    const res = await api(owner)
      .post(`/finance/adjustments/${adjustment.id}/approve`)
      .expect(409);

    expect(res.body.message).toContain('now owes');
    expect(await entryCount(pool, orgA.id, adjustment.number)).toBe(0);
    expect((await adjustmentOf(api, owner, adjustment.id)).status).toBe(
      'submitted'
    );
  });

  test('a refund above the credit held answers 400 with creditMinor, and 409 once a new charge has used the credit', async ({
    api,
    app,
    pool,
    schools: { owner, orgA, lekkiOnly, studentLekki },
  }) => {
    await holdCredit(app, owner, {
      studentId: studentLekki.id,
      amountMinor: CREDIT,
    });
    const account = await bankAccount(app, owner);
    const name = `${studentLekki.firstName} ${studentLekki.lastName}`;
    const tooMuch = await api(lekkiOnly)
      .post('/finance/adjustments')
      .send({
        kind: 'refund',
        studentId: studentLekki.id,
        amountMinor: 600_000,
        moneyAccountId: account.id,
        reason: 'x',
      })
      .expect(400);
    expect(tooMuch.body).toMatchObject({
      message: adjustmentRefundCapMessage(name, CREDIT),
      creditMinor: CREDIT,
    });

    const { adjustment } = await askAdjustment(api, lekkiOnly, {
      kind: 'refund',
      studentId: studentLekki.id,
      amountMinor: CREDIT,
      moneyAccountId: account.id,
      reason: 'Overpaid',
    });
    const [receivable, income] = await Promise.all([
      ledgerAccountId(pool, orgA.id, 1100),
      ledgerAccountId(pool, orgA.id, 4000),
    ]);
    await postEntry(app, {
      organizationId: orgA.id,
      reference: 'NEW-CHARGE-1',
      kind: 'adhoc',
      effectiveOn: '2026-10-10',
      postedBy: null,
      lines: [
        {
          ledgerAccountId: receivable,
          studentId: studentLekki.id,
          debitMinor: 300_000,
          creditMinor: 0,
        },
        { ledgerAccountId: income, debitMinor: 0, creditMinor: 300_000 },
      ],
    });

    const res = await api(owner)
      .post(`/finance/adjustments/${adjustment.id}/approve`)
      .expect(409);

    expect(res.body.message).toBe(adjustmentRefundNowCapMessage(name, 200_000));
    expect(await entryCount(pool, orgA.id, adjustment.number)).toBe(0);
  });

  test('a refund whose money account was retired while it waited answers 409 and posts nothing', async ({
    api,
    app,
    pool,
    schools: { owner, orgA, lekkiOnly, studentLekki },
  }) => {
    await holdCredit(app, owner, {
      studentId: studentLekki.id,
      amountMinor: CREDIT,
    });
    const account = await bankAccount(app, owner);
    const { adjustment } = await askAdjustment(api, lekkiOnly, {
      kind: 'refund',
      studentId: studentLekki.id,
      amountMinor: CREDIT,
      moneyAccountId: account.id,
      reason: 'Overpaid',
    });
    await api(owner)
      .patch(`/finance/money-accounts/${account.id}`)
      .send({ retired: true })
      .expect(200);

    const res = await api(owner)
      .post(`/finance/adjustments/${adjustment.id}/approve`)
      .expect(409);

    expect(res.body.message).toBe(ADJUSTMENT_ACCOUNT_RETIRED_NOW_MESSAGE);
    expect(await entryCount(pool, orgA.id, adjustment.number)).toBe(0);
  });

  test('racing approvers give one 200, one 409 and one journal entry', async ({
    api,
    app,
    pool,
    withPermissions,
    schools: { owner, orgA, lekkiOnly, studentLekki },
  }) => {
    await owes(app, owner, { studentId: studentLekki.id, amountMinor: OWED });
    const second = await withPermissions(orgA, [
      'adjustment:read',
      'adjustment:approve',
      'campus:readAll',
    ]);
    const { adjustment } = await askAdjustment(api, lekkiOnly, {
      kind: 'credit_note',
      studentId: studentLekki.id,
      amountMinor: 100_000,
      reason: 'Late enrolment',
    });

    const results = await Promise.all(
      [owner, second].map((approver) =>
        api(approver).post(`/finance/adjustments/${adjustment.id}/approve`)
      )
    );

    expect(results.map((res) => res.status).toSorted((a, b) => a - b)).toEqual([
      200, 409,
    ]);
    expect(results.find((res) => res.status === 409)?.body).toMatchObject({
      code: 'AlreadyDecided',
      message: ALREADY_DECIDED_MESSAGE,
    });
    expect(await entryCount(pool, orgA.id, adjustment.number)).toBe(1);
  });

  test('nobody approves or declines their own request', async ({
    api,
    app,
    withPermissions,
    schools: { owner, orgA, lekki, studentLekki },
  }) => {
    await owes(app, owner, { studentId: studentLekki.id, amountMinor: OWED });
    const chika = await withPermissions(
      orgA,
      ['adjustment:create', 'adjustment:read', 'adjustment:approve'],
      { campuses: [lekki] }
    );
    const { adjustment } = await askAdjustment(api, chika, {
      kind: 'credit_note',
      studentId: studentLekki.id,
      amountMinor: 100_000,
      reason: 'Late enrolment',
    });

    const approve = await api(chika)
      .post(`/finance/adjustments/${adjustment.id}/approve`)
      .expect(409);
    const decline = await api(chika)
      .post(`/finance/adjustments/${adjustment.id}/decline`)
      .send({ reason: 'No' })
      .expect(409);

    expect(approve.body).toMatchObject({
      code: 'SelfApproval',
      message: SELF_APPROVAL_MESSAGE,
    });
    expect(decline.body.code).toBe('SelfApproval');
  });

  test('the owner approves their own request and the audit row says so', async ({
    api,
    app,
    pool,
    schools: { owner, studentLekki },
  }) => {
    await owes(app, owner, { studentId: studentLekki.id, amountMinor: OWED });
    const { adjustment } = await askAdjustment(api, owner, {
      kind: 'credit_note',
      studentId: studentLekki.id,
      amountMinor: 100_000,
      reason: 'Late enrolment',
    });

    const approved = await approveAdjustment(api, owner, adjustment.id);

    expect(approved.status).toBe('approved');
    const { rows } = await pool.query<{ text: string; data: unknown }>(
      `SELECT text, data FROM activity_event WHERE kind = 'adjustment.approved' AND subject_id = $1`,
      [adjustment.id]
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.text).toMatch(/\(their own request\)\.$/);
    expect(rows[0]?.data).toMatchObject({ ownRequest: true });
  });

  test('a decline keeps its reason and posts nothing, and a blank one answers 400', async ({
    api,
    app,
    pool,
    schools: { owner, orgA, lekkiOnly, studentLekki },
  }) => {
    await owes(app, owner, { studentId: studentLekki.id, amountMinor: OWED });
    const { adjustment } = await askAdjustment(api, lekkiOnly, {
      kind: 'credit_note',
      studentId: studentLekki.id,
      amountMinor: 100_000,
      reason: 'Late enrolment',
    });

    const blank = await api(owner)
      .post(`/finance/adjustments/${adjustment.id}/decline`)
      .send({ reason: '  ' })
      .expect(400);
    expect(JSON.stringify(blank.body)).toContain(DECLINE_REASON_MESSAGE);
    await api(owner)
      .post(`/finance/adjustments/${adjustment.id}/decline`)
      .send({ reason: 'Not agreed with the owner' })
      .expect(200);

    expect(await adjustmentOf(api, owner, adjustment.id)).toMatchObject({
      status: 'rejected',
      rejectionReason: 'Not agreed with the owner',
    });
    expect(await entryCount(pool, orgA.id, adjustment.number)).toBe(0);
    await api(owner)
      .post(`/finance/adjustments/${adjustment.id}/approve`)
      .expect(409);
  });

  test('a kind switched off posts at once with no approver, while the others still wait', async ({
    api,
    app,
    pool,
    schools: { owner, orgA, lekkiOnly, studentLekki },
  }) => {
    await owes(app, owner, { studentId: studentLekki.id, amountMinor: OWED });
    const waiting = await askAdjustment(api, lekkiOnly, {
      kind: 'write_off',
      studentId: studentLekki.id,
      amountMinor: 100_000,
      reason: 'Already asked',
    });
    await switchApproval(api, owner, { creditNote: false, writeOff: false });

    const instant = await askAdjustment(api, lekkiOnly, {
      kind: 'credit_note',
      studentId: studentLekki.id,
      amountMinor: 100_000,
      reason: 'Late enrolment',
    });

    expect(instant.autoApproved).toBe(true);
    expect(instant.adjustment).toMatchObject({
      status: 'approved',
      approvedBy: null,
    });
    expect(await entryCount(pool, orgA.id, instant.adjustment.number)).toBe(1);
    const again = await askAdjustment(api, lekkiOnly, {
      kind: 'write_off',
      studentId: studentLekki.id,
      amountMinor: 100_000,
      reason: 'Instant',
    });
    expect(again.autoApproved).toBe(true);
    expect(await adjustmentOf(api, owner, waiting.adjustment.id)).toMatchObject(
      { status: 'submitted' }
    );
    const list = (
      await api(owner).get('/finance/adjustments?status=submitted').expect(200)
    ).body as AdjustmentList;
    expect(list.waitingCount).toBe(1);
    const refundAccount = await bankAccount(app, owner);
    await recordCash(api, owner, {
      accountId: refundAccount.id,
      allocations: [{ studentId: studentLekki.id, amountMinor: 2_500_000 }],
    });
    await switchApproval(api, owner, { refund: false });
    const refund = await askAdjustment(api, lekkiOnly, {
      kind: 'refund',
      studentId: studentLekki.id,
      amountMinor: 100_000,
      moneyAccountId: refundAccount.id,
      reason: 'Overpaid',
    });
    expect(refund.autoApproved).toBe(true);
  });

  test('refuses a gateway account, a student on another campus and a missing money account', async ({
    api,
    app,
    pool,
    schools: { owner, orgA, lekkiOnly, studentLekki, studentIkeja },
  }) => {
    await holdCredit(app, owner, {
      studentId: studentLekki.id,
      amountMinor: CREDIT,
    });
    const ledger = await pool.query<{ id: string }>(
      `INSERT INTO ledger_account (organization_id, code, name, type, parent_id)
       VALUES ($1, 1290, 'Paystack', 'asset', $2) RETURNING id`,
      [orgA.id, await ledgerAccountId(pool, orgA.id, 1200)]
    );
    const gateway = await pool.query<{ id: string }>(
      `INSERT INTO money_account (organization_id, ledger_account_id, name, kind)
       VALUES ($1, $2, 'Paystack', 'gateway') RETURNING id`,
      [orgA.id, ledger.rows[0]?.id]
    );
    const gatewayRes = await api(lekkiOnly)
      .post('/finance/adjustments')
      .send({
        kind: 'refund',
        studentId: studentLekki.id,
        amountMinor: 100_000,
        moneyAccountId: gateway.rows[0]?.id,
        reason: 'x',
      })
      .expect(400);
    expect(gatewayRes.body.message).toBe(PAYMENT_ACCOUNT_GATEWAY_MESSAGE);
    await api(lekkiOnly)
      .post('/finance/adjustments')
      .send({
        kind: 'credit_note',
        studentId: studentIkeja.id,
        amountMinor: 100,
        reason: 'x',
      })
      .expect(404);
    await api(lekkiOnly)
      .post('/finance/adjustments')
      .send({
        kind: 'refund',
        studentId: studentLekki.id,
        amountMinor: 100,
        moneyAccountId: '0b0c8a8e-8a3e-4c6c-a8c4-0e2f0f6b1f11',
        reason: 'x',
      })
      .expect(404);
  });

  test('answers 401 without a session and 403 without the permission', async ({
    api,
    app,
    schools: { owner, noPermission, lekkiOnly, studentLekki },
  }) => {
    await owes(app, owner, { studentId: studentLekki.id, amountMinor: OWED });
    const { adjustment } = await askAdjustment(api, lekkiOnly, {
      kind: 'credit_note',
      studentId: studentLekki.id,
      amountMinor: 100_000,
      reason: 'Late enrolment',
    });

    await api().get('/finance/adjustments').expect(401);
    for (const user of [noPermission, lekkiOnly]) {
      const path = `/finance/adjustments/${adjustment.id}`;
      if (user === noPermission) {
        await api(user).get('/finance/adjustments').expect(403);
        await api(user).post('/finance/adjustments').send({}).expect(403);
      }
      await api(user).post(`${path}/approve`).expect(403);
      await api(user).post(`${path}/decline`).send({ reason: 'x' }).expect(403);
    }
  });
});

test.describe('isolation of adjustment', () => {
  test('another school’s ids answer 404 on every route', async ({
    api,
    app,
    schools: { owner, ownerB, lekkiOnly, studentLekki },
  }) => {
    await owes(app, owner, { studentId: studentLekki.id, amountMinor: OWED });
    const { adjustment } = await askAdjustment(api, lekkiOnly, {
      kind: 'credit_note',
      studentId: studentLekki.id,
      amountMinor: 100_000,
      reason: 'Late enrolment',
    });
    const path = `/finance/adjustments/${adjustment.id}`;

    await api(ownerB).get(path).expect(404);
    await api(ownerB).post(`${path}/approve`).expect(404);
    await api(ownerB).post(`${path}/decline`).send({ reason: 'x' }).expect(404);
    await api(ownerB)
      .post('/finance/adjustments')
      .send({
        kind: 'credit_note',
        studentId: studentLekki.id,
        amountMinor: 100,
        reason: 'x',
      })
      .expect(404);
    const list = await api(ownerB).get('/finance/adjustments').expect(200);
    expect(list.body).toMatchObject({ items: [], total: 0, waitingCount: 0 });
  });

  test('a campus-scoped member cannot read or decide another campus’s request', async ({
    api,
    app,
    withPermissions,
    schools: { owner, orgA, ikeja, lekkiOnly, studentLekki },
  }) => {
    await owes(app, owner, { studentId: studentLekki.id, amountMinor: OWED });
    const ikejaApprover = await withPermissions(
      orgA,
      ['adjustment:read', 'adjustment:approve'],
      { campuses: [ikeja] }
    );
    const { adjustment } = await askAdjustment(api, lekkiOnly, {
      kind: 'credit_note',
      studentId: studentLekki.id,
      amountMinor: 100_000,
      reason: 'Late enrolment',
    });
    const path = `/finance/adjustments/${adjustment.id}`;

    await api(ikejaApprover).get(path).expect(404);
    await api(ikejaApprover).post(`${path}/approve`).expect(404);
    await api(ikejaApprover)
      .post(`${path}/decline`)
      .send({ reason: 'x' })
      .expect(404);
    const list = await api(ikejaApprover)
      .get('/finance/adjustments')
      .expect(200);
    expect(list.body.items).toEqual([]);
  });

  test('the composite foreign keys refuse another school’s student, money account, ledger account and invoice on a direct insert', async ({
    api,
    app,
    pool,
    schools: { owner, ownerB, orgA, orgB, studentLekki, studentB },
  }) => {
    const accountB = await bankAccount(app, ownerB);
    const receivableA = await ledgerAccountId(pool, orgA.id, 1100);
    const fixture = await chargeFixture(app, api, owner);
    const { runId } = await prepare(api, owner, {
      termId: fixture.secondTermId,
      scope: 'school',
    });
    await sendRun(api, owner, runId ?? '');
    const [charge] = (await invoicesOf(api, owner)).items;

    await expect(
      pool.query(
        `INSERT INTO adjustment (organization_id, number, kind, student_id, amount_minor, reason, ledger_account_id)
         VALUES ($1, 'ADJ-X-2', 'credit_note', $2, 100, 'x', $3)`,
        [orgB.id, studentLekki.id, receivableA]
      )
    ).rejects.toMatchObject({ code: '23503' });
    await expect(
      pool.query(
        `INSERT INTO adjustment (organization_id, number, kind, student_id, amount_minor, reason)
         VALUES ($1, 'ADJ-X-5', 'write_off', $2, 100, 'x')`,
        [orgB.id, studentLekki.id]
      )
    ).rejects.toMatchObject({ code: '23503' });
    await expect(
      pool.query(
        `INSERT INTO adjustment (organization_id, number, kind, student_id, amount_minor, reason, money_account_id)
         VALUES ($1, 'ADJ-X-3', 'refund', $2, 100, 'x', $3)`,
        [orgA.id, studentLekki.id, accountB.id]
      )
    ).rejects.toMatchObject({ code: '23503' });
    await expect(
      pool.query(
        `INSERT INTO adjustment (organization_id, number, kind, student_id, amount_minor, reason, ledger_account_id, invoice_id)
         VALUES ($1, 'ADJ-X-4', 'credit_note', $2, 100, 'x', $3, $4)`,
        [orgB.id, studentB.id, receivableA, charge?.id]
      )
    ).rejects.toMatchObject({ code: '23503' });
  });

  test('an adjustment can be neither deleted nor changed once decided', async ({
    api,
    app,
    pool,
    schools: { owner, lekkiOnly, studentLekki },
  }) => {
    await owes(app, owner, { studentId: studentLekki.id, amountMinor: OWED });
    const { adjustment } = await askAdjustment(api, lekkiOnly, {
      kind: 'credit_note',
      studentId: studentLekki.id,
      amountMinor: 100_000,
      reason: 'Late enrolment',
    });
    await expect(
      pool.query(`DELETE FROM adjustment WHERE id = $1`, [adjustment.id])
    ).rejects.toMatchObject({ code: '23514' });
    await approveAdjustment(api, owner, adjustment.id);

    await expect(
      pool.query(`UPDATE adjustment SET reason = 'changed' WHERE id = $1`, [
        adjustment.id,
      ])
    ).rejects.toMatchObject({
      code: '23514',
      constraint: 'adjustment_decided_frozen',
    });
  });
});
