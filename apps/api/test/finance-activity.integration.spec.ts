import type { Pool } from 'pg';
import { FEE_SCHEDULE_KINDS } from '../src/app/common/activity';
import { expect } from './support/base-test';
import {
  askAdjustment,
  approveAdjustment,
  approveDiscount,
  approveVoid,
  askDiscount,
  askVoid,
  switchApproval,
} from './support/factories/approvals';
import { chargeFixture, prepare, sendRun } from './support/factories/billing';
import { financeTexts, ledgerAccountId } from './support/factories/finance';
import {
  bankAccount,
  cashBody,
  owes,
  recordCash,
} from './support/factories/payments';
import { schoolsTest as test } from './support/two-schools';

interface FinanceRow {
  kind: string;
  campus_id: string | null;
  text: string;
}

const SCHEDULE_KINDS = Object.values(FEE_SCHEDULE_KINDS);

const queryRows = async (
  pool: Pool,
  organizationId: string,
  kindTest: 'kind = ANY($2)' | 'kind <> ALL($2)'
): Promise<FinanceRow[]> =>
  (
    await pool.query<FinanceRow>(
      `SELECT kind, campus_id, text FROM activity_event
       WHERE organization_id = $1 AND pillar = 'finance' AND ${kindTest}
       ORDER BY kind, campus_id`,
      [organizationId, SCHEDULE_KINDS]
    )
  ).rows;

const financeRows = (pool: Pool, organizationId: string) =>
  queryRows(pool, organizationId, 'kind <> ALL($2)');

const feeScheduleRows = (pool: Pool, organizationId: string) =>
  queryRows(pool, organizationId, 'kind = ANY($2)');

const compare = (a: string, b: string) => a.localeCompare(b);

const kindsAndCampuses = (rows: FinanceRow[]) =>
  rows.map((row) => [row.kind, row.campus_id]);

const OWED = 18_000_000;
const LEKKI_SHARE = 6_000_000;
const IKEJA_SHARE = 2_500_000;

test.describe('finance activity', () => {
  test('a payment across two campuses writes one row per campus with that campus’s share', async ({
    api,
    app,
    pool,
    schools: { owner, orgA, lekki, ikeja, studentLekki, studentIkeja },
  }) => {
    const account = await bankAccount(app, owner);
    await owes(app, owner, { studentId: studentLekki.id, amountMinor: OWED });
    await owes(app, owner, { studentId: studentIkeja.id, amountMinor: OWED });

    const receipt = await recordCash(api, owner, {
      accountId: account.id,
      payerName: 'Mrs Danjuma',
      allocations: [
        { studentId: studentLekki.id, amountMinor: LEKKI_SHARE },
        { studentId: studentIkeja.id, amountMinor: IKEJA_SHARE },
      ],
    });

    const rows = await financeRows(pool, orgA.id);
    expect(rows.map((row) => row.campus_id ?? '').toSorted(compare)).toEqual(
      [lekki.id, ikeja.id].toSorted(compare)
    );
    const lekkiRow = rows.find((row) => row.campus_id === lekki.id);
    const ikejaRow = rows.find((row) => row.campus_id === ikeja.id);
    expect(lekkiRow?.kind).toBe('payment.recorded');
    expect(lekkiRow?.text).toMatch(
      new RegExp(
        String.raw`^Payment ${receipt.receiptNumber} from Mrs Danjuma recorded by .+: ₦60,000 of it for this campus\.$`
      )
    );
    expect(ikejaRow?.text).toMatch(
      new RegExp(
        String.raw`^Payment ${receipt.receiptNumber} from Mrs Danjuma recorded by .+: ₦25,000 of it for this campus\.$`
      )
    );
  });

  test('a replayed payment reference writes no second row', async ({
    api,
    app,
    pool,
    schools: { owner, orgA, studentLekki },
  }) => {
    const account = await bankAccount(app, owner);
    await owes(app, owner, { studentId: studentLekki.id, amountMinor: OWED });
    const body = cashBody({
      accountId: account.id,
      allocations: [{ studentId: studentLekki.id, amountMinor: LEKKI_SHARE }],
    });

    await api(owner).post('/finance/payments').send(body).expect(201);
    const again = await api(owner).post('/finance/payments').send(body);

    expect(again.body).toMatchObject({ replayed: true });
    expect(await financeRows(pool, orgA.id)).toHaveLength(1);
  });

  test('sending a round writes one row per campus, and sending it again writes nothing', async ({
    api,
    app,
    pool,
    schools: { owner, orgA, lekki, ikeja },
  }) => {
    const fixture = await chargeFixture(app, api, owner);
    const prepared = await prepare(api, owner, {
      termId: fixture.secondTermId,
      scope: 'school',
    });

    await sendRun(api, owner, prepared.runId ?? '');

    const rows = await financeRows(pool, orgA.id);
    expect(rows.map((row) => row.kind)).toEqual(['round.sent', 'round.sent']);
    expect(rows.map((row) => row.campus_id ?? '').toSorted(compare)).toEqual(
      [lekki.id, ikeja.id].toSorted(compare)
    );
    for (const row of rows) {
      expect(row.text).toMatch(
        new RegExp(
          String.raw`sent round ${prepared.number}: 1 charge, ₦220,000\.$`
        )
      );
    }
    await api(owner).post(`/billing-runs/${prepared.runId}/issue`).expect(409);
    expect(await financeRows(pool, orgA.id)).toHaveLength(2);
  });

  test('a cancellation writes a row when approved or declined, never when asked or decided twice', async ({
    api,
    app,
    pool,
    schools: { owner, orgA, lekki, lekkiOnly, studentLekki },
  }) => {
    const account = await bankAccount(app, owner);
    await owes(app, owner, { studentId: studentLekki.id, amountMinor: OWED });
    const first = await recordCash(api, owner, {
      accountId: account.id,
      allocations: [{ studentId: studentLekki.id, amountMinor: LEKKI_SHARE }],
    });
    const second = await recordCash(api, owner, {
      accountId: account.id,
      allocations: [{ studentId: studentLekki.id, amountMinor: IKEJA_SHARE }],
    });
    const recorded = (await financeRows(pool, orgA.id)).length;

    const { void: waiting } = await askVoid(api, lekkiOnly, first.id);
    const { void: toDecline } = await askVoid(api, lekkiOnly, second.id);
    expect(await financeRows(pool, orgA.id)).toHaveLength(recorded);

    await approveVoid(api, owner, waiting.id);
    await api(owner)
      .post(`/finance/payment-voids/${toDecline.id}/decline`)
      .send({ reason: 'Parent confirmed it is right' })
      .expect(200);
    await api(owner)
      .post(`/finance/payment-voids/${waiting.id}/approve`)
      .expect(409);
    await api(owner)
      .post(`/finance/payment-voids/${toDecline.id}/decline`)
      .send({ reason: 'Again' })
      .expect(409);

    const rows = (await financeRows(pool, orgA.id)).filter(
      (row) => row.kind !== 'payment.recorded'
    );
    expect(kindsAndCampuses(rows)).toEqual([
      ['payment.cancelled', lekki.id],
      ['payment_void.declined', lekki.id],
    ]);
    expect(rows[0]?.text).toContain(
      `Payment ${first.receiptNumber} (₦60,000 from Mrs Ojo) was cancelled, approved by`
    );
    expect(rows[1]?.text).toMatch(
      new RegExp(
        String.raw`^Cancelling payment ${second.receiptNumber} was declined: Parent confirmed it is right$`
      )
    );
  });

  test('a cancellation made straight through (approval off) writes one row', async ({
    api,
    app,
    pool,
    schools: { owner, orgA, lekki, studentLekki },
  }) => {
    await switchApproval(api, owner, { paymentVoid: false });
    const account = await bankAccount(app, owner);
    await owes(app, owner, { studentId: studentLekki.id, amountMinor: OWED });
    const receipt = await recordCash(api, owner, {
      accountId: account.id,
      allocations: [{ studentId: studentLekki.id, amountMinor: LEKKI_SHARE }],
    });

    await askVoid(api, owner, receipt.id);

    const rows = (await financeRows(pool, orgA.id)).filter(
      (row) => row.kind === 'payment.cancelled'
    );
    expect(kindsAndCampuses(rows)).toEqual([['payment.cancelled', lekki.id]]);
    expect(rows[0]?.text).toMatch(/was cancelled by .+\.$/);
  });

  test('an adjustment writes a row when approved or declined, and none while it waits', async ({
    api,
    app,
    pool,
    schools: { owner, orgA, lekki, lekkiOnly, studentLekki },
  }) => {
    await owes(app, owner, { studentId: studentLekki.id, amountMinor: OWED });
    const ask = () =>
      askAdjustment(api, lekkiOnly, {
        kind: 'credit_note',
        studentId: studentLekki.id,
        amountMinor: 1_200_000,
        reason: 'Late enrolment',
      });
    const approving = (await ask()).adjustment;
    const declining = (await ask()).adjustment;
    expect(await financeRows(pool, orgA.id)).toEqual([]);

    await approveAdjustment(api, owner, approving.id);
    await api(owner)
      .post(`/finance/adjustments/${declining.id}/decline`)
      .send({ reason: 'Not agreed with the owner' })
      .expect(200);
    await api(owner)
      .post(`/finance/adjustments/${approving.id}/approve`)
      .expect(409);

    const rows = await financeRows(pool, orgA.id);
    expect(kindsAndCampuses(rows)).toEqual([
      ['adjustment.approved', lekki.id],
      ['adjustment.declined', lekki.id],
    ]);
    expect(rows[0]?.text).toMatch(
      new RegExp(
        String.raw`^Reduce a fee ${approving.number} for .+, ₦12,000, approved by .+\.$`
      )
    );
    expect(rows[1]?.text).toMatch(
      new RegExp(
        String.raw`^Reduce a fee ${declining.number} for .+ was declined: Not agreed with the owner$`
      )
    );
  });

  test('a discount writes a row when approved or declined, and none while it waits', async ({
    api,
    app,
    pool,
    schools: { owner, orgA, lekki, lekkiOnly, studentLekki },
  }) => {
    const fixture = await chargeFixture(app, api, owner);
    const tuition = await ledgerAccountId(pool, orgA.id, 4010);
    const ask = () =>
      askDiscount(api, lekkiOnly, {
        studentId: studentLekki.id,
        kind: 'percent',
        value: 10,
        ledgerAccountId: tuition,
        fromTermId: fixture.secondTermId,
        reason: 'Staff child',
      });
    const approving = (await ask()).discount;
    const declining = (await ask()).discount;
    expect(await financeRows(pool, orgA.id)).toEqual([]);

    await approveDiscount(api, owner, approving.id);
    await api(owner)
      .post(`/finance/discounts/${declining.id}/decline`)
      .send({ reason: 'Not agreed with the owner' })
      .expect(200);
    await api(owner)
      .post(`/finance/discounts/${approving.id}/approve`)
      .expect(409);

    const rows = await financeRows(pool, orgA.id);
    expect(kindsAndCampuses(rows)).toEqual([
      ['discount.approved', lekki.id],
      ['discount.declined', lekki.id],
    ]);
    expect(rows[0]?.text).toMatch(/^Discount for .+ \(10%\) approved by .+\.$/);
    expect(rows[1]?.text).toMatch(
      /^Discount for .+ was declined: Not agreed with the owner$/
    );
  });

  test('a discount made straight through (approval off) writes one row', async ({
    api,
    app,
    pool,
    schools: { owner, orgA, lekki, studentLekki },
  }) => {
    const fixture = await chargeFixture(app, api, owner);
    await switchApproval(api, owner, { discount: false });

    const { autoApproved } = await askDiscount(api, owner, {
      studentId: studentLekki.id,
      kind: 'fixed',
      value: 500_000,
      ledgerAccountId: null,
      fromTermId: fixture.secondTermId,
      reason: 'Hardship',
    });

    expect(autoApproved).toBe(true);
    const rows = await financeRows(pool, orgA.id);
    expect(kindsAndCampuses(rows)).toEqual([['discount.approved', lekki.id]]);
    expect(rows[0]?.text).toMatch(/\(₦5,000\) applied by .+\.$/);
  });

  test('finance rows reach finance readers in campus scope and nobody else', async ({
    api,
    app,
    pool,
    schools: {
      owner,
      ownerB,
      lekkiOnly,
      noPermission,
      orgA,
      orgB,
      studentLekki,
      studentIkeja,
      studentB,
    },
  }) => {
    const account = await bankAccount(app, owner);
    await owes(app, owner, { studentId: studentLekki.id, amountMinor: OWED });
    await owes(app, owner, { studentId: studentIkeja.id, amountMinor: OWED });
    const lekkiReceipt = await recordCash(api, owner, {
      accountId: account.id,
      allocations: [{ studentId: studentLekki.id, amountMinor: LEKKI_SHARE }],
    });
    const ikejaReceipt = await recordCash(api, owner, {
      accountId: account.id,
      allocations: [{ studentId: studentIkeja.id, amountMinor: IKEJA_SHARE }],
    });
    expect(await financeRows(pool, orgA.id)).toHaveLength(2);
    const accountB = await bankAccount(app, ownerB);
    await owes(app, ownerB, { studentId: studentB.id, amountMinor: OWED });
    await recordCash(api, ownerB, {
      accountId: accountB.id,
      allocations: [{ studentId: studentB.id, amountMinor: LEKKI_SHARE }],
    });
    expect(await financeRows(pool, orgB.id)).toHaveLength(1);

    const ownerSees = await financeTexts(api, owner);
    const lekkiSees = await financeTexts(api, lekkiOnly);

    expect(ownerSees).toHaveLength(2);
    expect(lekkiSees).toHaveLength(1);
    expect(lekkiSees[0]).toContain(lekkiReceipt.receiptNumber);
    expect(lekkiSees.join(' ')).not.toContain(ikejaReceipt.receiptNumber);
    expect(await financeTexts(api, noPermission)).toEqual([]);
    expect(await financeTexts(api, ownerB)).toHaveLength(1);
  });

  test('either finance read opens every finance row, and no other permission does', async ({
    api,
    app,
    pool,
    withPermissions,
    schools: { owner, orgA, lekki, ikeja, lekkiOnly, studentLekki },
  }) => {
    const account = await bankAccount(app, owner);
    const fixture = await chargeFixture(app, api, owner);
    await owes(app, owner, { studentId: studentLekki.id, amountMinor: OWED });
    const receipt = await recordCash(api, owner, {
      accountId: account.id,
      allocations: [{ studentId: studentLekki.id, amountMinor: LEKKI_SHARE }],
    });
    const prepared = await prepare(api, owner, {
      termId: fixture.secondTermId,
      scope: 'school',
    });
    await sendRun(api, owner, prepared.runId ?? '');
    const credit = await askAdjustment(api, lekkiOnly, {
      kind: 'credit_note',
      studentId: studentLekki.id,
      amountMinor: 1_200_000,
      reason: 'Late enrolment',
    });
    await approveAdjustment(api, owner, credit.adjustment.id);
    expect(
      (await financeRows(pool, orgA.id))
        .map((row) => row.kind)
        .toSorted(compare)
    ).toEqual([
      'adjustment.approved',
      'payment.recorded',
      'round.sent',
      'round.sent',
    ]);

    expect(
      (await feeScheduleRows(pool, orgA.id)).map((row) => row.kind)
    ).toEqual(['fee_line.created', 'fee_line.created', 'fee_line.created']);

    const campuses = [lekki, ikeja];
    const invoiceOnly = await withPermissions(orgA, ['invoice:read'], {
      campuses,
    });
    const paymentOnly = await withPermissions(orgA, ['payment:read'], {
      campuses,
    });
    const closed = await withPermissions(
      orgA,
      ['adjustment:read', 'feeLine:read', 'schoolAccount:read'],
      { campuses }
    );
    const invoiceSees = await financeTexts(api, invoiceOnly);
    const paymentSees = await financeTexts(api, paymentOnly);

    expect(invoiceSees).toHaveLength(7);
    expect(paymentSees).toEqual(invoiceSees);
    expect(invoiceSees.join(' ')).toContain(receipt.receiptNumber);
    expect(invoiceSees.join(' ')).toContain(credit.adjustment.number);
    expect(await financeTexts(api, closed)).toEqual([]);
  });
});
