import {
  BOOK_LEVEL_REQUIRED_MESSAGE,
  DELIVERY_ACCOUNT_MESSAGE,
  DELIVERY_FUTURE_DATE_MESSAGE,
  DELIVERY_QUANTITY_MAX,
  DELIVERY_QUANTITY_MAX_MESSAGE,
  DELIVERY_REQUIRED_MESSAGE,
  DELIVERY_UNIT_COST_MESSAGE,
  ITEM_PRICE_BELOW_COST_MESSAGE,
  UNIFORM_NO_LEVEL_MESSAGE,
  UNIT_PRICE_MAX_MESSAGE,
  UNIT_PRICE_MAX_MINOR,
  deliveryRetiredItemMessage,
  itemDuplicateMessage,
  openingStockRecordedMessage,
  type DashboardStore,
  type DeliveryDetail,
  type DeliveryList,
  type Item,
  type ItemList,
  type StoreSummary,
} from '@eduvault/api-contract';
import { acting, expect } from './support/base-test';
import { entriesFor } from './support/factories/billing';
import { ledgerAccountId, postEntry } from './support/factories/finance';
import { bankAccount } from './support/factories/payments';
import {
  classLevelId,
  createItem,
  deliveryBody,
  gatewayAccountId,
  nextDeliveryReference,
  openStock,
  receive,
  shirt,
  stockLedgerByCampus,
  stockValueByCampus,
  storeIdOf,
} from './support/factories/store';
import { schoolsTest as test } from './support/two-schools';

const NO_SALES = {
  termSalesMinor: 0,
  termCostMinor: 0,
  termSalesCount: 0,
  termItemsSold: 0,
  termStudentsServed: 0,
};

const COST = 350_000;
const TEN_SHIRTS = 10 * COST;

const rows = async (
  pool: { query: (sql: string) => Promise<{ rows: { n: string }[] }> },
  table: string
) =>
  Number(
    (await pool.query(`SELECT count(*)::text AS n FROM ${table}`)).rows[0]?.n
  );

const messageOf = (res: {
  body: { message: string; issues?: { message: string }[] };
}): string => res.body.issues?.[0]?.message ?? res.body.message;

const byJson = (a: unknown, b: unknown) =>
  JSON.stringify(a).localeCompare(JSON.stringify(b));

const stockOf = (item: Item, campusId: string) =>
  item.stock.find((row) => row.campusId === campusId);

test.describe('receiving a delivery', () => {
  test('posts one receive movement and one balanced Dr 1300 / Cr bank entry', async ({
    api,
    app,
    pool,
    schools: { owner, orgA, lekki },
  }) => {
    const size12 = await createItem(api, owner);
    const bank = await bankAccount(app, owner);

    const delivery = await receive(api, owner, {
      campusId: lekki.id,
      accountId: bank.id,
      lines: [{ itemId: size12.id, quantity: 10, unitCostMinor: COST }],
    });

    expect(delivery).toMatchObject({
      replayed: false,
      campusId: lekki.id,
      supplierName: 'Adebayo Uniforms Ltd',
      isOpening: false,
      totalMinor: TEN_SHIRTS,
      itemCount: 1,
      moneyAccount: { id: bank.id },
      lines: [
        {
          itemId: size12.id,
          displayName: 'School shirt, Size 12',
          quantity: 10,
          unitCostMinor: COST,
          totalMinor: TEN_SHIRTS,
          retired: false,
        },
      ],
    });
    expect(delivery.number).toMatch(/^DEL-\d{4}-0001$/);

    const movements = await pool.query(
      `SELECT kind, quantity, value_minor::text, reference, source_id
       FROM stock_movement WHERE organization_id = $1`,
      [orgA.id]
    );
    expect(movements.rows).toEqual([
      {
        kind: 'receive',
        quantity: 10,
        value_minor: String(TEN_SHIRTS),
        reference: delivery.number,
        source_id: delivery.id,
      },
    ]);

    const bankCode = (
      await pool.query<{ code: number }>(
        `SELECT la.code FROM money_account ma
         JOIN ledger_account la ON la.id = ma.ledger_account_id
         WHERE ma.id = $1`,
        [bank.id]
      )
    ).rows[0]?.code;
    const lines = await entriesFor(pool, orgA.id, delivery.number);
    expect(
      lines.map((line) => [
        line.code,
        line.campus_id,
        line.debit_minor,
        line.credit_minor,
      ])
    ).toEqual([
      [bankCode, lekki.id, '0', String(TEN_SHIRTS)],
      [1300, lekki.id, String(TEN_SHIRTS), '0'],
    ]);
    const entry = await pool.query(
      `SELECT kind, to_char(effective_on, 'YYYY-MM-DD') AS day FROM journal_entry
       WHERE organization_id = $1 AND reference = $2`,
      [orgA.id, delivery.number]
    );
    expect(entry.rows).toEqual([
      { kind: 'store_receive', day: delivery.receivedOn },
    ]);
  });

  test('keeps on hand equal to the movements and 1300 equal to their value per campus', async ({
    api,
    app,
    pool,
    schools: { owner, orgA, lekki, ikeja },
  }) => {
    const size12 = await createItem(api, owner);
    const tie = await createItem(api, owner, {
      name: 'School tie',
      variant: null,
      costPriceMinor: 120_000,
      sellPriceMinor: 180_000,
    });
    const bank = await bankAccount(app, owner);
    await openStock(api, owner, {
      campusId: lekki.id,
      lines: [
        { itemId: size12.id, quantity: 20, unitCostMinor: COST },
        { itemId: tie.id, quantity: 8, unitCostMinor: 120_000 },
      ],
    });
    await openStock(api, owner, {
      campusId: ikeja.id,
      lines: [{ itemId: size12.id, quantity: 6, unitCostMinor: 340_000 }],
    });
    await receive(api, owner, {
      campusId: lekki.id,
      accountId: bank.id,
      lines: [{ itemId: size12.id, quantity: 10, unitCostMinor: 400_000 }],
    });
    await receive(api, owner, {
      campusId: ikeja.id,
      accountId: bank.id,
      lines: [
        { itemId: size12.id, quantity: 4, unitCostMinor: 360_000 },
        { itemId: tie.id, quantity: 12, unitCostMinor: 100_000 },
      ],
    });

    const list = (await api(owner).get('/store/items').expect(200))
      .body as ItemList;
    const shirtRow = list.items.find((item) => item.id === size12.id);
    const tieRow = list.items.find((item) => item.id === tie.id);
    expect(stockOf(shirtRow!, lekki.id)).toEqual({
      campusId: lekki.id,
      onHand: 30,
      valueMinor: 20 * COST + 10 * 400_000,
      averageCostMinor: Math.round((20 * COST + 10 * 400_000) / 30),
    });
    expect(stockOf(shirtRow!, ikeja.id)?.onHand).toBe(10);
    expect(stockOf(tieRow!, ikeja.id)?.onHand).toBe(12);

    const onHand = await pool.query(
      `SELECT s.campus_id, m.item_id, sum(m.quantity)::int AS on_hand
       FROM stock_movement m JOIN store s ON s.id = m.store_id
       WHERE m.organization_id = $1 GROUP BY s.campus_id, m.item_id`,
      [orgA.id]
    );
    for (const row of onHand.rows as {
      campus_id: string;
      item_id: string;
      on_hand: number;
    }[]) {
      const item = list.items.find((candidate) => candidate.id === row.item_id);
      expect(stockOf(item!, row.campus_id)?.onHand).toBe(row.on_hand);
    }
    const ledger = await stockLedgerByCampus(pool, orgA.id);
    expect(ledger).toEqual(await stockValueByCampus(pool, orgA.id));
    expect(ledger[lekki.id]).toBe(20 * COST + 8 * 120_000 + 10 * 400_000);
  });

  test('refuses an update or a delete of a stock movement', async ({
    api,
    pool,
    schools: { owner, lekki },
  }) => {
    const size12 = await createItem(api, owner);
    await openStock(api, owner, {
      campusId: lekki.id,
      lines: [{ itemId: size12.id, quantity: 5, unitCostMinor: COST }],
    });

    await expect(
      pool.query('UPDATE stock_movement SET quantity = 99')
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      pool.query('DELETE FROM stock_movement')
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      pool.query('DELETE FROM stock_delivery')
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      pool.query('UPDATE stock_delivery_line SET quantity = 1')
    ).rejects.toMatchObject({ code: '23514' });
    await expect(pool.query('DELETE FROM item')).rejects.toMatchObject({
      code: '23514',
    });
    expect(await rows(pool, 'stock_movement')).toBe(1);
  });

  test('posts opening stock as Dr 1300 / Cr 3000 with the campus reference and refuses a second', async ({
    api,
    pool,
    schools: { owner, orgA, lekki },
  }) => {
    const size12 = await createItem(api, owner);

    const opening = await openStock(api, owner, {
      campusId: lekki.id,
      lines: [{ itemId: size12.id, quantity: 10, unitCostMinor: COST }],
    });

    expect(opening).toMatchObject({
      isOpening: true,
      number: `OPEN-STORE-${lekki.id}`,
      moneyAccount: null,
      totalMinor: TEN_SHIRTS,
    });
    const lines = await entriesFor(pool, orgA.id, `OPEN-STORE-${lekki.id}`);
    expect(
      lines.map((line) => [line.code, line.debit_minor, line.credit_minor])
    ).toEqual([
      [1300, String(TEN_SHIRTS), '0'],
      [3000, '0', String(TEN_SHIRTS)],
    ]);
    const kind = await pool.query(
      `SELECT kind FROM journal_entry WHERE reference = $1`,
      [`OPEN-STORE-${lekki.id}`]
    );
    expect(kind.rows).toEqual([{ kind: 'opening' }]);

    const second = await api(owner)
      .post('/store/deliveries')
      .send({
        ...deliveryBody({
          campusId: lekki.id,
          lines: [{ itemId: size12.id, quantity: 1, unitCostMinor: COST }],
        }),
        isOpening: true,
      })
      .expect(409);
    expect(second.body.message).toBe(openingStockRecordedMessage('Lekki'));
    expect(await rows(pool, 'stock_delivery')).toBe(1);

    await api(owner)
      .patch(`/store/items/${size12.id}`)
      .send({ retired: true })
      .expect(200);
    const again = await api(owner)
      .post('/store/deliveries')
      .send({
        ...deliveryBody({
          campusId: lekki.id,
          lines: [{ itemId: size12.id, quantity: 1, unitCostMinor: COST }],
        }),
        isOpening: true,
        receivedOn: '2999-01-01',
      })
      .expect(409);
    expect(again.body.message).toBe(openingStockRecordedMessage('Lekki'));
  });

  test('refuses bad deliveries with their messages and records nothing', async ({
    api,
    app,
    pool,
    schools: { owner, orgA, lekki, ikeja },
  }) => {
    const size12 = await createItem(api, owner);
    const old = await createItem(api, owner, { variant: 'Size 10' });
    const bank = await bankAccount(app, owner);
    const retiredAccount = await bankAccount(app, owner);
    await api(owner)
      .patch(`/finance/money-accounts/${retiredAccount.id}`)
      .send({ retired: true })
      .expect(200);
    const ikejaAccount = await bankAccount(app, owner, ikeja.id);
    const gateway = await gatewayAccountId(pool, orgA.id);
    await api(owner)
      .patch(`/store/items/${old.id}`)
      .send({ retired: true })
      .expect(200);
    const line = { itemId: size12.id, quantity: 2, unitCostMinor: COST };
    const post = (change: Record<string, unknown>) =>
      api(owner)
        .post('/store/deliveries')
        .send({
          ...deliveryBody({
            campusId: lekki.id,
            accountId: bank.id,
            lines: [line],
          }),
          ...change,
        });

    expect(messageOf(await post({ lines: [] }).expect(400))).toBe(
      DELIVERY_REQUIRED_MESSAGE
    );
    expect(
      messageOf(
        await post({ lines: [{ itemId: size12.id, quantity: 2 }] }).expect(400)
      )
    ).toBe(DELIVERY_UNIT_COST_MESSAGE);
    expect(
      messageOf(await post({ receivedOn: '2999-01-01' }).expect(400))
    ).toBe(DELIVERY_FUTURE_DATE_MESSAGE);
    expect(
      messageOf(
        await post({
          lines: [{ ...line, quantity: DELIVERY_QUANTITY_MAX + 1 }],
        }).expect(400)
      )
    ).toBe(DELIVERY_QUANTITY_MAX_MESSAGE);
    expect(
      messageOf(
        await post({
          lines: [{ ...line, unitCostMinor: UNIT_PRICE_MAX_MINOR + 1 }],
        }).expect(400)
      )
    ).toBe(UNIT_PRICE_MAX_MESSAGE);
    for (const moneyAccountId of [
      gateway,
      retiredAccount.id,
      ikejaAccount.id,
    ]) {
      expect(messageOf(await post({ moneyAccountId }).expect(400))).toBe(
        DELIVERY_ACCOUNT_MESSAGE
      );
    }
    expect(
      messageOf(
        await post({
          lines: [{ itemId: old.id, quantity: 1, unitCostMinor: COST }],
        }).expect(400)
      )
    ).toBe(deliveryRetiredItemMessage('School shirt, Size 10'));

    expect(await rows(pool, 'stock_delivery')).toBe(0);
    expect(await rows(pool, 'stock_movement')).toBe(0);
    expect(await rows(pool, 'journal_entry')).toBe(0);
  });

  test('replays a repeated reference as 200 with one set of rows and refuses a different body', async ({
    api,
    app,
    pool,
    schools: { owner, lekki },
  }) => {
    const size12 = await createItem(api, owner);
    const bank = await bankAccount(app, owner);
    const body = deliveryBody({
      campusId: lekki.id,
      accountId: bank.id,
      lines: [{ itemId: size12.id, quantity: 10, unitCostMinor: COST }],
    });

    const first = await api(owner)
      .post('/store/deliveries')
      .send(body)
      .expect(201);
    const again = await api(owner)
      .post('/store/deliveries')
      .send(body)
      .expect(200);

    expect(first.body).toMatchObject({ replayed: false });
    expect(again.body).toMatchObject({ replayed: true, id: first.body.id });
    expect(await rows(pool, 'stock_delivery')).toBe(1);
    expect(await rows(pool, 'stock_delivery_line')).toBe(1);
    expect(await rows(pool, 'stock_movement')).toBe(1);
    expect(await rows(pool, 'journal_entry')).toBe(1);

    const different = await api(owner)
      .post('/store/deliveries')
      .send({
        ...body,
        lines: [{ itemId: size12.id, quantity: 11, unitCostMinor: COST }],
      })
      .expect(409);
    expect(different.body.message).toContain(first.body.number);
    expect(await rows(pool, 'stock_movement')).toBe(1);
  });

  test('lists deliveries with the suppliers over the scope and reads one by id', async ({
    api,
    app,
    schools: { owner, lekkiOnly, lekki, ikeja },
  }) => {
    const size12 = await createItem(api, owner);
    const bank = await bankAccount(app, owner);
    const line = { itemId: size12.id, quantity: 3, unitCostMinor: COST };
    const atLekki = await receive(api, owner, {
      campusId: lekki.id,
      accountId: bank.id,
      supplierName: 'Adebayo Uniforms Ltd',
      lines: [line],
    });
    await receive(api, owner, {
      campusId: ikeja.id,
      accountId: bank.id,
      supplierName: 'Bisi Textiles',
      lines: [line],
    });
    await openStock(api, owner, { campusId: lekki.id, lines: [line] });

    const all = (await api(owner).get('/store/deliveries').expect(200))
      .body as DeliveryList;
    expect(all.total).toBe(3);
    expect(all.suppliers).toEqual(['Adebayo Uniforms Ltd', 'Bisi Textiles']);
    const filtered = (
      await api(owner).get(`/store/deliveries?campusId=${ikeja.id}`).expect(200)
    ).body as DeliveryList;
    expect(filtered.items.map((row) => row.campusId)).toEqual([ikeja.id]);

    const mine = (await api(lekkiOnly).get('/store/deliveries').expect(200))
      .body as DeliveryList;
    expect(mine.items.every((row) => row.campusId === lekki.id)).toBe(true);
    expect(mine.suppliers).toEqual(['Adebayo Uniforms Ltd']);

    const detail = (
      await api(owner).get(`/store/deliveries/${atLekki.id}`).expect(200)
    ).body as DeliveryDetail;
    expect(detail).toMatchObject({ id: atLekki.id, number: atLekki.number });
    expect(detail.lines).toHaveLength(1);
  });
});

test.describe('items', () => {
  test('lists per-campus stock for the owner and only Lekki for a Lekki member, with the filters', async ({
    api,
    pool,
    schools: { owner, lekkiOnly, orgA, lekki, ikeja },
  }) => {
    const plenty = await createItem(api, owner, {
      name: 'School tie',
      variant: null,
      lowStockLevel: 2,
    });
    const low = await createItem(api, owner, { variant: 'Size 14' });
    const book = await createItem(api, owner, {
      kind: 'book',
      name: 'Mathematics',
      variant: null,
      classLevelId: await classLevelId(pool, orgA.id),
    });
    const gone = await createItem(api, owner, { variant: 'Size 8' });
    await api(owner)
      .patch(`/store/items/${gone.id}`)
      .send({ retired: true })
      .expect(200);
    await openStock(api, owner, {
      campusId: lekki.id,
      lines: [
        { itemId: plenty.id, quantity: 40, unitCostMinor: 100_000 },
        { itemId: low.id, quantity: 3, unitCostMinor: COST },
      ],
    });
    await openStock(api, owner, {
      campusId: ikeja.id,
      lines: [{ itemId: plenty.id, quantity: 40, unitCostMinor: 100_000 }],
    });

    const asOwner = (await api(owner).get('/store/items').expect(200))
      .body as ItemList;
    expect(asOwner.total).toBe(3);
    const tie = asOwner.items.find((item) => item.id === plenty.id);
    expect(
      tie?.stock.map((row) => [row.campusId, row.onHand]).toSorted(byJson)
    ).toEqual(
      [
        [lekki.id, 40],
        [ikeja.id, 40],
      ].toSorted(byJson)
    );
    expect(tie?.state).toBe('in');
    expect(asOwner.items.find((item) => item.id === low.id)?.state).toBe('low');
    const bookRow = asOwner.items.find((item) => item.id === book.id);
    expect(bookRow).toMatchObject({
      state: 'out',
      classLevel: { name: 'JSS 1' },
    });

    const asLekki = (await api(lekkiOnly).get('/store/items').expect(200))
      .body as ItemList;
    expect(
      asLekki.items.every(
        (item) =>
          item.stock.length === 1 && item.stock[0]?.campusId === lekki.id
      )
    ).toBe(true);

    const lowOnly = (
      await api(owner).get('/store/items?lowOnly=true').expect(200)
    ).body as ItemList;
    expect(lowOnly.items.map((item) => item.id).toSorted(byJson)).toEqual(
      [low.id, book.id].toSorted(byJson)
    );
    const books = (await api(owner).get('/store/items?kind=book').expect(200))
      .body as ItemList;
    expect(books.items.map((item) => item.id)).toEqual([book.id]);
    const searched = (
      await api(owner).get('/store/items?q=size%2014').expect(200)
    ).body as ItemList;
    expect(searched.items.map((item) => item.id)).toEqual([low.id]);
    const withRetired = (
      await api(owner).get('/store/items?includeRetired=true').expect(200)
    ).body as ItemList;
    expect(withRetired.total).toBe(4);
    expect(
      withRetired.items.find((item) => item.id === gone.id)?.retiredAt
    ).not.toBeNull();
    const ikejaOnly = (
      await api(owner).get(`/store/items?campusId=${ikeja.id}`).expect(200)
    ).body as ItemList;
    expect(ikejaOnly.items.every((item) => item.stock.length === 1)).toBe(true);
  });

  test('refuses a duplicate active item with 409 and bad combinations with 400, and accepts a zero cost', async ({
    api,
    pool,
    schools: { owner, orgA },
  }) => {
    await createItem(api, owner);
    const level = await classLevelId(pool, orgA.id);
    const post = (change: Record<string, unknown>) =>
      api(owner).post('/store/items').send(shirt(change));

    expect(messageOf(await post({}).expect(409))).toBe(
      itemDuplicateMessage('School shirt, Size 12')
    );
    expect(
      messageOf(await post({ kind: 'book', variant: null }).expect(400))
    ).toBe(BOOK_LEVEL_REQUIRED_MESSAGE);
    expect(
      messageOf(
        await post({ variant: 'Size 14', classLevelId: level }).expect(400)
      )
    ).toBe(UNIFORM_NO_LEVEL_MESSAGE);
    expect(
      messageOf(
        await post({
          variant: 'Size 14',
          costPriceMinor: 500_000,
          sellPriceMinor: 450_000,
        }).expect(400)
      )
    ).toBe(ITEM_PRICE_BELOW_COST_MESSAGE);
    const free = await post({ variant: 'Size 16', costPriceMinor: 0 }).expect(
      201
    );
    expect(free.body).toMatchObject({ costPriceMinor: 0 });
  });

  test('allows the same name again once the first item is retired', async ({
    api,
    schools: { owner },
  }) => {
    const first = await createItem(api, owner);
    await api(owner)
      .patch(`/store/items/${first.id}`)
      .send({ retired: true })
      .expect(200);

    await createItem(api, owner);
  });

  test('writes a price change for a cost edit and leaves the stock value unchanged', async ({
    api,
    pool,
    schools: { owner, orgA, lekki },
  }) => {
    const size12 = await createItem(api, owner);
    await openStock(api, owner, {
      campusId: lekki.id,
      lines: [{ itemId: size12.id, quantity: 10, unitCostMinor: COST }],
    });

    const edited = await api(owner)
      .patch(`/store/items/${size12.id}`)
      .send({ costPriceMinor: 400_000, sellPriceMinor: 500_000 })
      .expect(200);

    expect(edited.body).toMatchObject({
      costPriceMinor: 400_000,
      sellPriceMinor: 500_000,
    });
    expect(stockOf(edited.body as Item, lekki.id)).toMatchObject({
      onHand: 10,
      valueMinor: TEN_SHIRTS,
    });
    const changes = await pool.query(
      `SELECT old_cost_minor::int, new_cost_minor::int, old_price_minor::int, new_price_minor::int
       FROM item_price_change WHERE organization_id = $1`,
      [orgA.id]
    );
    expect(changes.rows).toEqual([
      {
        old_cost_minor: COST,
        new_cost_minor: 400_000,
        old_price_minor: 450_000,
        new_price_minor: 500_000,
      },
    ]);
    await expect(
      pool.query('UPDATE item_price_change SET new_cost_minor = 1')
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      pool.query('DELETE FROM item_price_change')
    ).rejects.toMatchObject({ code: '23514' });
    expect(await rows(pool, 'item_price_change')).toBe(1);

    await api(owner)
      .patch(`/store/items/${size12.id}`)
      .send({ name: 'Polo shirt', lowStockLevel: 8 })
      .expect(200);
    expect(await rows(pool, 'item_price_change')).toBe(1);
  });

  test('refuses to edit a retired item and to receive it, yet a delivery still shows it', async ({
    api,
    app,
    schools: { owner, lekki },
  }) => {
    const size12 = await createItem(api, owner);
    const bank = await bankAccount(app, owner);
    const delivery = await receive(api, owner, {
      campusId: lekki.id,
      accountId: bank.id,
      lines: [{ itemId: size12.id, quantity: 4, unitCostMinor: COST }],
    });
    await api(owner)
      .patch(`/store/items/${size12.id}`)
      .send({ retired: true })
      .expect(200);

    await api(owner)
      .patch(`/store/items/${size12.id}`)
      .send({ name: 'Again' })
      .expect(409);
    await api(owner)
      .post('/store/deliveries')
      .send(
        deliveryBody({
          campusId: lekki.id,
          accountId: bank.id,
          lines: [{ itemId: size12.id, quantity: 1, unitCostMinor: COST }],
        })
      )
      .expect(400);
    const detail = (
      await api(owner).get(`/store/deliveries/${delivery.id}`).expect(200)
    ).body as DeliveryDetail;
    expect(detail.lines).toMatchObject([
      {
        itemId: size12.id,
        displayName: 'School shirt, Size 12',
        retired: true,
      },
    ]);
  });
});

test.describe('summary and dashboard', () => {
  test('give the stock value in scope', async ({
    api,
    schools: { owner, lekkiOnly, lekki, ikeja },
  }) => {
    const size12 = await createItem(api, owner);
    await openStock(api, owner, {
      campusId: lekki.id,
      lines: [{ itemId: size12.id, quantity: 10, unitCostMinor: COST }],
    });
    await openStock(api, owner, {
      campusId: ikeja.id,
      lines: [{ itemId: size12.id, quantity: 2, unitCostMinor: COST }],
    });

    const all = (await api(owner).get('/store/summary').expect(200))
      .body as StoreSummary;
    expect(all).toEqual({
      stockValueMinor: 12 * COST,
      lowCount: 1,
      ...NO_SALES,
    });
    const one = (
      await api(owner).get(`/store/summary?campusId=${lekki.id}`).expect(200)
    ).body as StoreSummary;
    expect(one).toEqual({
      stockValueMinor: TEN_SHIRTS,
      lowCount: 0,
      ...NO_SALES,
    });
    const mine = (await api(lekkiOnly).get('/store/summary').expect(200))
      .body as StoreSummary;
    expect(mine.stockValueMinor).toBe(TEN_SHIRTS);

    const dashboard = (await api(owner).get('/dashboard/store').expect(200))
      .body as DashboardStore;
    expect(dashboard).toEqual({
      stockValueMinor: 12 * COST,
      ...NO_SALES,
    });
    expect(
      (await api(lekkiOnly).get('/dashboard/store').expect(200)).body
    ).toEqual({ stockValueMinor: TEN_SHIRTS, ...NO_SALES });
  });
});

test.describe('isolation', () => {
  test('another school’s ids answer 404 and its lists hold none of A’s rows (cases 1 and 2)', async ({
    api,
    app,
    pool,
    schools: { owner, ownerB, orgA, lekki, campusB },
  }) => {
    const size12 = await createItem(api, owner);
    const bank = await bankAccount(app, owner);
    const delivery = await receive(api, owner, {
      campusId: lekki.id,
      accountId: bank.id,
      lines: [{ itemId: size12.id, quantity: 3, unitCostMinor: COST }],
    });
    const itemB = await createItem(api, ownerB);
    const bankB = await bankAccount(app, ownerB);
    const level = await classLevelId(pool, orgA.id);

    await api(ownerB)
      .patch(`/store/items/${size12.id}`)
      .send({ name: 'Hijack' })
      .expect(404);
    await api(ownerB).get(`/store/deliveries/${delivery.id}`).expect(404);
    const line = { itemId: size12.id, quantity: 1, unitCostMinor: COST };
    const foreign = (change: Record<string, unknown>) =>
      api(ownerB)
        .post('/store/deliveries')
        .send({
          ...deliveryBody({
            campusId: campusB.id,
            accountId: bankB.id,
            lines: [{ ...line, itemId: itemB.id }],
          }),
          ...change,
        });
    await foreign({ campusId: lekki.id }).expect(404);
    await foreign({ moneyAccountId: bank.id }).expect(404);
    await foreign({ lines: [line] }).expect(404);
    await api(ownerB)
      .post('/store/items')
      .send(shirt({ kind: 'book', variant: null, classLevelId: level }))
      .expect(404);

    const items = (await api(ownerB).get('/store/items').expect(200))
      .body as ItemList;
    expect(items.items.map((item) => item.id)).toEqual([itemB.id]);
    const deliveries = (await api(ownerB).get('/store/deliveries').expect(200))
      .body as DeliveryList;
    expect(deliveries).toEqual({ items: [], total: 0, suppliers: [] });
    await api(ownerB).get(`/store/items?campusId=${lekki.id}`).expect(404);
    await api(ownerB).get(`/store/deliveries?campusId=${lekki.id}`).expect(404);
    await api(ownerB).get(`/store/summary?campusId=${lekki.id}`).expect(404);
    expect((await api(ownerB).get('/store/summary').expect(200)).body).toEqual({
      stockValueMinor: 0,
      lowCount: 1,
      ...NO_SALES,
    });
    expect(await rows(pool, 'stock_delivery')).toBe(1);
  });

  test('a Lekki member cannot see or write the Ikeja store (cases 3 and 4)', async ({
    api,
    app,
    schools: { owner, lekkiOnly, lekki, ikeja },
  }) => {
    const size12 = await createItem(api, owner);
    const bank = await bankAccount(app, owner);
    const ikejaBank = await bankAccount(app, owner, ikeja.id);
    const line = { itemId: size12.id, quantity: 2, unitCostMinor: COST };
    const atIkeja = await receive(api, owner, {
      campusId: ikeja.id,
      accountId: ikejaBank.id,
      lines: [line],
    });
    await receive(api, owner, {
      campusId: lekki.id,
      accountId: bank.id,
      lines: [line],
    });

    await api(lekkiOnly).get(`/store/deliveries/${atIkeja.id}`).expect(404);
    await api(lekkiOnly)
      .get(`/store/deliveries?campusId=${ikeja.id}`)
      .expect(404);
    await api(lekkiOnly).get(`/store/items?campusId=${ikeja.id}`).expect(404);
    await api(lekkiOnly).get(`/store/summary?campusId=${ikeja.id}`).expect(404);
    await api(lekkiOnly)
      .post('/store/deliveries')
      .send(
        deliveryBody({ campusId: ikeja.id, accountId: bank.id, lines: [line] })
      )
      .expect(404);
    await api(lekkiOnly)
      .post('/store/deliveries')
      .send(
        deliveryBody({
          campusId: lekki.id,
          accountId: ikejaBank.id,
          lines: [line],
        })
      )
      .expect(404);

    const list = (await api(lekkiOnly).get('/store/deliveries').expect(200))
      .body as DeliveryList;
    expect(list.items.map((row) => row.campusId)).toEqual([lekki.id]);
    const items = (await api(lekkiOnly).get('/store/items').expect(200))
      .body as ItemList;
    expect(items.items[0]?.stock.map((row) => row.campusId)).toEqual([
      lekki.id,
    ]);
  });

  test('a member with no permission gets 403 and no session gets 401 on every store route (cases 5 and 6)', async ({
    api,
    app,
    schools: { owner, noPermission, lekki },
  }) => {
    const size12 = await createItem(api, owner);
    const bank = await bankAccount(app, owner);
    const delivery = await receive(api, owner, {
      campusId: lekki.id,
      accountId: bank.id,
      lines: [{ itemId: size12.id, quantity: 2, unitCostMinor: COST }],
    });
    const body = deliveryBody({
      campusId: lekki.id,
      accountId: bank.id,
      lines: [{ itemId: size12.id, quantity: 1, unitCostMinor: COST }],
    });

    await api(noPermission).get('/store/summary').expect(403);
    await api(noPermission).get('/store/items').expect(403);
    await api(noPermission).get('/store/deliveries').expect(403);
    await api(noPermission).get(`/store/deliveries/${delivery.id}`).expect(403);
    await api(noPermission).get('/dashboard/store').expect(403);
    await api(noPermission).post('/store/items').send(shirt()).expect(403);
    await api(noPermission)
      .patch(`/store/items/${size12.id}`)
      .send({ name: 'X' })
      .expect(403);
    await api(noPermission).post('/store/deliveries').send(body).expect(403);

    await api().get('/store/summary').expect(401);
    await api().get('/store/items').expect(401);
    await api().get('/store/deliveries').expect(401);
    await api().get(`/store/deliveries/${delivery.id}`).expect(401);
    await api().get('/dashboard/store').expect(401);
    await api().post('/store/items').send(shirt()).expect(401);
    await api()
      .patch(`/store/items/${size12.id}`)
      .send({ name: 'X' })
      .expect(401);
    await api().post('/store/deliveries').send(body).expect(401);
  });

  test('a teacher gets 403 on every store route and a store:read member cannot write', async ({
    api,
    app,
    createUser,
    addMember,
    withPermissions,
    schools: { owner, orgA, lekki },
  }) => {
    const size12 = await createItem(api, owner);
    const bank = await bankAccount(app, owner);
    const delivery = await receive(api, owner, {
      campusId: lekki.id,
      accountId: bank.id,
      lines: [{ itemId: size12.id, quantity: 2, unitCostMinor: COST }],
    });
    const body = deliveryBody({
      campusId: lekki.id,
      accountId: bank.id,
      lines: [{ itemId: size12.id, quantity: 1, unitCostMinor: COST }],
    });
    const teacher = await addMember(orgA, await createUser(), {
      roles: ['teacher'],
      campuses: [lekki],
    });
    const reader = await withPermissions(orgA, ['store:read'], {
      campuses: [lekki],
    });

    await api(teacher).get('/store/summary').expect(403);
    await api(teacher).get('/store/items').expect(403);
    await api(teacher).get('/store/deliveries').expect(403);
    await api(teacher).get(`/store/deliveries/${delivery.id}`).expect(403);
    await api(teacher).get('/dashboard/store').expect(403);
    await api(teacher).post('/store/items').send(shirt()).expect(403);
    await api(teacher)
      .patch(`/store/items/${size12.id}`)
      .send({ name: 'X' })
      .expect(403);
    await api(teacher).post('/store/deliveries').send(body).expect(403);

    await api(reader).get('/store/items').expect(200);
    await api(reader).get('/dashboard/store').expect(200);
    await api(reader)
      .post('/store/items')
      .send(shirt({ name: 'Cap' }))
      .expect(403);
    await api(reader)
      .patch(`/store/items/${size12.id}`)
      .send({ name: 'X' })
      .expect(403);
    await api(reader).post('/store/deliveries').send(body).expect(403);
  });

  test('the database refuses rows that reach across schools (case 7)', async ({
    api,
    app,
    pool,
    createCampus,
    schools: { owner, ownerB, orgA, orgB, lekki, campusB },
  }) => {
    const itemA = await createItem(api, owner);
    const itemB = await createItem(api, ownerB);
    const bankA = await bankAccount(app, owner);
    const bankB = await bankAccount(app, ownerB);
    const deliveryB = await receive(api, ownerB, {
      campusId: campusB.id,
      accountId: bankB.id,
      lines: [{ itemId: itemB.id, quantity: 1, unitCostMinor: COST }],
    });
    const deliveryA = await receive(api, owner, {
      campusId: lekki.id,
      accountId: bankA.id,
      lines: [{ itemId: itemA.id, quantity: 1, unitCostMinor: COST }],
    });
    const storeA = await storeIdOf(pool, lekki.id);
    const storeB = await storeIdOf(pool, campusB.id);
    const entry = await postEntry(app, {
      organizationId: orgA.id,
      reference: 'JE-FOR-FOREIGN-STORE',
      kind: 'adjustment',
      effectiveOn: '2026-10-01',
      postedBy: null,
      lines: [
        {
          ledgerAccountId: await ledgerAccountId(pool, orgA.id, 1200),
          debitMinor: 100,
          creditMinor: 0,
        },
        {
          ledgerAccountId: await ledgerAccountId(pool, orgA.id, 3000),
          debitMinor: 0,
          creditMinor: 100,
        },
      ],
    });
    const refuses = (sql: string, values: unknown[]) =>
      expect(pool.query(sql, values)).rejects.toMatchObject({ code: '23503' });

    for (const [store, item] of [
      [storeB, itemA.id],
      [storeA, itemB.id],
    ]) {
      await refuses(
        `INSERT INTO stock_movement (organization_id, store_id, item_id, quantity, kind, value_minor, reference)
         VALUES ($1, $2, $3, 1, 'receive', 100, 'RAW-1')`,
        [orgA.id, store, item]
      );
    }
    await refuses(
      `INSERT INTO stock_delivery
         (organization_id, number, reference, request_hash, store_id, supplier_name,
          is_opening, received_on, total_minor, journal_entry_id)
       VALUES ($1, 'RAW-OPEN', 'raw-1', 'h', $2, 'X', true, '2026-10-01', 100, $3)`,
      [orgA.id, storeB, entry.entry.id]
    );
    await refuses(
      `INSERT INTO stock_delivery
         (organization_id, number, reference, request_hash, store_id, supplier_name,
          money_account_id, received_on, total_minor, journal_entry_id)
       VALUES ($1, 'RAW-DEL', 'raw-2', 'h', $2, 'X', $3, '2026-10-01', 100, $4)`,
      [orgA.id, storeA, bankB.id, entry.entry.id]
    );
    for (const [delivery, item] of [
      [deliveryB.id, itemA.id],
      [deliveryA.id, itemB.id],
    ]) {
      await refuses(
        `INSERT INTO stock_delivery_line (organization_id, stock_delivery_id, item_id, quantity, unit_cost_minor)
         VALUES ($1, $2, $3, 1, 100)`,
        [orgA.id, delivery, item]
      );
    }
    await refuses(
      `INSERT INTO item_price_change
         (organization_id, item_id, old_cost_minor, new_cost_minor, old_price_minor, new_price_minor)
       VALUES ($1, $2, 1, 2, 3, 4)`,
      [orgA.id, itemB.id]
    );
    const annex = await createCampus(orgB, 'Annex');
    await pool.query('DELETE FROM store WHERE campus_id = $1', [annex.id]);
    await refuses(
      `INSERT INTO store (organization_id, campus_id, name) VALUES ($1, $2, 'Foreign')`,
      [orgA.id, annex.id]
    );
  });

  test('an acting super admin without a reason cannot write to the store (case 12)', async ({
    api,
    app,
    pool,
    makeSuperAdmin,
    createUser,
    schools: { owner, orgA, lekki },
  }) => {
    const size12 = await createItem(api, owner);
    const bank = await bankAccount(app, owner);
    const admin = await makeSuperAdmin(await createUser());
    const body = deliveryBody({
      campusId: lekki.id,
      accountId: bank.id,
      lines: [{ itemId: size12.id, quantity: 1, unitCostMinor: COST }],
    });

    const refused = [
      await api(admin)
        .post('/store/items')
        .set(acting(orgA.id))
        .send(shirt({ name: 'Cap' }))
        .expect(403),
      await api(admin)
        .patch(`/store/items/${size12.id}`)
        .set(acting(orgA.id))
        .send({ name: 'X' })
        .expect(403),
      await api(admin)
        .post('/store/deliveries')
        .set(acting(orgA.id))
        .send(body)
        .expect(403),
    ];

    for (const res of refused) {
      expect(res.body).toMatchObject({ code: 'ActingReadOnly' });
    }
    expect(await rows(pool, 'item')).toBe(1);
    expect(await rows(pool, 'stock_delivery')).toBe(0);
    await api(admin).get('/store/items').set(acting(orgA.id)).expect(200);
  });

  test('a replayed reference is applied once even when sent twice at the same time (case 10)', async ({
    api,
    app,
    pool,
    schools: { owner, lekki },
  }) => {
    const size12 = await createItem(api, owner);
    const bank = await bankAccount(app, owner);
    const body = deliveryBody({
      campusId: lekki.id,
      accountId: bank.id,
      lines: [{ itemId: size12.id, quantity: 5, unitCostMinor: COST }],
    });

    const results = await Promise.all([
      api(owner).post('/store/deliveries').send(body),
      api(owner).post('/store/deliveries').send(body),
    ]);

    expect(results.map((res) => res.status).toSorted((a, b) => a - b)).toEqual([
      200, 201,
    ]);
    expect(await rows(pool, 'stock_delivery')).toBe(1);
    expect(await rows(pool, 'stock_movement')).toBe(1);
    expect(await rows(pool, 'journal_entry')).toBe(1);
    expect(nextDeliveryReference()).not.toBe(body.reference);
  });
});
