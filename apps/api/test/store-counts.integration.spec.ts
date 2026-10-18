import {
  ALREADY_DECIDED_MESSAGE,
  DECLINE_REASON_MESSAGE,
  ITEM_NOT_FOUND_MESSAGE,
  SELF_APPROVAL_MESSAGE,
  STOCK_COUNT_NEGATIVE_MESSAGE,
  STOCK_MOVED_MESSAGE,
  STORE_CAMPUS_NOT_FOUND_MESSAGE,
  stockCountRetiredItemMessage,
  stockCountWaitingMessage,
  type ApprovalList,
  type Item,
  type StockCountList,
} from '@eduvault/api-contract';
import type { INestApplication } from '@nestjs/common';
import type { Pool } from 'pg';
import { acting, expect, type Fixtures } from './support/base-test';
import { switchApproval } from './support/factories/approvals';
import { entriesFor } from './support/factories/billing';
import {
  createMoneyAccount,
  financeActivityRows,
} from './support/factories/finance';
import {
  approveCount,
  countBody,
  createItem,
  declineCount,
  openStock,
  receive,
  sell,
  stockLedgerByCampus,
  stockValueByCampus,
  submitCount,
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

const TIE_AVERAGE = 112_500;
const SHIRT_AVERAGE = 325_000;

interface Shelf {
  shirt: Item;
  tie: Item;
}

async function stocked(
  app: INestApplication,
  api: Api,
  schools: Schools
): Promise<Shelf> {
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
    costPriceMinor: 100_000,
    sellPriceMinor: 150_000,
  });
  await openStock(api, owner, {
    campusId: lekki.id,
    lines: [
      { itemId: shirt.id, quantity: 2, unitCostMinor: 300_000 },
      { itemId: tie.id, quantity: 3, unitCostMinor: 100_000 },
    ],
  });
  await receive(api, owner, {
    campusId: lekki.id,
    accountId: cash.id,
    lines: [
      { itemId: shirt.id, quantity: 2, unitCostMinor: 350_000 },
      { itemId: tie.id, quantity: 1, unitCostMinor: 150_000 },
    ],
  });
  return { shirt, tie };
}

const messageOf = (res: {
  body: { message: string; issues?: { message: string }[] };
}): string => res.body.issues?.[0]?.message ?? res.body.message;

async function countMovements(pool: Pool, reference: string) {
  const { rows } = await pool.query<{
    item_id: string;
    quantity: number;
    value_minor: string;
    moved_by: string;
  }>(
    `SELECT item_id, quantity, value_minor::text, moved_by FROM stock_movement
     WHERE kind = 'count' AND reference = $1 ORDER BY quantity`,
    [reference]
  );
  return rows;
}

async function countEntries(pool: Pool): Promise<number> {
  const { rows } = await pool.query<{ n: string }>(
    `SELECT count(*)::text AS n FROM journal_entry WHERE kind = 'store_count'`
  );
  return Number(rows[0]?.n);
}

async function decisionRow(pool: Pool, id: string) {
  const { rows } = await pool.query<{
    status: string;
    approved_by: string | null;
    approved_at: Date | null;
    journal_entry_id: string | null;
  }>(
    `SELECT status, approved_by, approved_at, journal_entry_id FROM stock_count WHERE id = $1`,
    [id]
  );
  return rows[0];
}

test.beforeEach(({ clock }) => {
  clock.set('2026-10-07');
});

test.describe('submitting a count', () => {
  test('a count where every figure matches keeps every line and posts nothing', async ({
    api,
    app,
    pool,
    schools,
  }) => {
    const { owner, lekki } = schools;
    const { shirt, tie } = await stocked(app, api, schools);
    const before = await countEntries(pool);

    const count = await submitCount(api, owner, {
      campusId: lekki.id,
      note: 'Half-term shelf count',
      lines: [
        { itemId: shirt.id, countedQuantity: 4 },
        { itemId: tie.id, countedQuantity: 4 },
      ],
    });

    expect(count).toMatchObject({
      status: 'matched',
      campusId: lekki.id,
      campusName: 'Lekki',
      note: 'Half-term shelf count',
      netValueMinor: 0,
      differences: 'matches',
      decidedBy: null,
      rejectionReason: null,
    });
    expect(count.number).toMatch(/^CNT-\d{4}-0001$/);
    expect(count.lines.map((line) => line.difference)).toEqual([0, 0]);
    expect(count.lines).toHaveLength(2);
    expect(await countMovements(pool, count.number)).toEqual([]);
    expect(await countEntries(pool)).toBe(before);
    const rows = await pool.query(
      'SELECT 1 FROM stock_count_line WHERE stock_count_id = $1',
      [count.id]
    );
    expect(rows.rows).toHaveLength(2);
  });

  test('a count with a difference waits as submitted at the net value and moves nothing', async ({
    api,
    app,
    pool,
    schools,
  }) => {
    const { owner, lekkiOnly, lekki } = schools;
    const { shirt, tie } = await stocked(app, api, schools);
    const before = await countEntries(pool);

    const count = await submitCount(api, lekkiOnly, {
      campusId: lekki.id,
      lines: [
        { itemId: shirt.id, countedQuantity: 5 },
        { itemId: tie.id, countedQuantity: 3 },
      ],
    });

    expect(count).toMatchObject({
      status: 'submitted',
      netValueMinor: TIE_AVERAGE - SHIRT_AVERAGE,
      differences: 'School shirt, Size 12: 1 extra; Tie: 1 missing',
      countedBy: { name: expect.any(String) },
    });
    expect(count.lines.map((line) => line.valueMinor)).toEqual([
      SHIRT_AVERAGE,
      TIE_AVERAGE,
    ]);
    expect(await countMovements(pool, count.number)).toEqual([]);
    expect(await countEntries(pool)).toBe(before);
    const list = (await api(owner).get('/store/counts').expect(200))
      .body as StockCountList;
    expect(list.items.map((row) => row.id)).toEqual([count.id]);
  });

  test('a second count for a store that has one waiting answers 409 with its number', async ({
    api,
    app,
    schools,
  }) => {
    const { owner, lekki } = schools;
    const { shirt, tie } = await stocked(app, api, schools);
    const first = await submitCount(api, owner, {
      campusId: lekki.id,
      lines: [{ itemId: tie.id, countedQuantity: 3 }],
    });

    const res = await api(owner)
      .post('/store/counts')
      .send(
        countBody({
          campusId: lekki.id,
          lines: [{ itemId: shirt.id, countedQuantity: 3 }],
        })
      )
      .expect(409);

    expect(res.body.message).toBe(stockCountWaitingMessage(first.number));
  });

  test('two counts sent for one store at the same time leave exactly one waiting', async ({
    api,
    app,
    pool,
    schools,
  }) => {
    const { owner, lekkiOnly, lekki } = schools;
    const { shirt, tie } = await stocked(app, api, schools);

    const results = await Promise.all([
      api(owner)
        .post('/store/counts')
        .send(
          countBody({
            campusId: lekki.id,
            lines: [{ itemId: tie.id, countedQuantity: 3 }],
          })
        ),
      api(lekkiOnly)
        .post('/store/counts')
        .send(
          countBody({
            campusId: lekki.id,
            lines: [{ itemId: shirt.id, countedQuantity: 3 }],
          })
        ),
    ]);

    expect(results.map((res) => res.status).toSorted((a, b) => a - b)).toEqual([
      201, 409,
    ]);
    const waiting = await pool.query(
      `SELECT 1 FROM stock_count WHERE status = 'submitted'`
    );
    expect(waiting.rows).toHaveLength(1);
  });

  test('a count that matches does not block the next one', async ({
    api,
    app,
    schools,
  }) => {
    const { owner, lekki } = schools;
    const { tie } = await stocked(app, api, schools);
    await submitCount(api, owner, {
      campusId: lekki.id,
      lines: [{ itemId: tie.id, countedQuantity: 4 }],
    });
    const second = await submitCount(api, owner, {
      campusId: lekki.id,
      lines: [{ itemId: tie.id, countedQuantity: 3 }],
    });
    expect(second.status).toBe('submitted');
    expect(second.number).toMatch(/-0002$/);
  });

  test('the list pages ten at a time, newest first, with the full total', async ({
    api,
    app,
    schools,
  }) => {
    const { owner, lekki } = schools;
    const { tie } = await stocked(app, api, schools);
    for (let n = 0; n < 11; n += 1) {
      await submitCount(api, owner, {
        campusId: lekki.id,
        lines: [{ itemId: tie.id, countedQuantity: 4 }],
      });
    }

    const first = (await api(owner).get('/store/counts').expect(200)).body as {
      items: { number: string }[];
      total: number;
    };
    const second = (await api(owner).get('/store/counts?page=2').expect(200))
      .body as { items: { number: string }[]; total: number };

    expect(first.total).toBe(11);
    expect(first.items).toHaveLength(10);
    expect(first.items[0]?.number).toMatch(/-0011$/);
    expect(second.total).toBe(11);
    expect(second.items.map((count) => count.number)).toEqual([
      expect.stringMatching(/-0001$/),
    ]);
    const past = (await api(owner).get('/store/counts?page=3').expect(200))
      .body as { items: unknown[]; total: number };
    expect(past).toEqual({ items: [], total: 11 });
  });

  test('a negative or fractional count, no lines, an item twice and a retired item answer 400', async ({
    api,
    app,
    pool,
    schools,
  }) => {
    const { owner, lekki } = schools;
    const { shirt, tie } = await stocked(app, api, schools);
    const send = (lines: unknown) =>
      api(owner).post('/store/counts').send({ campusId: lekki.id, lines });

    const negative = await send([
      { itemId: tie.id, countedQuantity: -1 },
    ]).expect(400);
    expect(messageOf(negative)).toBe(STOCK_COUNT_NEGATIVE_MESSAGE);
    await send([{ itemId: tie.id, countedQuantity: 1.5 }]).expect(400);
    await send([]).expect(400);
    await send([
      { itemId: tie.id, countedQuantity: 1 },
      { itemId: tie.id, countedQuantity: 2 },
    ]).expect(400);

    await api(owner)
      .patch(`/store/items/${shirt.id}`)
      .send({ retired: true })
      .expect(200);
    const retired = await send([
      { itemId: shirt.id, countedQuantity: 1 },
    ]).expect(400);
    expect(retired.body.message).toBe(
      stockCountRetiredItemMessage('School shirt, Size 12')
    );
    const counts = await pool.query('SELECT 1 FROM stock_count');
    expect(counts.rows).toHaveLength(0);
  });

  test('with write-off approval off, a difference posts at once with no approver, and switching it off leaves a waiting count waiting', async ({
    api,
    app,
    pool,
    schools,
  }) => {
    const { owner, lekkiOnly, orgA, lekki } = schools;
    const { tie } = await stocked(app, api, schools);
    const waiting = await submitCount(api, lekkiOnly, {
      campusId: lekki.id,
      lines: [{ itemId: tie.id, countedQuantity: 3 }],
    });
    await switchApproval(api, owner, { writeOff: false });
    expect((await decisionRow(pool, waiting.id))?.status).toBe('submitted');
    await declineCount(api, owner, waiting.id);

    const now = await submitCount(api, lekkiOnly, {
      campusId: lekki.id,
      lines: [{ itemId: tie.id, countedQuantity: 3 }],
    });

    expect(now).toMatchObject({
      status: 'approved',
      decidedBy: null,
      netValueMinor: TIE_AVERAGE,
    });
    const row = await decisionRow(pool, now.id);
    expect(row?.approved_by).toBeNull();
    expect(row?.approved_at).not.toBeNull();
    expect(row?.journal_entry_id).not.toBeNull();
    expect(await countMovements(pool, now.number)).toEqual([
      expect.objectContaining({
        item_id: tie.id,
        quantity: -1,
        value_minor: String(-TIE_AVERAGE),
        moved_by: lekkiOnly.id,
      }),
    ]);
    expect(await entriesFor(pool, orgA.id, now.number)).toEqual([
      expect.objectContaining({
        code: 1300,
        credit_minor: String(TIE_AVERAGE),
      }),
      expect.objectContaining({ code: 5300, debit_minor: String(TIE_AVERAGE) }),
    ]);
  });
});

test.describe('approving a count', () => {
  test('one tie short posts one count movement and Dr 5300 / Cr 1300 at the tie’s average', async ({
    api,
    app,
    pool,
    schools,
  }) => {
    const { owner, lekkiOnly, orgA, lekki } = schools;
    const { tie } = await stocked(app, api, schools);
    const count = await submitCount(api, lekkiOnly, {
      campusId: lekki.id,
      lines: [{ itemId: tie.id, countedQuantity: 3 }],
    });

    const approved = await approveCount(api, owner, count.id);

    expect(approved).toMatchObject({
      status: 'approved',
      decidedBy: { id: owner.id },
      netValueMinor: TIE_AVERAGE,
    });
    expect(await countMovements(pool, count.number)).toEqual([
      expect.objectContaining({
        item_id: tie.id,
        quantity: -1,
        value_minor: String(-TIE_AVERAGE),
        moved_by: owner.id,
      }),
    ]);
    expect(await entriesFor(pool, orgA.id, count.number)).toEqual([
      expect.objectContaining({
        code: 1300,
        campus_id: lekki.id,
        credit_minor: String(TIE_AVERAGE),
      }),
      expect.objectContaining({
        code: 5300,
        campus_id: lekki.id,
        debit_minor: String(TIE_AVERAGE),
      }),
    ]);
    const decided = await decisionRow(pool, count.id);
    expect(decided?.status).toBe('approved');
    expect(decided?.approved_by).toBe(owner.id);
    expect(decided?.journal_entry_id).not.toBeNull();
    const items = (await api(owner).get('/store/items').expect(200)).body as {
      items: Item[];
    };
    expect(
      items.items
        .find((item) => item.id === tie.id)
        ?.stock.find((stock) => stock.campusId === lekki.id)?.onHand
    ).toBe(3);
  });

  test('one shirt extra posts Dr 1300 / Cr 5300 at ₦3,250', async ({
    api,
    app,
    pool,
    schools,
  }) => {
    const { owner, lekkiOnly, orgA, lekki } = schools;
    const { shirt } = await stocked(app, api, schools);
    const count = await submitCount(api, lekkiOnly, {
      campusId: lekki.id,
      lines: [{ itemId: shirt.id, countedQuantity: 5 }],
    });

    const approved = await approveCount(api, owner, count.id);

    expect(approved.netValueMinor).toBe(-SHIRT_AVERAGE);
    expect(await countMovements(pool, count.number)).toEqual([
      expect.objectContaining({
        item_id: shirt.id,
        quantity: 1,
        value_minor: String(SHIRT_AVERAGE),
      }),
    ]);
    expect(await entriesFor(pool, orgA.id, count.number)).toEqual([
      expect.objectContaining({
        code: 1300,
        debit_minor: String(SHIRT_AVERAGE),
      }),
      expect.objectContaining({
        code: 5300,
        credit_minor: String(SHIRT_AVERAGE),
      }),
    ]);
  });

  test('Store stock (1300) per campus still equals the sum of the movement values', async ({
    api,
    app,
    pool,
    schools,
  }) => {
    const { owner, lekkiOnly, orgA, lekki } = schools;
    const { shirt, tie } = await stocked(app, api, schools);
    const count = await submitCount(api, lekkiOnly, {
      campusId: lekki.id,
      lines: [
        { itemId: shirt.id, countedQuantity: 5 },
        { itemId: tie.id, countedQuantity: 1 },
      ],
    });

    await approveCount(api, owner, count.id);

    const ledger = await stockLedgerByCampus(pool, orgA.id);
    expect(ledger).toEqual(await stockValueByCampus(pool, orgA.id));
    expect(ledger[lekki.id]).toBe(
      4 * SHIRT_AVERAGE + SHIRT_AVERAGE + 4 * TIE_AVERAGE - 3 * TIE_AVERAGE
    );
  });

  test('differences that cancel out move stock and post no entry', async ({
    api,
    app,
    pool,
    schools,
  }) => {
    const { owner, lekkiOnly, orgA, lekki } = schools;
    const { tie } = await stocked(app, api, schools);
    const cap = await createItem(api, owner, {
      name: 'Cap',
      variant: null,
      costPriceMinor: 100_000,
      sellPriceMinor: 150_000,
    });
    await receive(api, owner, {
      campusId: lekki.id,
      accountId: (
        await createMoneyAccount(app, owner, { name: 'Cap bank', kind: 'bank' })
      ).id,
      lines: [{ itemId: cap.id, quantity: 2, unitCostMinor: TIE_AVERAGE }],
    });
    const count = await submitCount(api, lekkiOnly, {
      campusId: lekki.id,
      lines: [
        { itemId: tie.id, countedQuantity: 3 },
        { itemId: cap.id, countedQuantity: 3 },
      ],
    });
    expect(count.netValueMinor).toBe(0);
    const before = await countEntries(pool);

    const approved = await approveCount(api, owner, count.id);

    expect(approved.status).toBe('approved');
    expect(await countMovements(pool, count.number)).toHaveLength(2);
    expect(await countEntries(pool)).toBe(before);
    expect((await decisionRow(pool, count.id))?.journal_entry_id).toBeNull();
    expect(await stockLedgerByCampus(pool, orgA.id)).toEqual(
      await stockValueByCampus(pool, orgA.id)
    );
  });

  test('approving after the last unit was sold answers 409 and writes nothing', async ({
    api,
    app,
    pool,
    schools,
  }) => {
    const { owner, lekkiOnly, lekki, studentLekki } = schools;
    const { tie } = await stocked(app, api, schools);
    const count = await submitCount(api, lekkiOnly, {
      campusId: lekki.id,
      lines: [{ itemId: tie.id, countedQuantity: 3 }],
    });
    await sell(api, owner, {
      studentId: studentLekki.id,
      lines: [{ itemId: tie.id, quantity: 4 }],
    });
    const before = await countEntries(pool);

    const res = await api(owner)
      .post(`/store/counts/${count.id}/approve`)
      .expect(409);

    expect(res.body.message).toBe(STOCK_MOVED_MESSAGE);
    expect(await countMovements(pool, count.number)).toEqual([]);
    expect(await countEntries(pool)).toBe(before);
    expect((await decisionRow(pool, count.id))?.status).toBe('submitted');
  });

  test('two approvers at once post once and the second hears it was decided', async ({
    api,
    app,
    pool,
    withPermissions,
    schools,
  }) => {
    const { owner, lekkiOnly, orgA, lekki } = schools;
    const { tie } = await stocked(app, api, schools);
    const second = await withPermissions(
      orgA,
      ['adjustment:approve', 'store:read'],
      { campuses: [lekki] }
    );
    const count = await submitCount(api, lekkiOnly, {
      campusId: lekki.id,
      lines: [{ itemId: tie.id, countedQuantity: 3 }],
    });

    const results = await Promise.all([
      api(owner).post(`/store/counts/${count.id}/approve`),
      api(second).post(`/store/counts/${count.id}/approve`),
    ]);

    expect(results.map((res) => res.status).toSorted((a, b) => a - b)).toEqual([
      200, 409,
    ]);
    const loser = results.find((res) => res.status === 409);
    expect(loser?.body).toMatchObject({
      code: 'AlreadyDecided',
      message: ALREADY_DECIDED_MESSAGE,
    });
    expect(await countMovements(pool, count.number)).toHaveLength(1);
    expect(await entriesFor(pool, orgA.id, count.number)).toHaveLength(2);
  });

  test('a second decision answers 409 "This has already been decided."', async ({
    api,
    app,
    schools,
  }) => {
    const { owner, lekkiOnly, lekki } = schools;
    const { tie } = await stocked(app, api, schools);
    const count = await submitCount(api, lekkiOnly, {
      campusId: lekki.id,
      lines: [{ itemId: tie.id, countedQuantity: 3 }],
    });
    await approveCount(api, owner, count.id);

    const again = await api(owner)
      .post(`/store/counts/${count.id}/approve`)
      .expect(409);
    const decline = await api(owner)
      .post(`/store/counts/${count.id}/decline`)
      .send({ reason: 'Too late' })
      .expect(409);

    expect(again.body.message).toBe(ALREADY_DECIDED_MESSAGE);
    expect(decline.body.message).toBe(ALREADY_DECIDED_MESSAGE);
  });

  test('a matched count cannot be approved', async ({ api, app, schools }) => {
    const { owner, lekkiOnly, lekki } = schools;
    const { tie } = await stocked(app, api, schools);
    const count = await submitCount(api, lekkiOnly, {
      campusId: lekki.id,
      lines: [{ itemId: tie.id, countedQuantity: 4 }],
    });
    await api(owner).post(`/store/counts/${count.id}/approve`).expect(409);
  });
});

test.describe('declining a count', () => {
  test('without a reason answers 400, and with one keeps the count as declined and stock unchanged', async ({
    api,
    app,
    pool,
    schools,
  }) => {
    const { owner, lekkiOnly, orgA, lekki } = schools;
    const { tie } = await stocked(app, api, schools);
    const count = await submitCount(api, lekkiOnly, {
      campusId: lekki.id,
      lines: [{ itemId: tie.id, countedQuantity: 3 }],
    });
    const before = await stockValueByCampus(pool, orgA.id);

    const blank = await api(owner)
      .post(`/store/counts/${count.id}/decline`)
      .send({ reason: '   ' })
      .expect(400);
    expect(messageOf(blank)).toBe(DECLINE_REASON_MESSAGE);
    await api(owner).post(`/store/counts/${count.id}/decline`).expect(400);

    const declined = await declineCount(api, owner, {
      id: count.id,
      reason: 'Recount first',
    });

    expect(declined).toMatchObject({
      status: 'rejected',
      rejectionReason: 'Recount first',
      decidedBy: { id: owner.id },
    });
    expect(await stockValueByCampus(pool, orgA.id)).toEqual(before);
    expect(await countMovements(pool, count.number)).toEqual([]);
    expect(await countEntries(pool)).toBe(0);
    const next = await submitCount(api, lekkiOnly, {
      campusId: lekki.id,
      lines: [{ itemId: tie.id, countedQuantity: 3 }],
    });
    expect(next.status).toBe('submitted');
  });
});

test.describe('who may count and decide', () => {
  test('the counter cannot approve or decline their own count, from the API or a direct UPDATE', async ({
    api,
    app,
    pool,
    withPermissions,
    schools,
  }) => {
    const { orgA, lekki } = schools;
    const { tie } = await stocked(app, api, schools);
    const both = await withPermissions(
      orgA,
      ['store:read', 'store:count', 'adjustment:approve'],
      { campuses: [lekki] }
    );
    const count = await submitCount(api, both, {
      campusId: lekki.id,
      lines: [{ itemId: tie.id, countedQuantity: 3 }],
    });

    const approve = await api(both)
      .post(`/store/counts/${count.id}/approve`)
      .expect(409);
    const decline = await api(both)
      .post(`/store/counts/${count.id}/decline`)
      .send({ reason: 'Mine' })
      .expect(409);

    expect(approve.body).toMatchObject({
      code: 'SelfApproval',
      message: SELF_APPROVAL_MESSAGE,
    });
    expect(decline.body).toMatchObject({ code: 'SelfApproval' });
    await expect(
      pool.query(
        `UPDATE stock_count SET status = 'approved', approved_by = created_by,
           approved_at = now() WHERE id = $1`,
        [count.id]
      )
    ).rejects.toThrow(/stock_count_approved_not_self/);
    await expect(
      pool.query(
        `UPDATE stock_count SET status = 'rejected', rejected_by = created_by,
           rejected_at = now(), rejection_reason = 'Mine' WHERE id = $1`,
        [count.id]
      )
    ).rejects.toThrow(/stock_count_rejected_not_self/);
    expect(await countMovements(pool, count.number)).toEqual([]);
  });

  test('store:count and adjustment:approve are each needed', async ({
    api,
    app,
    withPermissions,
    schools,
  }) => {
    const { owner, orgA, lekki } = schools;
    const { tie } = await stocked(app, api, schools);
    const reader = await withPermissions(orgA, ['store:read'], {
      campuses: [lekki],
    });
    const counter = await withPermissions(orgA, ['store:read', 'store:count'], {
      campuses: [lekki],
    });
    const approver = await withPermissions(orgA, ['adjustment:approve'], {
      campuses: [lekki],
    });
    const count = await submitCount(api, owner, {
      campusId: lekki.id,
      lines: [{ itemId: tie.id, countedQuantity: 3 }],
    });
    const body = countBody({
      campusId: lekki.id,
      lines: [{ itemId: tie.id, countedQuantity: 3 }],
    });

    await api(reader).get('/store/counts').expect(200);
    await api(reader).get(`/store/counts/${count.id}`).expect(200);
    await api(approver).get(`/store/counts/${count.id}`).expect(200);
    await api(approver).get('/store/counts').expect(403);
    await api(reader).post('/store/counts').send(body).expect(403);
    await api(counter).post(`/store/counts/${count.id}/approve`).expect(403);
    await api(counter)
      .post(`/store/counts/${count.id}/decline`)
      .send({ reason: 'No' })
      .expect(403);
    await api(counter).post('/store/counts').send(body).expect(409);
  });

  test('a campus whose store has a matched count refuses to be deleted', async ({
    api,
    createCampus,
    schools,
  }) => {
    const { owner, orgA } = schools;
    const annex = await createCampus(orgA, 'Annex');
    const cap = await createItem(api, owner, { name: 'Cap', variant: null });
    await submitCount(api, owner, {
      campusId: annex.id,
      lines: [{ itemId: cap.id, countedQuantity: 0 }],
    });

    const res = await api(owner).delete(`/campuses/${annex.id}`).expect(409);

    expect(res.body.message).toBe(
      'This campus still has classes, students or money records, so it can’t be deleted.'
    );
    await api(owner).get(`/campuses/${annex.id}`).expect(200);
  });
});

test.describe('isolation', () => {
  test('another school’s ids answer 404 and its lists hold none of A’s counts (cases 1, 2 and 7)', async ({
    api,
    app,
    pool,
    schools,
  }) => {
    const { owner, ownerB, orgA, orgB, lekki, campusB } = schools;
    const { tie } = await stocked(app, api, schools);
    const count = await submitCount(api, owner, {
      campusId: lekki.id,
      lines: [{ itemId: tie.id, countedQuantity: 3 }],
    });
    const itemB = await createItem(api, ownerB);

    await api(ownerB).get(`/store/counts/${count.id}`).expect(404);
    await api(ownerB).post(`/store/counts/${count.id}/approve`).expect(404);
    await api(ownerB)
      .post(`/store/counts/${count.id}/decline`)
      .send({ reason: 'No' })
      .expect(404);
    const campus = await api(ownerB)
      .post('/store/counts')
      .send(
        countBody({
          campusId: lekki.id,
          lines: [{ itemId: itemB.id, countedQuantity: 1 }],
        })
      )
      .expect(404);
    expect(campus.body.message).toBe(STORE_CAMPUS_NOT_FOUND_MESSAGE);
    const item = await api(ownerB)
      .post('/store/counts')
      .send(
        countBody({
          campusId: campusB.id,
          lines: [{ itemId: tie.id, countedQuantity: 1 }],
        })
      )
      .expect(404);
    expect(item.body.message).toBe(ITEM_NOT_FOUND_MESSAGE);

    const list = (await api(ownerB).get('/store/counts').expect(200))
      .body as StockCountList;
    expect(list).toEqual({ items: [], total: 0 });
    await api(ownerB).get(`/store/counts?campusId=${lekki.id}`).expect(404);
    expect(
      (
        (await api(owner).get('/store/counts').expect(200))
          .body as StockCountList
      ).items
    ).toHaveLength(1);
    expect(await financeActivityRows(pool, orgA.id)).toEqual([]);
    expect(await financeActivityRows(pool, orgB.id)).toEqual([]);
  });

  test('the composite foreign keys refuse a count or line that points into another school (case 7)', async ({
    api,
    app,
    pool,
    schools,
  }) => {
    const { owner, orgA, orgB, ownerB, lekki } = schools;
    const { tie } = await stocked(app, api, schools);
    const count = await submitCount(api, owner, {
      campusId: lekki.id,
      lines: [{ itemId: tie.id, countedQuantity: 3 }],
    });
    const itemB = await createItem(api, ownerB);
    const storeA = (
      await pool.query<{ id: string }>(
        'SELECT id FROM store WHERE campus_id = $1',
        [lekki.id]
      )
    ).rows[0]?.id;

    await expect(
      pool.query(
        `INSERT INTO stock_count (organization_id, number, store_id, status)
         VALUES ($1, 'CNT-9999-0001', $2, 'matched')`,
        [orgB.id, storeA]
      )
    ).rejects.toThrow(/foreign key/);
    await expect(
      pool.query(
        `INSERT INTO stock_count_line (organization_id, stock_count_id, item_id,
           expected_quantity, counted_quantity)
         VALUES ($1, $2, $3, 0, 0)`,
        [orgA.id, count.id, itemB.id]
      )
    ).rejects.toThrow(/foreign key/);
  });

  test('a Lekki member cannot see or count the Ikeja store; an Ikeja-only approver gets 404 on a Lekki count and does not see it in /approvals (cases 3 and 4)', async ({
    api,
    app,
    withPermissions,
    schools,
  }) => {
    const { owner, lekkiOnly, orgA, lekki, ikeja } = schools;
    const { tie } = await stocked(app, api, schools);
    const cash = await createMoneyAccount(app, owner, {
      name: 'Ikeja cash box',
      kind: 'cash',
      campusId: ikeja.id,
    });
    await receive(api, owner, {
      campusId: ikeja.id,
      accountId: cash.id,
      lines: [{ itemId: tie.id, quantity: 5, unitCostMinor: 100_000 }],
    });
    const atLekki = await submitCount(api, lekkiOnly, {
      campusId: lekki.id,
      lines: [{ itemId: tie.id, countedQuantity: 3 }],
    });
    const atIkeja = await submitCount(api, owner, {
      campusId: ikeja.id,
      lines: [{ itemId: tie.id, countedQuantity: 4 }],
    });
    const ikejaApprover = await withPermissions(
      orgA,
      ['store:read', 'adjustment:approve'],
      { campuses: [ikeja] }
    );

    await api(lekkiOnly).get(`/store/counts/${atIkeja.id}`).expect(404);
    await api(lekkiOnly).get(`/store/counts?campusId=${ikeja.id}`).expect(404);
    await api(lekkiOnly)
      .post('/store/counts')
      .send(
        countBody({
          campusId: ikeja.id,
          lines: [{ itemId: tie.id, countedQuantity: 1 }],
        })
      )
      .expect(404);
    const mine = (await api(lekkiOnly).get('/store/counts').expect(200))
      .body as StockCountList;
    expect(mine.items.map((row) => row.id)).toEqual([atLekki.id]);

    await api(ikejaApprover).get(`/store/counts/${atLekki.id}`).expect(404);
    await api(ikejaApprover)
      .post(`/store/counts/${atLekki.id}/approve`)
      .expect(404);
    await api(ikejaApprover)
      .post(`/store/counts/${atLekki.id}/decline`)
      .send({ reason: 'No' })
      .expect(404);
    const queue = (await api(ikejaApprover).get('/approvals').expect(200))
      .body as ApprovalList;
    expect(queue.items.map((row) => row.id)).toEqual([atIkeja.id]);
    expect(queue.items[0]).toMatchObject({
      kind: 'store_write_off',
      campusId: ikeja.id,
    });
  });

  test('no permission gets 403 and no session gets 401 on every count route (cases 5 and 6)', async ({
    api,
    app,
    schools,
  }) => {
    const { owner, noPermission, lekki } = schools;
    const { tie } = await stocked(app, api, schools);
    const count = await submitCount(api, owner, {
      campusId: lekki.id,
      lines: [{ itemId: tie.id, countedQuantity: 3 }],
    });
    const body = countBody({
      campusId: lekki.id,
      lines: [{ itemId: tie.id, countedQuantity: 3 }],
    });
    const routes = [
      () => api(noPermission).get('/store/counts'),
      () => api(noPermission).get(`/store/counts/${count.id}`),
      () => api(noPermission).post('/store/counts').send(body),
      () => api(noPermission).post(`/store/counts/${count.id}/approve`),
      () =>
        api(noPermission)
          .post(`/store/counts/${count.id}/decline`)
          .send({ reason: 'No' }),
    ];
    for (const route of routes) {
      await route().expect(403);
    }
    await api().get('/store/counts').expect(401);
    await api().get(`/store/counts/${count.id}`).expect(401);
    await api().post('/store/counts').send(body).expect(401);
    await api().post(`/store/counts/${count.id}/approve`).expect(401);
    await api()
      .post(`/store/counts/${count.id}/decline`)
      .send({ reason: 'No' })
      .expect(401);
  });

  test('the counter cannot decide their own count (case 11)', async ({
    api,
    app,
    schools,
  }) => {
    const { owner, lekki } = schools;
    const { tie } = await stocked(app, api, schools);
    const count = await submitCount(api, owner, {
      campusId: lekki.id,
      lines: [{ itemId: tie.id, countedQuantity: 3 }],
    });

    const res = await api(owner)
      .post(`/store/counts/${count.id}/approve`)
      .expect(409);

    expect(res.body).toMatchObject({ code: 'SelfApproval' });
  });

  test('an acting super admin without a reason cannot count, approve or decline (case 12)', async ({
    api,
    app,
    pool,
    makeSuperAdmin,
    createUser,
    schools,
  }) => {
    const { owner, orgA, lekki } = schools;
    const { tie } = await stocked(app, api, schools);
    const count = await submitCount(api, owner, {
      campusId: lekki.id,
      lines: [{ itemId: tie.id, countedQuantity: 3 }],
    });
    const admin = await makeSuperAdmin(await createUser());

    const submitted = await api(admin)
      .post('/store/counts')
      .set(acting(orgA.id))
      .send(
        countBody({
          campusId: lekki.id,
          lines: [{ itemId: tie.id, countedQuantity: 2 }],
        })
      )
      .expect(403);
    await api(admin)
      .post(`/store/counts/${count.id}/approve`)
      .set(acting(orgA.id))
      .expect(403);
    await api(admin)
      .post(`/store/counts/${count.id}/decline`)
      .set(acting(orgA.id))
      .send({ reason: 'No' })
      .expect(403);

    expect(submitted.body).toMatchObject({ code: 'ActingReadOnly' });
    expect((await decisionRow(pool, count.id))?.status).toBe('submitted');
    await api(admin).get('/store/counts').set(acting(orgA.id)).expect(200);
  });
});
