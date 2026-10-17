import { acting, expect } from './support/base-test';
import {
  approveDiscount,
  askAdjustment,
  askDiscount,
  askVoid,
} from './support/factories/approvals';
import {
  chargeFixture,
  invoicesOf,
  prepare,
  sendRun,
} from './support/factories/billing';
import { ledgerAccountId } from './support/factories/finance';
import { bankAccount, owes, recordCash } from './support/factories/payments';
import { schoolsTest as test } from './support/two-schools';

const OWED = 1_200_000;
const PAID = 2_000_000;
const REASON = 'SUP-2207 acting on behalf';

test.describe('references to another school’s rows', () => {
  test('a credit note naming another school’s account or charge answers 404, an own but unusable one 400', async ({
    api,
    app,
    pool,
    schools: { owner, ownerB, orgA, orgB, lekkiOnly, studentLekki },
  }) => {
    await owes(app, owner, { studentId: studentLekki.id, amountMinor: OWED });
    const accountB = await ledgerAccountId(pool, orgB.id, 4010);
    const fixtureB = await chargeFixture(app, api, ownerB);
    const { runId } = await prepare(api, ownerB, {
      termId: fixtureB.secondTermId,
      scope: 'school',
    });
    await sendRun(api, ownerB, runId ?? '');
    const [chargeB] = (await invoicesOf(api, ownerB)).items;
    expect(chargeB).toBeDefined();
    const receivableA = await ledgerAccountId(pool, orgA.id, 1100);
    const base = {
      kind: 'credit_note',
      studentId: studentLekki.id,
      amountMinor: 100_000,
      reason: 'Late enrolment',
    };

    await api(lekkiOnly)
      .post('/finance/adjustments')
      .send({ ...base, ledgerAccountId: accountB })
      .expect(404);
    await api(lekkiOnly)
      .post('/finance/adjustments')
      .send({ ...base, invoiceId: chargeB?.id })
      .expect(404);
    await api(lekkiOnly)
      .post('/finance/adjustments')
      .send({ ...base, ledgerAccountId: receivableA })
      .expect(400);
  });

  test('a discount naming another school’s fee type answers 404, an own non-fee account 400', async ({
    api,
    app,
    pool,
    schools: { owner, ownerB, orgA, orgB, lekkiOnly, studentLekki },
  }) => {
    const fixture = await chargeFixture(app, api, owner);
    await chargeFixture(app, api, ownerB);
    const tuitionB = await ledgerAccountId(pool, orgB.id, 4010);
    const receivableA = await ledgerAccountId(pool, orgA.id, 1100);
    const base = {
      studentId: studentLekki.id,
      kind: 'percent',
      value: 10,
      fromTermId: fixture.secondTermId,
      reason: 'Staff child',
    };

    await api(lekkiOnly)
      .post('/finance/discounts')
      .send({ ...base, ledgerAccountId: tuitionB })
      .expect(404);
    await api(lekkiOnly)
      .post('/finance/discounts')
      .send({ ...base, ledgerAccountId: receivableA })
      .expect(400);
  });
});

test.describe('composite foreign keys, one reference at a time', () => {
  test('an adjustment refuses another school’s ledger account, charge and journal entry on their own', async ({
    api,
    app,
    pool,
    schools: { owner, ownerB, orgA, orgB, studentLekki, studentB },
  }) => {
    const accountB = await bankAccount(app, ownerB);
    const receiptB = await recordCash(api, ownerB, {
      accountId: accountB.id,
      allocations: [{ studentId: studentB.id, amountMinor: PAID }],
    });
    const { rows } = await pool.query<{ journal_entry_id: string }>(
      `SELECT journal_entry_id FROM payment WHERE id = $1`,
      [receiptB.id]
    );
    const entryB = rows[0]?.journal_entry_id;
    const ledgerB = await ledgerAccountId(pool, orgB.id, 4010);
    const fixtureA = await chargeFixture(app, api, owner);
    const { runId } = await prepare(api, owner, {
      termId: fixtureA.secondTermId,
      scope: 'school',
    });
    await sendRun(api, owner, runId ?? '');
    const [chargeA] = (await invoicesOf(api, owner)).items;
    const ledgerA = await ledgerAccountId(pool, orgA.id, 4010);

    await expect(
      pool.query(
        `INSERT INTO adjustment (organization_id, number, kind, student_id, amount_minor, reason, ledger_account_id)
         VALUES ($1, 'ADJ-FK-1', 'credit_note', $2, 100, 'x', $3)`,
        [orgA.id, studentLekki.id, ledgerB]
      )
    ).rejects.toMatchObject({
      code: '23503',
      constraint: 'adjustment_ledger_account_id_organization_id_fkey',
    });
    await expect(
      pool.query(
        `INSERT INTO adjustment (organization_id, number, kind, student_id, amount_minor, reason, ledger_account_id, invoice_id)
         VALUES ($1, 'ADJ-FK-2', 'credit_note', $2, 100, 'x', $3, $4)`,
        [orgB.id, studentB.id, ledgerB, chargeA?.id]
      )
    ).rejects.toMatchObject({
      code: '23503',
      constraint: 'adjustment_invoice_id_organization_id_fkey',
    });
    await expect(
      pool.query(
        `INSERT INTO adjustment (organization_id, number, kind, student_id, amount_minor, reason, journal_entry_id)
         VALUES ($1, 'ADJ-FK-3', 'write_off', $2, 100, 'x', $3)`,
        [orgA.id, studentLekki.id, entryB]
      )
    ).rejects.toMatchObject({
      code: '23503',
      constraint: 'adjustment_journal_entry_id_organization_id_fkey',
    });
    await pool.query(
      `INSERT INTO adjustment (organization_id, number, kind, student_id, amount_minor, reason, ledger_account_id)
       VALUES ($1, 'ADJ-FK-4', 'credit_note', $2, 100, 'x', $3)`,
      [orgA.id, studentLekki.id, ledgerA]
    );
  });

  test('a cancellation refuses another school’s journal entry on its own', async ({
    api,
    app,
    pool,
    schools: { owner, ownerB, orgA, studentLekki, studentB },
  }) => {
    const accountA = await bankAccount(app, owner);
    const receiptA = await recordCash(api, owner, {
      accountId: accountA.id,
      allocations: [{ studentId: studentLekki.id, amountMinor: PAID }],
    });
    const accountB = await bankAccount(app, ownerB);
    const receiptB = await recordCash(api, ownerB, {
      accountId: accountB.id,
      allocations: [{ studentId: studentB.id, amountMinor: PAID }],
    });
    const { rows } = await pool.query<{ journal_entry_id: string }>(
      `SELECT journal_entry_id FROM payment WHERE id = $1`,
      [receiptB.id]
    );

    await expect(
      pool.query(
        `INSERT INTO payment_void (organization_id, payment_id, reason, journal_entry_id)
         VALUES ($1, $2, 'x', $3)`,
        [orgA.id, receiptA.id, rows[0]?.journal_entry_id]
      )
    ).rejects.toMatchObject({
      code: '23503',
      constraint: 'payment_void_journal_entry_id_organization_id_fkey',
    });
  });
});

test.describe('an acting super admin without a reason', () => {
  test('gets 403 on every write route of adjustments, discounts, cancellations and approval rules', async ({
    api,
    app,
    pool,
    createUser,
    makeSuperAdmin,
    schools: { owner, orgA, lekkiOnly, studentLekki },
  }) => {
    await owes(app, owner, { studentId: studentLekki.id, amountMinor: OWED });
    const fixture = await chargeFixture(app, api, owner);
    const tuition = await ledgerAccountId(pool, orgA.id, 4010);
    const account = await bankAccount(app, owner);
    const receipt = await recordCash(api, owner, {
      accountId: account.id,
      allocations: [{ studentId: studentLekki.id, amountMinor: PAID }],
    });
    const { adjustment } = await askAdjustment(api, lekkiOnly, {
      kind: 'credit_note',
      studentId: studentLekki.id,
      amountMinor: 100_000,
      reason: 'Late enrolment',
    });
    const { discount: waiting } = await askDiscount(api, lekkiOnly, {
      studentId: studentLekki.id,
      kind: 'percent',
      value: 10,
      ledgerAccountId: tuition,
      fromTermId: fixture.secondTermId,
      reason: 'Staff child',
    });
    const { discount: approved } = await askDiscount(api, lekkiOnly, {
      studentId: studentLekki.id,
      kind: 'fixed',
      value: 500_000,
      ledgerAccountId: tuition,
      fromTermId: fixture.secondTermId,
      reason: 'Sibling',
    });
    await approveDiscount(api, owner, approved.id);
    const admin = await makeSuperAdmin(await createUser());

    const writes = [
      () =>
        api(admin).post('/finance/adjustments').send({
          kind: 'write_off',
          studentId: studentLekki.id,
          amountMinor: 100,
          reason: 'x',
        }),
      () => api(admin).post(`/finance/adjustments/${adjustment.id}/approve`),
      () =>
        api(admin)
          .post(`/finance/adjustments/${adjustment.id}/decline`)
          .send({ reason: 'No' }),
      () =>
        api(admin).post('/finance/discounts').send({
          studentId: studentLekki.id,
          kind: 'percent',
          value: 5,
          ledgerAccountId: tuition,
          fromTermId: fixture.secondTermId,
          reason: 'x',
        }),
      () => api(admin).post(`/finance/discounts/${waiting.id}/approve`),
      () =>
        api(admin)
          .post(`/finance/discounts/${waiting.id}/decline`)
          .send({ reason: 'No' }),
      () =>
        api(admin)
          .post(`/finance/discounts/${approved.id}/end`)
          .send({ lastTermId: fixture.secondTermId }),
      () =>
        api(admin)
          .post(`/finance/payments/${receipt.id}/void-requests`)
          .send({ reason: 'Wrong child' }),
      () =>
        api(admin)
          .patch('/school-settings/approval-rules')
          .send({ discount: false }),
    ];
    for (const write of writes) {
      const res = await write().set(acting(orgA.id));
      expect(res.status, `${res.request.method} ${res.request.url}`).toBe(403);
      expect(res.body.code).toBe('ActingReadOnly');
    }

    const { void: asked } = await askVoid(api, lekkiOnly, receipt.id);
    await api(admin)
      .post(`/finance/payment-voids/${asked.id}/approve`)
      .set(acting(orgA.id, REASON))
      .expect(200);
  });
});
