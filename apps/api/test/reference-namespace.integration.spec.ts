import type { INestApplication } from '@nestjs/common';
import {
  JOURNAL_REFERENCE_CLASH_MESSAGE,
  RESERVED_REFERENCE_MESSAGE,
} from '@eduvault/api-contract';
import type { Pool } from 'pg';
import { KYSELY_TOKEN, type Database } from '../src/app/common/db/tokens';
import { LedgerPoster, type PostInput } from '../src/app/common/ledger';
import { writePayment, type NewPayment } from '../src/app/common/payments';
import { expect, type Fixtures, type TestUser } from './support/base-test';
import {
  approveAdjustment,
  approveVoid,
  askAdjustment,
  askVoid,
  entryCount,
} from './support/factories/approvals';
import {
  chargeFixture,
  entriesFor,
  invoicesOf,
  prepare,
  receivableBalance,
  sendRun,
} from './support/factories/billing';
import {
  createMoneyAccount,
  ledgerAccountId,
} from './support/factories/finance';
import {
  bankAccount,
  cashBody,
  nextReference,
  owes,
  receiptOf,
  recordCash,
} from './support/factories/payments';
import {
  createItem,
  openStock,
  receive,
  submitCount,
} from './support/factories/store';
import { schoolsTest as test } from './support/two-schools';

type Api = Fixtures['api'];

const OWED = 1_200_000;
const PAID = 300_000;

const RESERVED_REFERENCES = [
  'CHG-2026-00013',
  'RCT-2026-00001',
  'BR-2026-0001',
  'ADJ-2026-0001',
  'ISS-2026-0001',
  'DEL-2026-0004',
  'CNT-2026-0001',
  'VOID-CSH-20261007-000001',
  'OPEN-STORE-1b2c',
  'OPEN-MA-1b2c',
  'OPEN-1b2c',
  'WMIG-5d7e0f2a',
  'CHG-2026-00001-COST',
  'adj-2026-0001',
  '  Del-2026-0004  ',
];

test.beforeEach(({ clock }) => {
  clock.set('2026-10-07');
});

const messageOf = (res: {
  body: { message: string; issues?: { message: string }[] };
}): string => res.body.issues?.[0]?.message ?? res.body.message;

const countOf = async (pool: Pool, table: string): Promise<number> =>
  Number(
    (
      await pool.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM ${table}`
      )
    ).rows[0]?.n
  );

async function plant(
  app: INestApplication,
  pool: Pool,
  { organizationId, reference }: { organizationId: string; reference: string }
): Promise<void> {
  const [money, income] = await Promise.all([
    ledgerAccountId(pool, organizationId, 1200),
    ledgerAccountId(pool, organizationId, 4000),
  ]);
  const poster = app.get(LedgerPoster, { strict: false });
  const db = app.get<Database>(KYSELY_TOKEN, { strict: false });
  const entry: PostInput = {
    organizationId,
    reference,
    kind: 'adhoc',
    effectiveOn: '2026-10-01',
    postedBy: null,
    lines: [
      { ledgerAccountId: money, debitMinor: 5, creditMinor: 0 },
      { ledgerAccountId: income, debitMinor: 0, creditMinor: 5 },
    ],
  };
  await db.transaction().execute((trx) => poster.post(trx, entry));
}

async function postPayment(
  api: Api,
  actor: TestUser,
  input: { reference: string; accountId: string; studentId: string }
) {
  return api(actor)
    .post('/finance/payments')
    .send(
      cashBody({
        reference: input.reference,
        accountId: input.accountId,
        allocations: [{ studentId: input.studentId, amountMinor: PAID }],
      })
    );
}

test.describe('reserved references', () => {
  test('a payment may not borrow a number the system issues', async ({
    api,
    app,
    pool,
    schools: { owner, studentLekki },
  }) => {
    const account = await bankAccount(app, owner);
    await owes(app, owner, { studentId: studentLekki.id, amountMinor: OWED });
    const before = {
      payments: await countOf(pool, 'payment'),
      entries: await countOf(pool, 'journal_entry'),
    };

    for (const reference of RESERVED_REFERENCES) {
      const res = await postPayment(api, owner, {
        reference,
        accountId: account.id,
        studentId: studentLekki.id,
      });
      expect(res.status, reference).toBe(400);
      expect(messageOf(res), reference).toBe(RESERVED_REFERENCE_MESSAGE);
    }

    expect({
      payments: await countOf(pool, 'payment'),
      entries: await countOf(pool, 'journal_entry'),
    }).toEqual(before);
  });

  test('a store sale may not borrow a number the system issues', async ({
    api,
    pool,
    schools: { owner, studentLekki },
  }) => {
    const before = await countOf(pool, 'journal_entry');

    for (const reference of RESERVED_REFERENCES) {
      const res = await api(owner)
        .post('/store/sales')
        .send({
          reference,
          studentId: studentLekki.id,
          method: 'cash',
          lines: [
            { itemId: '6f0a9d4e-8c1b-4f43-9a52-3d7f1f3c9a10', quantity: 1 },
          ],
        });
      expect(res.status, reference).toBe(400);
      expect(messageOf(res), reference).toBe(RESERVED_REFERENCE_MESSAGE);
    }

    expect(await countOf(pool, 'journal_entry')).toBe(before);
  });

  test('the references the web app generates stay valid', async ({
    api,
    app,
    schools: { owner, studentLekki },
  }) => {
    const account = await bankAccount(app, owner);
    await owes(app, owner, { studentId: studentLekki.id, amountMinor: OWED });

    for (const prefix of ['CSH', 'TRF', 'POS']) {
      const res = await postPayment(api, owner, {
        reference: nextReference(prefix),
        accountId: account.id,
        studentId: studentLekki.id,
      });
      expect(res.status, prefix).toBe(201);
    }
  });
});

test.describe('a number the system issues cannot be spent by a payment', () => {
  test('an adjustment still posts when its ADJ number was tried as a payment reference', async ({
    api,
    app,
    pool,
    schools: { owner, orgA, lekkiOnly, studentLekki },
  }) => {
    const account = await bankAccount(app, owner);
    await owes(app, owner, { studentId: studentLekki.id, amountMinor: OWED });
    const { adjustment } = await askAdjustment(api, lekkiOnly, {
      kind: 'credit_note',
      studentId: studentLekki.id,
      amountMinor: PAID,
      reason: 'Late enrolment',
    });

    const clash = await postPayment(api, owner, {
      reference: adjustment.number,
      accountId: account.id,
      studentId: studentLekki.id,
    });
    expect(clash.status).toBe(400);
    const approved = await approveAdjustment(api, owner, adjustment.id);

    expect(approved.status).toBe('approved');
    expect(await entryCount(pool, orgA.id, adjustment.number)).toBe(1);
    expect(await receivableBalance(pool, orgA.id, studentLekki.id)).toBe(
      OWED - PAID
    );
  });

  test('a delivery still moves stock and money together when its DEL number was tried as a payment reference', async ({
    api,
    app,
    pool,
    clock,
    schools: { owner, orgA, lekki, studentLekki },
  }) => {
    const account = await bankAccount(app, owner);
    await owes(app, owner, { studentId: studentLekki.id, amountMinor: OWED });
    const number = `DEL-${clock.today().slice(0, 4)}-0001`;

    const clash = await postPayment(api, owner, {
      reference: number,
      accountId: account.id,
      studentId: studentLekki.id,
    });
    expect(clash.status).toBe(400);
    const cash = await createMoneyAccount(app, owner, {
      name: 'Lekki cash box',
      kind: 'cash',
      campusId: lekki.id,
    });
    const shirt = await createItem(api, owner);
    const delivery = await receive(api, owner, {
      campusId: lekki.id,
      accountId: cash.id,
      lines: [{ itemId: shirt.id, quantity: 2, unitCostMinor: 350_000 }],
    });

    expect(delivery.number).toBe(number);
    expect(await entryCount(pool, orgA.id, number)).toBe(1);
  });

  test('a cancellation still reverses the receipt when VOID-<reference> was tried as a payment reference', async ({
    api,
    app,
    pool,
    schools: { owner, orgA, lekkiOnly, studentLekki },
  }) => {
    const account = await bankAccount(app, owner);
    await owes(app, owner, { studentId: studentLekki.id, amountMinor: OWED });
    const first = await recordCash(api, owner, {
      accountId: account.id,
      allocations: [{ studentId: studentLekki.id, amountMinor: PAID }],
    });

    const clash = await postPayment(api, owner, {
      reference: `VOID-${first.reference}`,
      accountId: account.id,
      studentId: studentLekki.id,
    });
    expect(clash.status).toBe(400);
    const { void: asked } = await askVoid(api, lekkiOnly, first.id);
    await approveVoid(api, owner, asked.id);

    expect((await receiptOf(api, owner, first.id)).status).toBe('voided');
    expect(await entryCount(pool, orgA.id, `VOID-${first.reference}`)).toBe(1);
    expect(await receivableBalance(pool, orgA.id, studentLekki.id)).toBe(OWED);
  });

  test('a charge run still issues when its CHG number was tried as a payment reference', async ({
    api,
    app,
    pool,
    clock,
    schools: { owner, orgA, studentLekki },
  }) => {
    const fixture = await chargeFixture(app, api, owner);
    const account = await bankAccount(app, owner);
    await owes(app, owner, { studentId: studentLekki.id, amountMinor: OWED });
    const year = clock.today().slice(0, 4);

    for (let value = 1; value <= 3; value += 1) {
      const clash = await postPayment(api, owner, {
        reference: `CHG-${year}-${String(value).padStart(5, '0')}`,
        accountId: account.id,
        studentId: studentLekki.id,
      });
      expect(clash.status).toBe(400);
    }
    const run = await prepare(api, owner, {
      termId: fixture.secondTermId,
      scope: 'school',
    });
    await sendRun(api, owner, run.runId ?? '');

    const numbers = (await invoicesOf(api, owner)).items.map(
      (invoice) => invoice.number
    );
    expect(numbers).toHaveLength(2);
    for (const number of numbers) {
      expect(await entryCount(pool, orgA.id, number ?? '')).toBe(1);
    }
  });
});

test.describe('a posting that must happen once refuses a reference already in the journal', () => {
  test('approving an adjustment whose number is already booked answers 409 and stays waiting', async ({
    api,
    app,
    pool,
    schools: { owner, orgA, lekkiOnly, studentLekki },
  }) => {
    await owes(app, owner, { studentId: studentLekki.id, amountMinor: OWED });
    const { adjustment } = await askAdjustment(api, lekkiOnly, {
      kind: 'credit_note',
      studentId: studentLekki.id,
      amountMinor: PAID,
      reason: 'Late enrolment',
    });
    await plant(app, pool, {
      organizationId: orgA.id,
      reference: adjustment.number,
    });

    const refused = await api(owner)
      .post(`/finance/adjustments/${adjustment.id}/approve`)
      .expect(409);
    expect(messageOf(refused)).toBe(JOURNAL_REFERENCE_CLASH_MESSAGE);

    const { rows } = await pool.query<{ status: string }>(
      'SELECT status FROM adjustment WHERE id = $1',
      [adjustment.id]
    );
    expect(rows[0]?.status).toBe('submitted');
    expect(await receivableBalance(pool, orgA.id, studentLekki.id)).toBe(OWED);
  });

  test('recording a delivery whose number is already booked answers 409 and moves no stock', async ({
    api,
    app,
    pool,
    clock,
    schools: { owner, orgA, lekki },
  }) => {
    const cash = await createMoneyAccount(app, owner, {
      name: 'Lekki cash box',
      kind: 'cash',
      campusId: lekki.id,
    });
    const shirt = await createItem(api, owner);
    await plant(app, pool, {
      organizationId: orgA.id,
      reference: `DEL-${clock.today().slice(0, 4)}-0001`,
    });

    const refused = await api(owner)
      .post('/store/deliveries')
      .send({
        reference: 'SUPPLIER-INVOICE-77',
        campusId: lekki.id,
        supplierName: 'Adebayo Uniforms Ltd',
        moneyAccountId: cash.id,
        lines: [{ itemId: shirt.id, quantity: 2, unitCostMinor: 350_000 }],
      })
      .expect(409);

    expect(messageOf(refused)).toBe(JOURNAL_REFERENCE_CLASH_MESSAGE);
    expect(await countOf(pool, 'stock_movement')).toBe(0);
    expect(await countOf(pool, 'stock_delivery')).toBe(0);
  });

  test('approving a cancellation whose VOID entry is already booked answers 409 and keeps the receipt posted', async ({
    api,
    app,
    pool,
    schools: { owner, orgA, lekkiOnly, studentLekki },
  }) => {
    const account = await bankAccount(app, owner);
    await owes(app, owner, { studentId: studentLekki.id, amountMinor: OWED });
    const receipt = await recordCash(api, owner, {
      accountId: account.id,
      allocations: [{ studentId: studentLekki.id, amountMinor: PAID }],
    });
    const { void: asked } = await askVoid(api, lekkiOnly, receipt.id);
    await plant(app, pool, {
      organizationId: orgA.id,
      reference: `VOID-${receipt.reference}`,
    });

    await api(owner)
      .post(`/finance/payment-voids/${asked.id}/approve`)
      .expect(409);

    expect((await receiptOf(api, owner, receipt.id)).status).toBe(
      'void_pending'
    );
    expect(await receivableBalance(pool, orgA.id, studentLekki.id)).toBe(
      OWED - PAID
    );
  });

  test('approving a stock count whose CNT number is already booked answers 409 and moves no stock', async ({
    api,
    app,
    pool,
    schools: { owner, orgA, lekki, lekkiOnly },
  }) => {
    const shirt = await createItem(api, owner);
    await openStock(api, owner, {
      campusId: lekki.id,
      lines: [{ itemId: shirt.id, quantity: 4, unitCostMinor: 300_000 }],
    });
    const count = await submitCount(api, lekkiOnly, {
      campusId: lekki.id,
      lines: [{ itemId: shirt.id, countedQuantity: 5 }],
    });
    await plant(app, pool, {
      organizationId: orgA.id,
      reference: count.number,
    });
    const movements = await countOf(pool, 'stock_movement');

    await api(owner).post(`/store/counts/${count.id}/approve`).expect(409);

    expect(await countOf(pool, 'stock_movement')).toBe(movements);
    expect(await entryCount(pool, orgA.id, count.number)).toBe(1);
    expect((await entriesFor(pool, orgA.id, count.number)).length).toBe(2);
  });

  test('a payment whose reference already heads a journal entry is refused as a reference clash', async ({
    app,
    pool,
    schools: { owner, orgA, studentLekki },
  }) => {
    const account = await bankAccount(app, owner);
    await owes(app, owner, { studentId: studentLekki.id, amountMinor: OWED });
    const reference = 'LEGACY-ENTRY-1';
    await plant(app, pool, { organizationId: orgA.id, reference });
    const db = app.get<Database>(KYSELY_TOKEN, { strict: false });
    const poster = app.get(LedgerPoster, { strict: false });
    const input: NewPayment = {
      organizationId: orgA.id,
      userId: owner.id,
      year: 2026,
      reference,
      requestHash: 'hash',
      payerGuardianId: null,
      payerName: 'Mrs Ojo',
      moneyAccountId: account.id,
      ledgerAccountId: await ledgerAccountId(pool, orgA.id, 1200),
      accountCampusId: null,
      method: 'cash',
      providerReference: null,
      proofFileId: null,
      amountMinor: PAID,
      paidOn: '2026-10-07',
      allocations: [{ studentId: studentLekki.id, amountMinor: PAID }],
    };

    const outcome = await db
      .transaction()
      .execute((trx) => writePayment(trx, poster, input));

    expect(outcome).toEqual({ status: 'reference_used' });
    expect(await countOf(pool, 'payment')).toBe(0);
    expect(await entryCount(pool, orgA.id, reference)).toBe(1);
  });
});

test.describe('retries keep working', () => {
  test('the same payment sent twice posts once and answers replayed', async ({
    api,
    app,
    schools: { owner, studentLekki },
  }) => {
    const account = await bankAccount(app, owner);
    await owes(app, owner, { studentId: studentLekki.id, amountMinor: OWED });
    const reference = nextReference('CSH');
    const body = cashBody({
      reference,
      accountId: account.id,
      allocations: [{ studentId: studentLekki.id, amountMinor: PAID }],
    });

    await api(owner).post('/finance/payments').send(body).expect(201);
    const again = await api(owner).post('/finance/payments').send(body);

    expect(again.status).toBe(200);
    expect(again.body).toMatchObject({ replayed: true, reference });
  });
});
