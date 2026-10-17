import {
  PAYMENT_METHOD_OFF_MESSAGE,
  PAYMENT_PROOF_TAKEN_MESSAGE,
  STORE_PAYMENT_VOID_MESSAGE,
  STORE_SALE_ACCOUNT_CHOICE_MESSAGE,
  STORE_SALE_NOT_ACTIVE_MESSAGE,
  STORE_SALE_NO_TERM_MESSAGE,
  STORE_SALE_POS_PROOF_MESSAGE,
  STORE_SALE_REFERENCE_TAKEN_MESSAGE,
  STORE_SALE_TRANSFER_PROOF_MESSAGE,
  storeSaleNoAccountMessage,
  storeSaleReferenceUsedMessage,
  storeSaleStockShortMessage,
  type BalanceList,
  type DashboardFinance,
  type DashboardStore,
  type Invoice,
  type InvoiceList,
  type Item,
  type Payment,
  type PaymentList,
  type RecordedSale,
  type Sale,
  type SaleList,
  type SaleOptions,
  type StoreSummary,
  type StudentStatement,
} from '@eduvault/api-contract';
import { addDays } from '@eduvault/shared';
import type { INestApplication } from '@nestjs/common';
import {
  acting,
  expect,
  type Fixtures,
  type TestUser,
} from './support/base-test';
import { entriesFor, receivableBalance } from './support/factories/billing';
import {
  createMoneyAccount,
  ledgerAccountId,
  postEntry,
} from './support/factories/finance';
import {
  bankAccount,
  owes,
  recordCash,
  uploadProof,
} from './support/factories/payments';
import { createStudent } from './support/factories/students';
import {
  createItem,
  receive,
  saleBody,
  saleTables,
  sell,
  stockLedgerByCampus,
  stockValueByCampus,
} from './support/factories/store';
import {
  schoolsTest as test,
  type TwoSchoolsWithoutStudents,
} from './support/two-schools';

type Api = Fixtures['api'];
type Schools = TwoSchoolsWithoutStudents & {
  studentLekki: { id: string };
  studentIkeja: { id: string };
  studentB: { id: string };
};

const byText = (a: string, b: string) => a.localeCompare(b);

const SHIRT_COST = 350_000;
const SHIRT_PRICE = 450_000;
const TIE_COST = 100_000;
const TIE_PRICE = 150_000;

const totalOf = (
  lines: { debit_minor: string; credit_minor: string }[],
  side: 'debit_minor' | 'credit_minor'
): number => lines.reduce((sum, line) => sum + Number(line[side]), 0);

const messageOf = (res: {
  body: { message: string; issues?: { message: string }[] };
}): string => res.body.issues?.[0]?.message ?? res.body.message;

interface Counter {
  cash: { id: string };
  shirt: Item;
  tie: Item;
}

async function counter(
  app: INestApplication,
  api: Api,
  schools: Schools
): Promise<Counter> {
  const { owner, lekki } = schools;
  const cash = await createMoneyAccount(app, owner, {
    name: 'Lekki cash box',
    kind: 'cash',
    campusId: lekki.id,
  });
  const shirt = await createItem(api, owner);
  const tie = await createItem(api, owner, {
    name: 'Tie',
    variant: null,
    costPriceMinor: TIE_COST,
    sellPriceMinor: TIE_PRICE,
  });
  await receive(api, owner, {
    campusId: lekki.id,
    accountId: cash.id,
    lines: [
      { itemId: shirt.id, quantity: 10, unitCostMinor: SHIRT_COST },
      { itemId: tie.id, quantity: 3, unitCostMinor: TIE_COST },
    ],
  });
  return { cash, shirt, tie };
}

const posAccount = (app: INestApplication, owner: TestUser, campusId: string) =>
  createMoneyAccount(app, owner, {
    name: 'Lekki POS',
    kind: 'pos',
    campusId,
  });

async function stockOf(
  api: Api,
  actor: TestUser,
  held: { item: Item; campusId: string }
): Promise<number> {
  const { item, campusId } = held;
  const list = (await api(actor).get('/store/items').expect(200)).body as {
    items: Item[];
  };
  return (
    list.items
      .find((row) => row.id === item.id)
      ?.stock.find((row) => row.campusId === campusId)?.onHand ?? 0
  );
}

test.beforeEach(({ clock }) => {
  clock.set('2026-10-07');
});

test.describe('recording a student purchase', () => {
  test('posts the charge, its cost, the payment and the movements in one go, with the balance unchanged', async ({
    api,
    app,
    pool,
    schools,
  }) => {
    const { owner, orgA, lekki, studentLekki } = schools;
    const { shirt, tie } = await counter(app, api, schools);
    const before = await saleTables(pool);

    const sale = await sell(api, owner, {
      studentId: studentLekki.id,
      lines: [
        { itemId: shirt.id, quantity: 2 },
        { itemId: tie.id, quantity: 1 },
      ],
    });

    const total = 2 * SHIRT_PRICE + TIE_PRICE;
    const cost = 2 * SHIRT_COST + TIE_COST;
    expect(sale).toMatchObject({
      replayed: false,
      soldOn: '2026-10-07',
      campusId: lekki.id,
      totalMinor: total,
      costMinor: cost,
      method: 'cash',
      proof: null,
      student: { id: studentLekki.id },
    });
    expect(sale.number).toMatch(/^ISS-\d{4}-0001$/);
    expect(sale.chargeNumber).toMatch(/^CHG-\d{4}-\d{5}$/);
    expect(sale.receiptNumber).toMatch(/^RCT-\d{4}-\d{5}$/);
    expect(sale.lines.map((line) => line.displayName)).toEqual([
      'School shirt, Size 12',
      'Tie',
    ]);
    expect(sale.lines[0]).toMatchObject({
      quantity: 2,
      unitPriceMinor: SHIRT_PRICE,
      amountMinor: 2 * SHIRT_PRICE,
      costMinor: 2 * SHIRT_COST,
      unitCostMinor: SHIRT_COST,
    });

    const after = await saleTables(pool);
    expect(after.store_sale - before.store_sale).toBe(1);
    expect(after.store_sale_line - before.store_sale_line).toBe(2);
    expect(after.stock_movement - before.stock_movement).toBe(2);
    expect(after.payment - before.payment).toBe(1);
    expect(after.invoice - before.invoice).toBe(1);
    expect(after.journal_entry - before.journal_entry).toBe(3);

    const charge = await entriesFor(pool, orgA.id, sale.chargeNumber);
    expect(
      charge.map((line) => [line.code, line.campus_id, line.debit_minor])
    ).toEqual([
      [1100, lekki.id, String(2 * SHIRT_PRICE)],
      [1100, lekki.id, String(TIE_PRICE)],
      [4500, lekki.id, '0'],
      [4500, lekki.id, '0'],
    ]);
    const costLines = await entriesFor(
      pool,
      orgA.id,
      `${sale.chargeNumber}-COST`
    );
    expect(
      costLines.map((line) => [line.code, line.debit_minor, line.credit_minor])
    ).toEqual([
      [1300, '0', String(cost)],
      [5200, String(cost), '0'],
    ]);
    const payment = await entriesFor(pool, orgA.id, sale.reference);
    expect(
      payment.map((line) => line.code).toSorted((a, b) => a - b)
    ).toHaveLength(2);
    for (const lines of [charge, costLines, payment]) {
      expect(totalOf(lines, 'debit_minor')).toBe(
        totalOf(lines, 'credit_minor')
      );
    }
    expect(await receivableBalance(pool, orgA.id, studentLekki.id)).toBe(0);

    const movements = await pool.query(
      `SELECT kind, quantity, value_minor::text, reference, source_id
       FROM stock_movement WHERE reference = $1 ORDER BY quantity`,
      [sale.reference]
    );
    expect(movements.rows).toEqual([
      {
        kind: 'sell',
        quantity: -2,
        value_minor: String(-2 * SHIRT_COST),
        reference: sale.reference,
        source_id: sale.id,
      },
      {
        kind: 'sell',
        quantity: -1,
        value_minor: String(-TIE_COST),
        reference: sale.reference,
        source_id: sale.id,
      },
    ]);
    expect(await stockOf(api, owner, { item: shirt, campusId: lekki.id })).toBe(
      8
    );
    expect(await stockLedgerByCampus(pool, orgA.id)).toEqual(
      await stockValueByCampus(pool, orgA.id)
    );
  });

  test('takes a POS sale with its slip and refuses one without', async ({
    api,
    app,
    schools,
  }) => {
    const { owner, lekki, studentLekki } = schools;
    const { shirt } = await counter(app, api, schools);
    await posAccount(app, owner, lekki.id);
    const lines = [{ itemId: shirt.id, quantity: 1 }];

    const bare = await api(owner)
      .post('/store/sales')
      .send(saleBody({ studentId: studentLekki.id, method: 'pos', lines }));
    expect(bare.status).toBe(400);
    expect(messageOf(bare)).toBe(STORE_SALE_POS_PROOF_MESSAGE);
    const transfer = await api(owner)
      .post('/store/sales')
      .send(
        saleBody({ studentId: studentLekki.id, method: 'transfer', lines })
      );
    expect(transfer.status).toBe(400);
    expect(messageOf(transfer)).toBe(STORE_SALE_TRANSFER_PROOF_MESSAGE);

    const proof = await uploadProof(api, owner);
    const sale = await sell(api, owner, {
      studentId: studentLekki.id,
      method: 'pos',
      proofFileId: proof.id,
      lines,
    });
    expect(sale.method).toBe('pos');
    expect(sale.proof).toMatchObject({ fileId: proof.id });
    const receipt = (
      await api(owner).get(`/finance/payments/${sale.paymentId}`).expect(200)
    ).body as Payment;
    expect(receipt.storeSale).toEqual({ id: sale.id, number: sale.number });
    expect(receipt.proof?.fileId).toBe(proof.id);
  });
});

const SALE_ONE = { quantity: 1 };

test.describe('refusals leave nothing behind', () => {
  test('a failure after the charge rolls the whole sale back and answers 409', async ({
    api,
    app,
    pool,
    schools,
  }) => {
    const { owner, orgA, lekki, studentLekki } = schools;
    const { shirt } = await counter(app, api, schools);
    const cost = await ledgerAccountId(pool, orgA.id, 5200);
    const stock = await ledgerAccountId(pool, orgA.id, 1300);
    await postEntry(app, {
      organizationId: orgA.id,
      reference: 'CHG-2026-00001-COST',
      kind: 'store_cost',
      effectiveOn: '2026-10-07',
      postedBy: owner.id,
      lines: [
        {
          ledgerAccountId: cost,
          campusId: lekki.id,
          debitMinor: 1,
          creditMinor: 0,
        },
        {
          ledgerAccountId: stock,
          campusId: lekki.id,
          debitMinor: 0,
          creditMinor: 1,
        },
      ],
    });
    const before = await saleTables(pool);
    const sequences = await pool.query(
      'SELECT kind, next_value FROM document_sequence ORDER BY kind'
    );

    const res = await api(owner)
      .post('/store/sales')
      .send(
        saleBody({
          studentId: studentLekki.id,
          lines: [{ itemId: shirt.id, ...SALE_ONE }],
        })
      );

    expect(res.status).toBe(409);
    expect(res.body.message).toBe(STORE_SALE_REFERENCE_TAKEN_MESSAGE);
    expect(await saleTables(pool)).toEqual(before);
    expect(
      (
        await pool.query(
          'SELECT kind, next_value FROM document_sequence ORDER BY kind'
        )
      ).rows
    ).toEqual(sequences.rows);
    expect(await stockOf(api, owner, { item: shirt, campusId: lekki.id })).toBe(
      10
    );
  });

  test('a failure at the payment, after the charge and cost posted, rolls everything back', async ({
    api,
    app,
    pool,
    schools,
  }) => {
    const { owner, orgA, lekki, studentLekki } = schools;
    const { shirt } = await counter(app, api, schools);
    const reference = 'COUNTER-CLASH-1';
    await postEntry(app, {
      organizationId: orgA.id,
      reference,
      kind: 'adjustment',
      effectiveOn: '2026-10-07',
      postedBy: owner.id,
      lines: [
        {
          ledgerAccountId: await ledgerAccountId(pool, orgA.id, 5200),
          campusId: lekki.id,
          debitMinor: 1,
          creditMinor: 0,
        },
        {
          ledgerAccountId: await ledgerAccountId(pool, orgA.id, 1300),
          campusId: lekki.id,
          debitMinor: 0,
          creditMinor: 1,
        },
      ],
    });
    const before = await saleTables(pool);

    const res = await api(owner)
      .post('/store/sales')
      .send(
        saleBody({
          reference,
          studentId: studentLekki.id,
          lines: [{ itemId: shirt.id, ...SALE_ONE }],
        })
      );

    expect(res.status).toBe(409);
    expect(res.body.message).toBe(STORE_SALE_REFERENCE_TAKEN_MESSAGE);
    expect(await saleTables(pool)).toEqual(before);
    expect(await receivableBalance(pool, orgA.id, studentLekki.id)).toBe(0);
    expect(await stockOf(api, owner, { item: shirt, campusId: lekki.id })).toBe(
      10
    );
  });

  test('stock below zero answers 409 with what is left and posts nothing', async ({
    api,
    app,
    pool,
    schools,
  }) => {
    const { owner, studentLekki } = schools;
    const { tie } = await counter(app, api, schools);
    const before = await saleTables(pool);

    const res = await api(owner)
      .post('/store/sales')
      .send(
        saleBody({
          studentId: studentLekki.id,
          lines: [{ itemId: tie.id, quantity: 4 }],
        })
      );

    expect(res.status).toBe(409);
    expect(res.body.message).toBe(
      storeSaleStockShortMessage(3, 'Tie', 'Lekki')
    );
    expect(await saleTables(pool)).toEqual(before);
  });

  test('two sales of the last unit at once: one is recorded, the other is told the shelf is empty', async ({
    api,
    app,
    pool,
    schools,
  }) => {
    const { owner, lekki, studentLekki } = schools;
    const { cash } = await counter(app, api, schools);
    const other = await createStudent(app, owner, { campusId: lekki.id });
    const rare = await createItem(api, owner, {
      name: 'Blazer',
      variant: null,
      costPriceMinor: 900_000,
      sellPriceMinor: 1_200_000,
    });
    await receive(api, owner, {
      campusId: lekki.id,
      accountId: cash.id,
      lines: [{ itemId: rare.id, quantity: 1, unitCostMinor: 900_000 }],
    });
    const send = (studentId: string) =>
      api(owner)
        .post('/store/sales')
        .send(
          saleBody({ studentId, lines: [{ itemId: rare.id, ...SALE_ONE }] })
        );

    const results = await Promise.all([send(studentLekki.id), send(other.id)]);

    expect(results.map((res) => res.status).toSorted((a, b) => a - b)).toEqual([
      201, 409,
    ]);
    const refused = results.find((res) => res.status === 409);
    expect(refused?.body.message).toBe(
      storeSaleStockShortMessage(0, 'Blazer', 'Lekki')
    );
    expect(await stockOf(api, owner, { item: rare, campusId: lekki.id })).toBe(
      0
    );
    const sold = await pool.query(
      `SELECT count(*)::int AS n FROM store_sale_line WHERE item_id = $1`,
      [rare.id]
    );
    expect(sold.rows[0]?.n).toBe(1);
  });

  test('Inactive, Left and Graduated students cannot buy', async ({
    api,
    app,
    clock,
    pool,
    schools,
  }) => {
    const { owner, lekki, studentLekki } = schools;
    const { shirt } = await counter(app, api, schools);
    const lines = [{ itemId: shirt.id, ...SALE_ONE }];
    const refused = async (studentId: string) => {
      const res = await api(owner)
        .post('/store/sales')
        .send(saleBody({ studentId, lines }));
      expect(res.status).toBe(409);
      expect(res.body.message).toBe(STORE_SALE_NOT_ACTIVE_MESSAGE);
    };

    await api(owner)
      .post(`/students/${studentLekki.id}/not-seen`)
      .send({ date: studentLekki.admittedOn })
      .expect(201);
    clock.set(addDays(studentLekki.admittedOn, 40));
    await refused(studentLekki.id);
    clock.set('2026-10-07');

    const leaver = await createStudent(app, owner, { campusId: lekki.id });
    await api(owner)
      .post(`/students/${leaver.id}/leave`)
      .send({ reason: 'relocated', lastDay: leaver.admittedOn })
      .expect(201);
    await refused(leaver.id);

    const graduate = await createStudent(app, owner, { campusId: lekki.id });
    await pool.query(
      `UPDATE student SET exit_kind = 'graduated', exit_reason = 'completed',
         archived_at = now(), archived_term_id = (SELECT id FROM term WHERE is_current LIMIT 1)
       WHERE id = $1`,
      [graduate.id]
    );
    await refused(graduate.id);
    expect((await saleTables(pool)).store_sale).toBe(0);
  });

  test('no current term answers 409', async ({ api, app, pool, schools }) => {
    const { owner, orgA, studentLekki } = schools;
    const { shirt } = await counter(app, api, schools);
    await pool.query(
      'UPDATE term SET is_current = FALSE WHERE organization_id = $1',
      [orgA.id]
    );

    const res = await api(owner)
      .post('/store/sales')
      .send(
        saleBody({
          studentId: studentLekki.id,
          lines: [{ itemId: shirt.id, ...SALE_ONE }],
        })
      );

    expect(res.status).toBe(409);
    expect(res.body.message).toBe(STORE_SALE_NO_TERM_MESSAGE);
  });

  test('a method the school switched off answers 400', async ({
    api,
    app,
    schools,
  }) => {
    const { owner, studentLekki } = schools;
    const { shirt } = await counter(app, api, schools);
    await api(owner)
      .patch('/school-settings/payment-rules')
      .send({ cash: false })
      .expect(200);

    const res = await api(owner)
      .post('/store/sales')
      .send(
        saleBody({
          studentId: studentLekki.id,
          lines: [{ itemId: shirt.id, ...SALE_ONE }],
        })
      );

    expect(res.status).toBe(400);
    expect(res.body.message).toBe(PAYMENT_METHOD_OFF_MESSAGE);
  });

  test('a proof already on a receipt answers 409', async ({
    api,
    app,
    schools,
  }) => {
    const { owner, lekki, studentLekki } = schools;
    const { shirt } = await counter(app, api, schools);
    await posAccount(app, owner, lekki.id);
    const proof = await uploadProof(api, owner);
    const lines = [{ itemId: shirt.id, ...SALE_ONE }];
    await sell(api, owner, {
      studentId: studentLekki.id,
      method: 'pos',
      proofFileId: proof.id,
      lines,
    });

    const res = await api(owner)
      .post('/store/sales')
      .send(
        saleBody({
          studentId: studentLekki.id,
          method: 'pos',
          proofFileId: proof.id,
          lines,
        })
      );

    expect(res.status).toBe(409);
    expect(res.body.message).toBe(PAYMENT_PROOF_TAKEN_MESSAGE);
  });
});

test.describe('the Into account', () => {
  test('several fits without a named account answer 400, and naming one takes it', async ({
    api,
    app,
    schools,
  }) => {
    const { owner, studentLekki } = schools;
    const { shirt } = await counter(app, api, schools);
    const bank = await bankAccount(app, owner);
    const lines = [{ itemId: shirt.id, ...SALE_ONE }];

    const vague = await api(owner)
      .post('/store/sales')
      .send(saleBody({ studentId: studentLekki.id, lines }));
    expect(vague.status).toBe(400);
    expect(vague.body.message).toBe(STORE_SALE_ACCOUNT_CHOICE_MESSAGE);

    const sale = await sell(api, owner, {
      studentId: studentLekki.id,
      accountId: bank.id,
      lines,
    });
    const receipt = (
      await api(owner).get(`/finance/payments/${sale.paymentId}`).expect(200)
    ).body as Payment;
    expect(receipt.moneyAccount.id).toBe(bank.id);
  });

  test('a campus with no fitting account answers 400 with the campus named', async ({
    api,
    app,
    pool,
    schools,
  }) => {
    const { owner, studentIkeja } = schools;
    const { shirt } = await counter(app, api, schools);
    const before = await saleTables(pool);

    const res = await api(owner)
      .post('/store/sales')
      .send(
        saleBody({
          studentId: studentIkeja.id,
          lines: [{ itemId: shirt.id, ...SALE_ONE }],
        })
      );

    expect(res.status).toBe(400);
    expect(res.body.message).toBe(storeSaleNoAccountMessage('cash', 'Ikeja'));
    expect(await saleTables(pool)).toEqual(before);
  });
});

test.describe('replaying a reference', () => {
  test('returns the original sale and receipt and writes nothing twice', async ({
    api,
    app,
    pool,
    schools,
  }) => {
    const { owner, studentLekki } = schools;
    const { shirt } = await counter(app, api, schools);
    const body = saleBody({
      studentId: studentLekki.id,
      lines: [{ itemId: shirt.id, quantity: 2 }],
    });
    const first = (await api(owner).post('/store/sales').send(body).expect(201))
      .body as RecordedSale;
    const before = await saleTables(pool);

    const again = await api(owner).post('/store/sales').send(body).expect(200);

    expect(again.body).toMatchObject({
      id: first.id,
      replayed: true,
      receiptNumber: first.receiptNumber,
      number: first.number,
    });
    expect(await saleTables(pool)).toEqual(before);
  });

  test('refuses the same reference with other lines or another student', async ({
    api,
    app,
    schools,
  }) => {
    const { owner, lekki, studentLekki } = schools;
    const { shirt, tie } = await counter(app, api, schools);
    const other = await createStudent(app, owner, { campusId: lekki.id });
    const sale = await sell(api, owner, {
      studentId: studentLekki.id,
      lines: [{ itemId: shirt.id, quantity: 2 }],
    });
    const message = storeSaleReferenceUsedMessage(sale.reference, sale.number);

    const lines = await api(owner)
      .post('/store/sales')
      .send(
        saleBody({
          reference: sale.reference,
          studentId: studentLekki.id,
          lines: [{ itemId: tie.id, quantity: 1 }],
        })
      );
    const student = await api(owner)
      .post('/store/sales')
      .send(
        saleBody({
          reference: sale.reference,
          studentId: other.id,
          lines: [{ itemId: shirt.id, quantity: 2 }],
        })
      );

    expect([lines.status, student.status]).toEqual([409, 409]);
    expect([lines.body.message, student.body.message]).toEqual([
      message,
      message,
    ]);
  });
});

test.describe('cost at the store’s average', () => {
  test('sells 2 of 20 at the average of two deliveries and keeps 1300 equal to the movements', async ({
    api,
    app,
    pool,
    schools,
  }) => {
    const { owner, orgA, lekki, studentLekki } = schools;
    const { cash } = await counter(app, api, schools);
    const set = await createItem(api, owner, {
      name: 'Sportswear set',
      variant: null,
      costPriceMinor: 300_000,
      sellPriceMinor: 450_000,
    });
    for (const unitCostMinor of [300_000, 350_000]) {
      await receive(api, owner, {
        campusId: lekki.id,
        accountId: cash.id,
        lines: [{ itemId: set.id, quantity: 10, unitCostMinor }],
      });
    }

    const sale = await sell(api, owner, {
      studentId: studentLekki.id,
      lines: [{ itemId: set.id, quantity: 2 }],
    });

    expect(sale.costMinor).toBe(650_000);
    expect(sale.lines[0]).toMatchObject({
      costMinor: 650_000,
      unitCostMinor: 325_000,
    });
    const posted = await entriesFor(pool, orgA.id, `${sale.chargeNumber}-COST`);
    expect(posted.map((line) => line.debit_minor)).toContain('650000');
    expect(await stockLedgerByCampus(pool, orgA.id)).toEqual(
      await stockValueByCampus(pool, orgA.id)
    );
  });

  test('three ties valued ₦10,000: one costs ₦3,333 and the last two cost ₦6,667', async ({
    api,
    app,
    pool,
    schools,
  }) => {
    const { owner, orgA, lekki, studentLekki } = schools;
    const { cash } = await counter(app, api, schools);
    const badge = await createItem(api, owner, {
      name: 'Badge',
      variant: null,
      costPriceMinor: 300_000,
      sellPriceMinor: 500_000,
    });
    for (const [quantity, unitCostMinor] of [
      [1, 400_000],
      [2, 300_000],
    ] as const) {
      await receive(api, owner, {
        campusId: lekki.id,
        accountId: cash.id,
        lines: [{ itemId: badge.id, quantity, unitCostMinor }],
      });
    }

    const first = await sell(api, owner, {
      studentId: studentLekki.id,
      lines: [{ itemId: badge.id, quantity: 1 }],
    });
    const rest = await sell(api, owner, {
      studentId: studentLekki.id,
      lines: [{ itemId: badge.id, quantity: 2 }],
    });

    expect(first.costMinor).toBe(333_333);
    expect(rest.costMinor).toBe(666_667);
    expect(first.costMinor + rest.costMinor).toBe(1_000_000);
    expect(await stockLedgerByCampus(pool, orgA.id)).toEqual(
      await stockValueByCampus(pool, orgA.id)
    );
  });

  test('a later price or cost edit leaves a sold line as it was', async ({
    api,
    app,
    schools,
  }) => {
    const { owner, studentLekki } = schools;
    const { shirt } = await counter(app, api, schools);
    const sale = await sell(api, owner, {
      studentId: studentLekki.id,
      lines: [{ itemId: shirt.id, quantity: 1 }],
    });

    await api(owner)
      .patch(`/store/items/${shirt.id}`)
      .send({ costPriceMinor: 400_000, sellPriceMinor: 600_000 })
      .expect(200);

    const read = (await api(owner).get(`/store/sales/${sale.id}`).expect(200))
      .body as Sale;
    expect(read.lines[0]).toMatchObject({
      unitPriceMinor: SHIRT_PRICE,
      costMinor: SHIRT_COST,
    });
    const next = await sell(api, owner, {
      studentId: studentLekki.id,
      lines: [{ itemId: shirt.id, quantity: 1 }],
    });
    expect(next.lines[0]?.unitPriceMinor).toBe(600_000);
    expect(next.costMinor).toBe(SHIRT_COST);
  });
});

test.describe('what a sale does to the rest of the books', () => {
  test('a student with old fee debt still owes exactly that, and the sale shows as paid', async ({
    api,
    app,
    pool,
    schools,
  }) => {
    const { owner, orgA, studentLekki } = schools;
    const { shirt } = await counter(app, api, schools);
    await owes(app, owner, {
      studentId: studentLekki.id,
      amountMinor: 5_000_000,
    });

    const sale = await sell(api, owner, {
      studentId: studentLekki.id,
      lines: [{ itemId: shirt.id, quantity: 2 }],
    });

    expect(await receivableBalance(pool, orgA.id, studentLekki.id)).toBe(
      5_000_000
    );
    const read = (await api(owner).get(`/store/sales/${sale.id}`).expect(200))
      .body as Sale;
    expect(read.receiptNumber).toBe(sale.receiptNumber);
    const receipt = (
      await api(owner).get(`/finance/payments/${sale.paymentId}`).expect(200)
    ).body as Payment;
    expect(receipt.storeSale).toEqual({ id: sale.id, number: sale.number });
    expect(receipt.status).toBe('posted');
    const statement = (
      await api(owner)
        .get(`/finance/students/${studentLekki.id}/statement`)
        .expect(200)
    ).body as StudentStatement;
    expect(statement.unpaid.map((row) => row.outstandingMinor)).toEqual([
      5_000_000,
    ]);
  });

  test('the payment of a store sale cannot leave posted, and any other payment still can', async ({
    api,
    app,
    pool,
    schools,
  }) => {
    const { owner, studentLekki } = schools;
    const { shirt, cash } = await counter(app, api, schools);
    const sale = await sell(api, owner, {
      studentId: studentLekki.id,
      lines: [{ itemId: shirt.id, quantity: 1 }],
    });
    await owes(app, owner, {
      studentId: studentLekki.id,
      amountMinor: 900_000,
    });
    const plain = await recordCash(api, owner, {
      accountId: cash.id,
      allocations: [{ studentId: studentLekki.id, amountMinor: 900_000 }],
    });

    await expect(
      pool.query(`UPDATE payment SET status = 'voided' WHERE id = $1`, [
        sale.paymentId,
      ])
    ).rejects.toThrow(STORE_PAYMENT_VOID_MESSAGE);
    await pool.query(
      `UPDATE payment SET status = 'void_pending' WHERE id = $1`,
      [plain.id]
    );
    const kept = await pool.query(`SELECT status FROM payment WHERE id = $1`, [
      sale.paymentId,
    ]);
    expect(kept.rows).toEqual([{ status: 'posted' }]);
  });

  test('the charge is a store charge with a Source, and the statement shows it with an equal payment', async ({
    api,
    app,
    schools,
  }) => {
    const { owner, studentLekki } = schools;
    const { shirt } = await counter(app, api, schools);
    const sale = await sell(api, owner, {
      studentId: studentLekki.id,
      lines: [{ itemId: shirt.id, quantity: 2 }],
    });

    const charges = (await api(owner).get('/invoices?kind=store').expect(200))
      .body as InvoiceList;
    expect(charges.counts.store).toBe(1);
    expect(charges.items.map((row) => row.id)).toEqual([sale.chargeId]);
    const term = (await api(owner).get('/invoices?kind=term').expect(200))
      .body as InvoiceList;
    expect(term.items).toEqual([]);
    const detail = (
      await api(owner).get(`/invoices/${sale.chargeId}`).expect(200)
    ).body as Invoice;
    expect(detail).toMatchObject({
      kind: 'store',
      status: 'issued',
      number: sale.chargeNumber,
      totalMinor: sale.totalMinor,
      source: { kind: 'store_sale', id: sale.id, number: sale.number },
    });
    expect(detail.lines.map((line) => line.description)).toEqual([
      'School shirt, Size 12 × 2',
    ]);

    const statement = (
      await api(owner)
        .get(`/finance/students/${studentLekki.id}/statement`)
        .expect(200)
    ).body as StudentStatement;
    expect(
      statement.rows
        .map((row) => `${row.status}:${row.amountMinor}`)
        .toSorted(byText)
    ).toEqual(
      [`charged:${sale.totalMinor}`, `paid:${sale.totalMinor}`].toSorted(byText)
    );
    expect(
      statement.rows.some((row) => row.description.startsWith('Store purchase'))
    ).toBe(true);
    expect(statement.totals.balanceMinor).toBe(0);
  });

  test('Who owes and the finance card leave the sale out, while the store figures count it', async ({
    api,
    app,
    schools,
  }) => {
    const { owner, studentLekki } = schools;
    const { shirt, tie } = await counter(app, api, schools);
    await owes(app, owner, {
      studentId: studentLekki.id,
      amountMinor: 2_000_000,
    });
    const rowOf = async () =>
      (
        (await api(owner).get('/finance/balances').expect(200))
          .body as BalanceList
      ).items.find((row) => row.studentId === studentLekki.id);
    const rowBefore = await rowOf();
    const finance = async () =>
      (await api(owner).get('/dashboard/finance').expect(200))
        .body as DashboardFinance;
    const before = await finance();
    const balances = (await api(owner).get('/finance/balances').expect(200))
      .body as { summary: { receivedThisTermMinor?: number } };

    const sale = await sell(api, owner, {
      studentId: studentLekki.id,
      lines: [
        { itemId: shirt.id, quantity: 2 },
        { itemId: tie.id, quantity: 1 },
      ],
    });

    expect(await finance()).toEqual(before);
    expect(rowBefore).toMatchObject({ balanceMinor: 2_000_000 });
    expect(await rowOf()).toEqual(rowBefore);
    const after = (await api(owner).get('/finance/balances').expect(200))
      .body as { summary: { receivedThisTermMinor?: number } };
    expect(after.summary.receivedThisTermMinor).toBe(
      balances.summary.receivedThisTermMinor
    );
    const payments = (await api(owner).get('/finance/payments').expect(200))
      .body as PaymentList;
    expect(payments.items.map((row) => row.receiptNumber)).toContain(
      sale.receiptNumber
    );
    const figures = {
      termSalesMinor: sale.totalMinor,
      termCostMinor: sale.costMinor,
      termSalesCount: 1,
      termItemsSold: 3,
      termStudentsServed: 1,
    };
    const summary = (await api(owner).get('/store/summary').expect(200))
      .body as StoreSummary;
    expect(summary).toMatchObject(figures);
    const card = (await api(owner).get('/dashboard/store').expect(200))
      .body as DashboardStore;
    expect(card).toMatchObject(figures);
  });

  test('students served counts each student once however many times they buy', async ({
    api,
    app,
    schools,
  }) => {
    const { owner, lekki, studentLekki } = schools;
    const { shirt } = await counter(app, api, schools);
    const other = await createStudent(app, owner, { campusId: lekki.id });
    for (const studentId of [studentLekki.id, studentLekki.id, other.id]) {
      await sell(api, owner, {
        studentId,
        lines: [{ itemId: shirt.id, quantity: 1 }],
      });
    }

    const summary = (await api(owner).get('/store/summary').expect(200))
      .body as StoreSummary;
    expect(summary).toMatchObject({
      termSalesCount: 3,
      termStudentsServed: 2,
      termItemsSold: 3,
    });
    const filtered = (
      await api(owner).get(`/store/summary?campusId=${lekki.id}`).expect(200)
    ).body as StoreSummary;
    expect(filtered.termSalesCount).toBe(3);
  });

  test('with no current term the term figures are zero', async ({
    api,
    app,
    pool,
    schools,
  }) => {
    const { owner, orgA, studentLekki } = schools;
    const { shirt } = await counter(app, api, schools);
    await sell(api, owner, {
      studentId: studentLekki.id,
      lines: [{ itemId: shirt.id, quantity: 1 }],
    });
    await pool.query(
      'UPDATE term SET is_current = FALSE WHERE organization_id = $1',
      [orgA.id]
    );

    const summary = (await api(owner).get('/store/summary').expect(200))
      .body as StoreSummary;
    expect(summary).toMatchObject({
      termSalesMinor: 0,
      termCostMinor: 0,
      termSalesCount: 0,
      termItemsSold: 0,
      termStudentsServed: 0,
    });
  });

  test('a store:issue member with no other permission can upload a proof, and a store:read one cannot', async ({
    api,
    withPermissions,
    schools,
  }) => {
    const seller = await withPermissions(schools.orgA, ['store:issue']);
    const reader = await withPermissions(schools.orgA, ['store:read']);

    await api(seller)
      .post('/files')
      .field('kind', 'payment_proof')
      .attach('file', Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n'), {
        filename: 'slip.pdf',
      })
      .expect(201);
    await api(reader)
      .post('/files')
      .field('kind', 'payment_proof')
      .attach('file', Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n'), {
        filename: 'slip.pdf',
      })
      .expect(403);
  });
});

test.describe('the sale reads', () => {
  test('lists newest first, ten to a page, and filters by student and campus', async ({
    api,
    app,
    schools,
  }) => {
    const { owner, lekki, studentLekki } = schools;
    const { shirt } = await counter(app, api, schools);
    const other = await createStudent(app, owner, { campusId: lekki.id });
    const first = await sell(api, owner, {
      studentId: studentLekki.id,
      lines: [{ itemId: shirt.id, quantity: 1 }],
    });
    const second = await sell(api, owner, {
      studentId: other.id,
      lines: [{ itemId: shirt.id, quantity: 1 }],
    });

    const list = (await api(owner).get('/store/sales').expect(200))
      .body as SaleList;
    expect(list.total).toBe(2);
    expect(list.items.map((row) => row.id)).toEqual([second.id, first.id]);
    const mine = (
      await api(owner)
        .get(`/store/sales?studentId=${studentLekki.id}`)
        .expect(200)
    ).body as SaleList;
    expect(mine.items.map((row) => row.id)).toEqual([first.id]);
    const there = (
      await api(owner).get(`/store/sales?campusId=${lekki.id}`).expect(200)
    ).body as SaleList;
    expect(there.total).toBe(2);
    const page2 = (await api(owner).get('/store/sales?page=2').expect(200))
      .body as SaleList;
    expect(page2.items).toEqual([]);
    expect(page2.total).toBe(0);
  });

  test('offers the sheet active students, switched-on methods and open accounts', async ({
    api,
    app,
    schools,
  }) => {
    const { owner, studentLekki, studentIkeja } = schools;
    await counter(app, api, schools);
    await api(owner)
      .patch('/school-settings/payment-rules')
      .send({ pos: false })
      .expect(200);

    const options = (await api(owner).get('/store/sales/options').expect(200))
      .body as SaleOptions;

    expect(options.students.map((row) => row.id).toSorted(byText)).toEqual(
      [studentLekki.id, studentIkeja.id].toSorted(byText)
    );
    expect(options.students[0]).toMatchObject({ balanceMinor: 0 });
    expect(options.methods).toEqual({ cash: true, transfer: true, pos: false });
    expect(options.accounts.map((row) => row.name)).toEqual(['Lekki cash box']);
  });

  test('keeps fee balances off the sheet for a role that cannot read payments', async ({
    api,
    app,
    schools,
    withPermissions,
  }) => {
    const { orgA, lekki, studentLekki } = schools;
    await counter(app, api, schools);
    const issuer = await withPermissions(orgA, ['store:issue'], {
      campuses: [lekki],
    });

    const options = (await api(issuer).get('/store/sales/options').expect(200))
      .body as SaleOptions;

    expect(options.students.map((row) => row.id)).toEqual([studentLekki.id]);
    expect(options.students[0]).not.toHaveProperty('balanceMinor');
  });
});

async function made(app: INestApplication, api: Api, schools: Schools) {
  const { cash, shirt } = await counter(app, api, schools);
  const sale = await sell(api, schools.owner, {
    studentId: schools.studentLekki.id,
    lines: [{ itemId: shirt.id, quantity: 1 }],
  });
  return { cash, shirt, sale };
}

test.describe('isolation', () => {
  test('another school’s ids answer 404 and its lists hold none of A’s rows (cases 1 and 2)', async ({
    api,
    app,
    schools,
  }) => {
    const { ownerB, lekki, studentLekki, studentB, campusB } = schools;
    const { shirt, sale, cash } = await made(app, api, schools);
    const itemB = await createItem(api, ownerB);
    const cashB = await createMoneyAccount(app, ownerB, {
      name: 'Main cash',
      kind: 'cash',
      campusId: campusB.id,
    });

    await api(ownerB).get(`/store/sales/${sale.id}`).expect(404);
    await api(ownerB)
      .post('/store/sales')
      .send(
        saleBody({
          studentId: studentLekki.id,
          lines: [{ itemId: itemB.id, quantity: 1 }],
        })
      )
      .expect(404);
    await api(ownerB)
      .post('/store/sales')
      .send(
        saleBody({
          studentId: studentB.id,
          lines: [{ itemId: shirt.id, quantity: 1 }],
        })
      )
      .expect(404);
    await api(ownerB)
      .post('/store/sales')
      .send(
        saleBody({
          studentId: studentB.id,
          accountId: cash.id,
          lines: [{ itemId: itemB.id, quantity: 1 }],
        })
      )
      .expect(404);

    const list = (await api(ownerB).get('/store/sales').expect(200))
      .body as SaleList;
    expect(list).toEqual({ items: [], total: 0 });
    await api(ownerB).get(`/store/sales?campusId=${lekki.id}`).expect(404);
    const options = (await api(ownerB).get('/store/sales/options').expect(200))
      .body as SaleOptions;
    expect(options.students.map((row) => row.id)).toEqual([studentB.id]);
    expect(options.accounts.map((row) => row.id)).toEqual([cashB.id]);
  });

  test('a Lekki member cannot see or sell to the Ikeja campus (cases 3 and 4)', async ({
    api,
    app,
    schools,
  }) => {
    const { owner, lekkiOnly, ikeja, studentIkeja, studentLekki } = schools;
    const { shirt, sale } = await made(app, api, schools);
    const cashIkeja = await createMoneyAccount(app, owner, {
      name: 'Ikeja cash box',
      kind: 'cash',
      campusId: ikeja.id,
    });
    await receive(api, owner, {
      campusId: ikeja.id,
      accountId: cashIkeja.id,
      lines: [{ itemId: shirt.id, quantity: 5, unitCostMinor: SHIRT_COST }],
    });
    const atIkeja = await sell(api, owner, {
      studentId: studentIkeja.id,
      lines: [{ itemId: shirt.id, quantity: 1 }],
    });

    await api(lekkiOnly).get(`/store/sales/${atIkeja.id}`).expect(404);
    await api(lekkiOnly)
      .post('/store/sales')
      .send(
        saleBody({
          studentId: studentIkeja.id,
          lines: [{ itemId: shirt.id, quantity: 1 }],
        })
      )
      .expect(404);
    await api(lekkiOnly).get(`/store/sales?campusId=${ikeja.id}`).expect(404);
    await api(lekkiOnly).get(`/store/sales/${sale.id}`).expect(200);
    const list = (await api(lekkiOnly).get('/store/sales').expect(200))
      .body as SaleList;
    expect(list.items.map((row) => row.id)).toEqual([sale.id]);
    const options = (
      await api(lekkiOnly).get('/store/sales/options').expect(200)
    ).body as SaleOptions;
    expect(options.students.map((row) => row.id)).toEqual([studentLekki.id]);
    expect(options.accounts.map((row) => row.id)).not.toContain(cashIkeja.id);
    const mine = await sell(api, lekkiOnly, {
      studentId: studentLekki.id,
      lines: [{ itemId: shirt.id, quantity: 1 }],
    });
    expect(mine.campusId).toBe(schools.lekki.id);
  });

  test('no permission and a teacher get 403, no session gets 401, on every sale route (cases 5 and 6)', async ({
    api,
    app,
    addMember,
    createUser,
    schools,
  }) => {
    const { noPermission, orgA, studentLekki } = schools;
    const { shirt, sale } = await made(app, api, schools);
    const teacher = await addMember(orgA, await createUser(), {
      roles: ['teacher'],
    });
    const body = saleBody({
      studentId: studentLekki.id,
      lines: [{ itemId: shirt.id, quantity: 1 }],
    });

    for (const user of [noPermission, teacher]) {
      await api(user).get('/store/sales').expect(403);
      await api(user).get('/store/sales/options').expect(403);
      await api(user).get(`/store/sales/${sale.id}`).expect(403);
      await api(user).post('/store/sales').send(body).expect(403);
    }
    await api().get('/store/sales').expect(401);
    await api().get('/store/sales/options').expect(401);
    await api().get(`/store/sales/${sale.id}`).expect(401);
    await api().post('/store/sales').send(body).expect(401);
  });

  test('a store:read member can read sales but not record one or open the sheet data', async ({
    api,
    app,
    withPermissions,
    schools,
  }) => {
    const { orgA, lekki, studentLekki } = schools;
    const { shirt, sale } = await made(app, api, schools);
    const reader = await withPermissions(orgA, ['store:read'], {
      campuses: [lekki],
    });

    await api(reader).get('/store/sales').expect(200);
    await api(reader).get(`/store/sales/${sale.id}`).expect(200);
    await api(reader).get('/store/sales/options').expect(403);
    await api(reader)
      .post('/store/sales')
      .send(
        saleBody({
          studentId: studentLekki.id,
          lines: [{ itemId: shirt.id, quantity: 1 }],
        })
      )
      .expect(403);
  });

  test('the composite foreign keys refuse a sale or line that points into another school (case 7)', async ({
    api,
    app,
    pool,
    schools,
  }) => {
    const { orgB, ownerB } = schools;
    const { sale } = await made(app, api, schools);
    const itemB = await createItem(api, ownerB);
    const saleRow = await pool.query(`SELECT * FROM store_sale WHERE id = $1`, [
      sale.id,
    ]);
    const row = saleRow.rows[0] as Record<string, string>;

    await expect(
      pool.query(
        `INSERT INTO store_sale (organization_id, number, reference, request_hash,
           store_id, student_id, invoice_id, payment_id, sold_on)
         VALUES ($1, 'ISS-9999-0001', 'RAW-1', 'x', $2, $3, $4, $5, '2026-10-07')`,
        [orgB.id, row.store_id, row.student_id, row.invoice_id, row.payment_id]
      )
    ).rejects.toThrow(/foreign key/);
    await expect(
      pool.query(
        `INSERT INTO store_sale_line (organization_id, store_sale_id, item_id, quantity,
           unit_price_minor, cost_minor)
         VALUES ($1, $2, $3, 1, 1, 0)`,
        [row.organization_id, sale.id, itemB.id]
      )
    ).rejects.toThrow(/foreign key/);
  });

  test('sales and their lines are append-only', async ({
    api,
    app,
    pool,
    schools,
  }) => {
    const { sale } = await made(app, api, schools);

    await expect(
      pool.query(`UPDATE store_sale SET sold_on = '2026-01-01' WHERE id = $1`, [
        sale.id,
      ])
    ).rejects.toThrow(/append-only/);
    await expect(
      pool.query(`DELETE FROM store_sale_line WHERE store_sale_id = $1`, [
        sale.id,
      ])
    ).rejects.toThrow(/append-only/);
    await expect(
      pool.query(`DELETE FROM store_sale WHERE id = $1`, [sale.id])
    ).rejects.toThrow(/append-only/);
  });

  test('a sale row without lines is refused when its transaction commits', async ({
    api,
    app,
    pool,
    schools,
  }) => {
    const { owner, studentLekki } = schools;
    const { cash, sale } = await made(app, api, schools);
    await owes(app, owner, {
      studentId: studentLekki.id,
      amountMinor: 900_000,
    });
    const plain = await recordCash(api, owner, {
      accountId: cash.id,
      allocations: [{ studentId: studentLekki.id, amountMinor: 900_000 }],
    });
    const charge = await pool.query<{ id: string }>(
      `INSERT INTO invoice (organization_id, student_id, term_id, campus_id, kind, status)
       SELECT organization_id, student_id, term_id, campus_id, kind, 'draft'
       FROM invoice WHERE id = $1 RETURNING id`,
      [sale.chargeId]
    );
    const row = (
      await pool.query<{ organization_id: string; store_id: string }>(
        `SELECT organization_id, store_id FROM store_sale WHERE id = $1`,
        [sale.id]
      )
    ).rows[0];

    await expect(
      pool.query(
        `INSERT INTO store_sale (organization_id, number, reference, request_hash,
           store_id, student_id, invoice_id, payment_id, sold_on)
         VALUES ($1, 'ISS-9999-0002', 'RAW-2', 'x', $2, $3, $4, $5, '2026-10-07')`,
        [
          row?.organization_id,
          row?.store_id,
          studentLekki.id,
          charge.rows[0]?.id,
          plain.id,
        ]
      )
    ).rejects.toThrow(/has no lines/);
  });

  test('the same sale sent twice at the same time is one sale (case 10)', async ({
    api,
    app,
    pool,
    schools,
  }) => {
    const { owner, studentLekki } = schools;
    const { shirt } = await counter(app, api, schools);
    const body = saleBody({
      studentId: studentLekki.id,
      lines: [{ itemId: shirt.id, quantity: 2 }],
    });

    const results = await Promise.all([
      api(owner).post('/store/sales').send(body),
      api(owner).post('/store/sales').send(body),
    ]);

    expect(results.map((res) => res.status).toSorted((a, b) => a - b)).toEqual([
      200, 201,
    ]);
    expect((await saleTables(pool)).store_sale).toBe(1);
    expect((await saleTables(pool)).payment).toBe(1);
  });

  test('an acting super admin without a reason cannot record a sale (case 12)', async ({
    api,
    app,
    pool,
    makeSuperAdmin,
    createUser,
    schools,
  }) => {
    const { orgA, studentLekki } = schools;
    const { shirt } = await counter(app, api, schools);
    const admin = await makeSuperAdmin(await createUser());
    const before = await saleTables(pool);

    const res = await api(admin)
      .post('/store/sales')
      .set(acting(orgA.id))
      .send(
        saleBody({
          studentId: studentLekki.id,
          lines: [{ itemId: shirt.id, quantity: 1 }],
        })
      )
      .expect(403);

    expect(res.body).toMatchObject({ code: 'ActingReadOnly' });
    expect(await saleTables(pool)).toEqual(before);
    await api(admin).get('/store/sales').set(acting(orgA.id)).expect(200);
  });
});
