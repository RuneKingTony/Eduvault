import type { INestApplication } from '@nestjs/common';
import type { Pool } from 'pg';
import { FEE_SCHEDULE_KINDS } from '../src/app/common/activity';
import { expect, type Fixtures, type TestUser } from './support/base-test';
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
import {
  createMoneyAccount,
  financeActivityRows,
  type FinanceActivityRow,
  financeTexts,
  ledgerAccountId,
} from './support/factories/finance';
import {
  bankAccount,
  cashBody,
  owes,
  recordCash,
} from './support/factories/payments';
import {
  approveCount,
  createItem,
  declineCount,
  receive,
  sell,
  submitCount,
} from './support/factories/store';
import { schoolsTest as test } from './support/two-schools';

const SCHEDULE_KINDS: string[] = Object.values(FEE_SCHEDULE_KINDS);

const financeRows = async (pool: Pool, organizationId: string) =>
  (await financeActivityRows(pool, organizationId)).filter(
    (row) => !SCHEDULE_KINDS.includes(row.kind)
  );

const feeScheduleRows = async (pool: Pool, organizationId: string) =>
  (await financeActivityRows(pool, organizationId)).filter((row) =>
    SCHEDULE_KINDS.includes(row.kind)
  );

const compare = (a: string, b: string) => a.localeCompare(b);

const kindsAndCampuses = (rows: FinanceActivityRow[]) =>
  rows.map((row) => [row.kind, row.campus_id]);

async function stockedShirt(
  api: Fixtures['api'],
  app: INestApplication,
  who: { owner: TestUser; counter: TestUser; lekki: { id: string } }
) {
  const { owner, counter, lekki } = who;
  const cash = await createMoneyAccount(app, owner, {
    name: 'Lekki cash box',
    kind: 'cash',
    campusId: lekki.id,
  });
  const shirt = await createItem(api, owner);
  await receive(api, owner, {
    campusId: lekki.id,
    accountId: cash.id,
    lines: [{ itemId: shirt.id, quantity: 5, unitCostMinor: 350_000 }],
  });
  const counted = (countedQuantity: number) =>
    submitCount(api, counter, {
      campusId: lekki.id,
      lines: [{ itemId: shirt.id, countedQuantity }],
    });
  return { shirt, counted };
}

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

  test('cancelling a prepared round writes one row per campus with its share, and cancelling again writes nothing', async ({
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
    expect(await financeRows(pool, orgA.id)).toEqual([]);

    await api(owner).post(`/billing-runs/${prepared.runId}/cancel`).expect(201);

    const rows = await financeRows(pool, orgA.id);
    expect(rows.map((row) => row.kind)).toEqual([
      'round.cancelled',
      'round.cancelled',
    ]);
    expect(rows.map((row) => row.campus_id ?? '').toSorted(compare)).toEqual(
      [lekki.id, ikeja.id].toSorted(compare)
    );
    for (const row of rows) {
      expect(row.text).toMatch(
        new RegExp(
          String.raw`cancelled round ${prepared.number} before it was sent: 1 prepared charge, ₦220,000\.$`
        )
      );
    }
    await api(owner).post(`/billing-runs/${prepared.runId}/cancel`).expect(409);
    expect(await financeRows(pool, orgA.id)).toHaveLength(2);
  });

  test('cancelling a sent round is refused and writes no cancelled row', async ({
    api,
    app,
    pool,
    schools: { owner, orgA },
  }) => {
    const fixture = await chargeFixture(app, api, owner);
    const prepared = await prepare(api, owner, {
      termId: fixture.secondTermId,
      scope: 'school',
    });
    await sendRun(api, owner, prepared.runId ?? '');

    await api(owner).post(`/billing-runs/${prepared.runId}/cancel`).expect(409);

    expect((await financeRows(pool, orgA.id)).map((row) => row.kind)).toEqual([
      'round.sent',
      'round.sent',
    ]);
  });

  test('a cancelled round’s rows reach a finance reader on that campus only, and no other school or member', async ({
    api,
    app,
    schools: { owner, ownerB, lekkiOnly, noPermission },
  }) => {
    const fixture = await chargeFixture(app, api, owner);
    const prepared = await prepare(api, owner, {
      termId: fixture.secondTermId,
      scope: 'school',
    });
    await api(owner).post(`/billing-runs/${prepared.runId}/cancel`).expect(201);

    const cancelled = async (actor: typeof owner) =>
      (await financeTexts(api, actor)).filter((text) =>
        text.includes(`cancelled round ${prepared.number}`)
      );
    expect(await cancelled(owner)).toHaveLength(2);
    expect(await cancelled(lekkiOnly)).toHaveLength(1);
    expect(await financeTexts(api, noPermission)).toEqual([]);
    expect(await financeTexts(api, ownerB)).toEqual([]);
  });

  test('another school cannot cancel a round or end a discount, and a refused try writes no row', async ({
    api,
    app,
    pool,
    schools: { owner, ownerB, orgA, studentLekki },
  }) => {
    const fixture = await chargeFixture(app, api, owner);
    const prepared = await prepare(api, owner, {
      termId: fixture.secondTermId,
      scope: 'school',
    });
    await switchApproval(api, owner, { discount: false });
    const { discount } = await askDiscount(api, owner, {
      studentId: studentLekki.id,
      kind: 'percent',
      value: 10,
      ledgerAccountId: null,
      fromTermId: fixture.secondTermId,
      reason: 'Staff child',
    });
    const before = await financeRows(pool, orgA.id);

    await api(ownerB)
      .post(`/billing-runs/${prepared.runId}/cancel`)
      .expect(404);
    await api(ownerB)
      .post(`/finance/discounts/${discount.id}/end`)
      .send({ lastTermId: fixture.secondTermId })
      .expect(404);

    expect(await financeRows(pool, orgA.id)).toEqual(before);
    expect(await financeTexts(api, ownerB)).toEqual([]);
  });

  test('a discount ended on one campus is hidden from a reader on another campus and from a member without finance read', async ({
    api,
    app,
    pool,
    schools: { owner, orgA, ikeja, lekkiOnly, noPermission, studentIkeja },
  }) => {
    const fixture = await chargeFixture(app, api, owner);
    await switchApproval(api, owner, { discount: false });
    const { discount } = await askDiscount(api, owner, {
      studentId: studentIkeja.id,
      kind: 'percent',
      value: 10,
      ledgerAccountId: null,
      fromTermId: fixture.secondTermId,
      reason: 'Staff child',
    });

    await api(owner)
      .post(`/finance/discounts/${discount.id}/end`)
      .send({ lastTermId: fixture.secondTermId })
      .expect(200);

    const rows = (await financeRows(pool, orgA.id)).filter(
      (row) => row.kind === 'discount.ended'
    );
    expect(kindsAndCampuses(rows)).toEqual([['discount.ended', ikeja.id]]);
    expect(
      (await financeTexts(api, lekkiOnly)).filter((text) =>
        text.includes('ended by')
      )
    ).toEqual([]);
    expect(await financeTexts(api, noPermission)).toEqual([]);
  });

  test('ending a discount writes one row on the student’s campus, and ending it again at the same term writes nothing', async ({
    api,
    app,
    pool,
    schools: { owner, ownerB, orgA, lekki, lekkiOnly, studentLekki },
  }) => {
    const fixture = await chargeFixture(app, api, owner);
    const { discount } = await askDiscount(api, lekkiOnly, {
      studentId: studentLekki.id,
      kind: 'percent',
      value: 10,
      ledgerAccountId: null,
      fromTermId: fixture.secondTermId,
      reason: 'Staff child',
    });
    await approveDiscount(api, owner, discount.id);
    const end = () =>
      api(owner)
        .post(`/finance/discounts/${discount.id}/end`)
        .send({ lastTermId: fixture.secondTermId })
        .expect(200);

    await end();
    await end();

    const rows = (await financeRows(pool, orgA.id)).filter(
      (row) => row.kind === 'discount.ended'
    );
    expect(kindsAndCampuses(rows)).toEqual([['discount.ended', lekki.id]]);
    expect(rows[0]?.text).toMatch(
      /^Discount for .+ \(10%\) ended by .+ after .+\.$/
    );
    expect(await financeTexts(api, ownerB)).toEqual([]);
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

  test('a store sale’s row reaches a finance reader on that campus only, and no other campus, school or member', async ({
    api,
    app,
    clock,
    withPermissions,
    schools: {
      owner,
      ownerB,
      orgA,
      lekki,
      ikeja,
      lekkiOnly,
      noPermission,
      studentLekki,
    },
  }) => {
    clock.set('2026-10-07');
    const cash = await createMoneyAccount(app, owner, {
      name: 'Lekki cash box',
      kind: 'cash',
      campusId: lekki.id,
    });
    const shirt = await createItem(api, owner);
    await receive(api, owner, {
      campusId: lekki.id,
      accountId: cash.id,
      lines: [{ itemId: shirt.id, quantity: 5, unitCostMinor: 350_000 }],
    });
    const sale = await sell(api, owner, {
      studentId: studentLekki.id,
      lines: [{ itemId: shirt.id, quantity: 2 }],
    });
    const campuses = [lekki, ikeja];
    const invoiceOnly = await withPermissions(orgA, ['invoice:read'], {
      campuses: [lekki],
    });
    const paymentOnly = await withPermissions(orgA, ['payment:read'], {
      campuses: [lekki],
    });
    const ikejaReader = await withPermissions(orgA, ['payment:read'], {
      campuses: [ikeja],
    });
    const storeOnly = await withPermissions(
      orgA,
      ['store:read', 'store:issue'],
      { campuses }
    );

    const sold = async (actor: typeof owner) =>
      (await financeTexts(api, actor)).filter((text) =>
        text.includes(`sale ${sale.number}`)
      );

    expect(await sold(owner)).toHaveLength(1);
    expect(await sold(lekkiOnly)).toHaveLength(1);
    expect(await sold(invoiceOnly)).toHaveLength(1);
    expect(await sold(paymentOnly)).toHaveLength(1);
    expect(await financeTexts(api, ikejaReader)).toEqual([]);
    expect(await financeTexts(api, storeOnly)).toEqual([]);
    expect(await financeTexts(api, noPermission)).toEqual([]);
    expect(await financeTexts(api, ownerB)).toEqual([]);
  });

  test('a store write-off writes a row when approved or declined, and none while it waits, when it matches or when decided twice', async ({
    api,
    app,
    clock,
    pool,
    schools: { owner, orgA, lekki, lekkiOnly },
  }) => {
    clock.set('2026-10-07');
    const { counted } = await stockedShirt(api, app, {
      owner,
      counter: lekkiOnly,
      lekki,
    });

    const matched = await counted(5);
    const approving = await counted(3);
    expect(matched.status).toBe('matched');
    expect(approving.status).toBe('submitted');
    expect(await financeRows(pool, orgA.id)).toEqual([]);

    await approveCount(api, owner, approving.id);
    await api(owner).post(`/store/counts/${approving.id}/approve`).expect(409);
    await api(owner)
      .post(`/store/counts/${approving.id}/decline`)
      .send({ reason: 'Too late' })
      .expect(409);
    await api(owner).post(`/store/counts/${matched.id}/approve`).expect(409);
    expect(await financeRows(pool, orgA.id)).toHaveLength(1);

    const declining = await counted(4);
    await declineCount(api, owner, {
      id: declining.id,
      reason: 'Recount the shelf first',
    });
    await api(owner).post(`/store/counts/${declining.id}/approve`).expect(409);

    const rows = await financeRows(pool, orgA.id);
    expect(kindsAndCampuses(rows)).toEqual([
      ['store_write_off.approved', lekki.id],
      ['store_write_off.declined', lekki.id],
    ]);
    expect(rows[0]?.text).toMatch(
      new RegExp(
        String.raw`^Store write-off ${approving.number} at the Lekki store: 1 item differs, ₦7,000 lost, approved by .+\.$`
      )
    );
    expect(rows[1]?.text).toBe(
      `Store write-off ${declining.number} at the Lekki store was declined: Recount the shelf first`
    );
  });

  test('a write-off made straight through (approval off) writes one applied row, and a matched count none', async ({
    api,
    app,
    clock,
    pool,
    schools: { owner, orgA, lekki, lekkiOnly },
  }) => {
    clock.set('2026-10-07');
    const { counted } = await stockedShirt(api, app, {
      owner,
      counter: lekkiOnly,
      lekki,
    });
    await switchApproval(api, owner, { writeOff: false });

    expect((await counted(5)).status).toBe('matched');
    expect(await financeRows(pool, orgA.id)).toEqual([]);
    const applied = await counted(6);

    expect(applied.status).toBe('approved');
    const rows = await financeRows(pool, orgA.id);
    expect(kindsAndCampuses(rows)).toEqual([
      ['store_write_off.approved', lekki.id],
    ]);
    expect(rows[0]?.text).toMatch(
      new RegExp(
        String.raw`^Store write-off ${applied.number} at the Lekki store: 1 item differs, ₦3,500 found, applied by .+\.$`
      )
    );
  });

  test('a store write-off’s row reaches a finance reader on that campus only, and no other campus, school or member', async ({
    api,
    app,
    clock,
    withPermissions,
    schools: { owner, ownerB, orgA, lekki, ikeja, lekkiOnly, noPermission },
  }) => {
    clock.set('2026-10-07');
    const { counted } = await stockedShirt(api, app, {
      owner,
      counter: lekkiOnly,
      lekki,
    });
    const count = await counted(3);
    await approveCount(api, owner, count.id);
    const campuses = [lekki, ikeja];
    const invoiceOnly = await withPermissions(orgA, ['invoice:read'], {
      campuses: [lekki],
    });
    const paymentOnly = await withPermissions(orgA, ['payment:read'], {
      campuses: [lekki],
    });
    const ikejaReader = await withPermissions(orgA, ['payment:read'], {
      campuses: [ikeja],
    });
    const storeOnly = await withPermissions(
      orgA,
      ['store:read', 'store:count', 'adjustment:approve'],
      { campuses }
    );

    const written = async (actor: typeof owner) =>
      (await financeTexts(api, actor)).filter((text) =>
        text.includes(`Store write-off ${count.number}`)
      );

    expect(await written(owner)).toHaveLength(1);
    expect(await written(lekkiOnly)).toHaveLength(1);
    expect(await written(invoiceOnly)).toHaveLength(1);
    expect(await written(paymentOnly)).toHaveLength(1);
    expect(await financeTexts(api, ikejaReader)).toEqual([]);
    expect(await financeTexts(api, storeOnly)).toEqual([]);
    expect(await financeTexts(api, noPermission)).toEqual([]);
    expect(await financeTexts(api, ownerB)).toEqual([]);
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
