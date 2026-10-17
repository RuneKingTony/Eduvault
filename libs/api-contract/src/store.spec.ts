import { contract } from './contract';
import type { MoneyAccountKind } from './finance';
import {
  BOOK_LEVEL_REQUIRED_MESSAGE,
  BOOK_NO_SIZE_MESSAGE,
  DELIVERY_LINES_MAX,
  DELIVERY_LINES_MAX_MESSAGE,
  DELIVERY_QUANTITY_MAX,
  DELIVERY_QUANTITY_MAX_MESSAGE,
  DELIVERY_REQUIRED_MESSAGE,
  DELIVERY_UNIT_COST_MESSAGE,
  ITEM_PRICE_BELOW_COST_MESSAGE,
  DELIVERY_DUPLICATE_ITEM_MESSAGE,
  ITEM_REQUIRED_MESSAGE,
  STORE_SALE_LINES_MAX_MESSAGE,
  STORE_SALE_QUANTITY_MAX_MESSAGE,
  STORE_SALE_REQUIRED_MESSAGE,
  UNIFORM_NO_LEVEL_MESSAGE,
  UNIT_PRICE_MAX_MESSAGE,
  UNIT_PRICE_MAX_MINOR,
  createItemSchema,
  deliveryReferenceUsedMessage,
  itemDisplayName,
  itemDuplicateMessage,
  itemListQuerySchema,
  openingStockRecordedMessage,
  recordDeliverySchema,
  booksForLevel,
  fittingSaleAccounts,
  isSellable,
  recordSaleSchema,
  saleAccountKinds,
  saleListQuerySchema,
  stockState,
  storeSaleNoAccountMessage,
  storeSaleReference,
  storeSaleReplayedMessage,
  storeSaleStockShortMessage,
  storeSummarySchema,
  updateItemSchema,
} from './store';

const id = '0b0c8a8e-8a3e-4c6c-a8c4-0e2f0f6b1f11';
const other = '6f1d2a7c-3b0e-4e53-9c55-0d6a3f5f2b10';

const uniform = {
  kind: 'uniform',
  name: 'School shirt',
  variant: 'Size 12',
  costPriceMinor: 350_000,
  sellPriceMinor: 450_000,
};

const book = {
  kind: 'book',
  name: 'Mathematics',
  classLevelId: id,
  costPriceMinor: 200_000,
  sellPriceMinor: 250_000,
};

const messages = (result: { error?: { issues: { message: string }[] } }) =>
  result.error?.issues.map((issue) => issue.message);

describe('itemDisplayName', () => {
  it('adds the size after the name', () => {
    expect(itemDisplayName({ name: 'School shirt', variant: 'Size 12' })).toBe(
      'School shirt, Size 12'
    );
  });

  it('is the name alone without a size', () => {
    expect(itemDisplayName({ name: 'Tie', variant: null })).toBe('Tie');
    expect(itemDisplayName({ name: 'Mathematics', variant: null })).toBe(
      'Mathematics'
    );
  });
});

describe('stockState', () => {
  it('is out when nothing is on hand on any campus, or there are no campuses', () => {
    expect(stockState([{ onHand: 0 }, { onHand: 0 }], 5)).toBe('out');
    expect(stockState([], 5)).toBe('out');
    expect(stockState([{ onHand: 0 }], 0)).toBe('out');
  });

  it('is low at or below the level on any campus', () => {
    expect(stockState([{ onHand: 5 }], 5)).toBe('low');
    expect(stockState([{ onHand: 3 }], 5)).toBe('low');
    expect(stockState([{ onHand: 40 }, { onHand: 5 }], 5)).toBe('low');
    expect(stockState([{ onHand: 40 }, { onHand: 0 }], 5)).toBe('low');
  });

  it('is in when every campus is above the level', () => {
    expect(stockState([{ onHand: 6 }], 5)).toBe('in');
    expect(stockState([{ onHand: 6 }, { onHand: 20 }], 5)).toBe('in');
    expect(stockState([{ onHand: 1 }], 0)).toBe('in');
  });
});

describe('createItemSchema', () => {
  it('trims the name, defaults the low level to 5 and drops a blank size', () => {
    expect(
      createItemSchema.parse({ ...uniform, name: '  School shirt ' })
    ).toEqual({
      ...uniform,
      classLevelId: null,
      lowStockLevel: 5,
    });
    expect(createItemSchema.parse({ ...uniform, variant: '  ' }).variant).toBe(
      null
    );
  });

  it('takes a book with a level and no size', () => {
    expect(createItemSchema.parse(book)).toEqual({
      ...book,
      variant: null,
      lowStockLevel: 5,
    });
  });

  it('refuses a book without a level', () => {
    const result = createItemSchema.safeParse({ ...book, classLevelId: null });
    expect(messages(result)).toEqual([BOOK_LEVEL_REQUIRED_MESSAGE]);
    expect(
      messages(createItemSchema.safeParse({ ...book, classLevelId: undefined }))
    ).toEqual([BOOK_LEVEL_REQUIRED_MESSAGE]);
  });

  it('refuses a uniform with a level', () => {
    expect(
      messages(createItemSchema.safeParse({ ...uniform, classLevelId: id }))
    ).toEqual([UNIFORM_NO_LEVEL_MESSAGE]);
  });

  it('refuses a size on a book', () => {
    expect(
      messages(createItemSchema.safeParse({ ...book, variant: 'Size 12' }))
    ).toEqual([BOOK_NO_SIZE_MESSAGE]);
  });

  it('refuses a selling price below cost', () => {
    expect(
      messages(
        createItemSchema.safeParse({
          ...uniform,
          costPriceMinor: 500_000,
          sellPriceMinor: 450_000,
        })
      )
    ).toEqual([ITEM_PRICE_BELOW_COST_MESSAGE]);
  });

  it('accepts a selling price equal to cost and a zero cost price', () => {
    expect(
      createItemSchema.safeParse({
        ...uniform,
        costPriceMinor: 450_000,
        sellPriceMinor: 450_000,
      }).success
    ).toBe(true);
    expect(
      createItemSchema.safeParse({ ...uniform, costPriceMinor: 0 }).success
    ).toBe(true);
  });

  it('words a missing name or price with the screen copy', () => {
    expect(
      messages(createItemSchema.safeParse({ ...uniform, name: '   ' }))
    ).toEqual([ITEM_REQUIRED_MESSAGE]);
    expect(
      messages(
        createItemSchema.safeParse({ ...uniform, sellPriceMinor: undefined })
      )
    ).toEqual([ITEM_REQUIRED_MESSAGE]);
    expect(
      messages(
        createItemSchema.safeParse({ ...uniform, costPriceMinor: undefined })
      )
    ).toEqual([ITEM_REQUIRED_MESSAGE]);
    expect(
      messages(createItemSchema.safeParse({ ...uniform, sellPriceMinor: 0 }))
    ).toContain(ITEM_REQUIRED_MESSAGE);
  });

  it('refuses a negative cost price and a fractional price', () => {
    expect(
      createItemSchema.safeParse({ ...uniform, costPriceMinor: -1 }).success
    ).toBe(false);
    expect(
      createItemSchema.safeParse({ ...uniform, sellPriceMinor: 10.5 }).success
    ).toBe(false);
  });

  it('refuses an unknown kind', () => {
    expect(
      createItemSchema.safeParse({ ...uniform, kind: 'toy' }).success
    ).toBe(false);
  });
});

describe('updateItemSchema', () => {
  it('takes any subset of the editable fields', () => {
    expect(updateItemSchema.parse({})).toEqual({});
    expect(
      updateItemSchema.parse({ name: ' Shirt ', lowStockLevel: 0 })
    ).toEqual({ name: 'Shirt', lowStockLevel: 0 });
    expect(updateItemSchema.parse({ variant: '' })).toEqual({ variant: null });
  });

  it('has no kind or level, so a patch cannot change them', () => {
    expect(
      updateItemSchema.parse({ kind: 'book', classLevelId: id, name: 'A' })
    ).toEqual({ name: 'A' });
  });

  it('refuses a selling price below the cost sent with it', () => {
    expect(
      messages(
        updateItemSchema.safeParse({
          costPriceMinor: 500,
          sellPriceMinor: 400,
        })
      )
    ).toEqual([ITEM_PRICE_BELOW_COST_MESSAGE]);
    expect(
      updateItemSchema.safeParse({ costPriceMinor: 0, sellPriceMinor: 400 })
        .success
    ).toBe(true);
  });

  it('retires only with true', () => {
    expect(updateItemSchema.parse({ retired: true })).toEqual({
      retired: true,
    });
    expect(updateItemSchema.safeParse({ retired: false }).success).toBe(false);
  });
});

describe('itemListQuerySchema', () => {
  it('defaults the flags, the page and the page size', () => {
    expect(itemListQuerySchema.parse({})).toEqual({
      lowOnly: false,
      includeRetired: false,
      page: 1,
      pageSize: 10,
    });
  });

  it('reads the flags from query strings and booleans', () => {
    expect(
      itemListQuerySchema.parse({
        lowOnly: 'true',
        includeRetired: true,
        page: '2',
        kind: 'book',
        q: ' sh ',
      })
    ).toEqual({
      lowOnly: true,
      includeRetired: true,
      page: 2,
      pageSize: 10,
      kind: 'book',
      q: 'sh',
    });
  });
});

describe('recordDeliverySchema', () => {
  const delivery = {
    reference: 'DEL-REQ-20261017-1a2b3c4d',
    campusId: id,
    supplierName: 'Adebayo Uniforms Ltd',
    moneyAccountId: other,
    lines: [{ itemId: id, quantity: 10, unitCostMinor: 350_000 }],
  };

  it('trims text and keeps the optional fields optional', () => {
    expect(
      recordDeliverySchema.parse({
        ...delivery,
        reference: ' DEL-REQ-1 ',
        supplierName: '  Adebayo ',
      })
    ).toMatchObject({ reference: 'DEL-REQ-1', supplierName: 'Adebayo' });
    expect(recordDeliverySchema.safeParse(delivery).success).toBe(true);
  });

  it('refuses an empty lines array', () => {
    expect(
      messages(recordDeliverySchema.safeParse({ ...delivery, lines: [] }))
    ).toEqual([DELIVERY_REQUIRED_MESSAGE]);
  });

  it('refuses a line with no quantity or no unit cost', () => {
    expect(
      messages(
        recordDeliverySchema.safeParse({
          ...delivery,
          lines: [{ itemId: id, quantity: 0, unitCostMinor: 100 }],
        })
      )
    ).toEqual([DELIVERY_REQUIRED_MESSAGE]);
    expect(
      messages(
        recordDeliverySchema.safeParse({
          ...delivery,
          lines: [{ itemId: id, quantity: 1 }],
        })
      )
    ).toEqual([DELIVERY_UNIT_COST_MESSAGE]);
  });

  it('caps a line quantity, a unit cost and the number of lines', () => {
    const line = { itemId: id, quantity: 1, unitCostMinor: 100 };
    expect(
      messages(
        recordDeliverySchema.safeParse({
          ...delivery,
          lines: [{ ...line, quantity: DELIVERY_QUANTITY_MAX + 1 }],
        })
      )
    ).toEqual([DELIVERY_QUANTITY_MAX_MESSAGE]);
    expect(
      messages(
        recordDeliverySchema.safeParse({
          ...delivery,
          lines: [{ ...line, unitCostMinor: UNIT_PRICE_MAX_MINOR + 1 }],
        })
      )
    ).toEqual([UNIT_PRICE_MAX_MESSAGE]);
    expect(
      messages(
        recordDeliverySchema.safeParse({
          ...delivery,
          lines: Array.from({ length: DELIVERY_LINES_MAX + 1 }, () => line),
        })
      )
    ).toEqual([DELIVERY_LINES_MAX_MESSAGE]);
    expect(
      recordDeliverySchema.safeParse({
        ...delivery,
        lines: [
          {
            ...line,
            quantity: DELIVERY_QUANTITY_MAX,
            unitCostMinor: UNIT_PRICE_MAX_MINOR,
          },
        ],
      }).success
    ).toBe(true);
  });

  it('refuses a blank supplier and a blank reference', () => {
    expect(
      messages(
        recordDeliverySchema.safeParse({ ...delivery, supplierName: '' })
      )
    ).toEqual([DELIVERY_REQUIRED_MESSAGE]);
    expect(
      recordDeliverySchema.safeParse({ ...delivery, reference: ' ' }).success
    ).toBe(false);
  });
});

describe('store copy', () => {
  it('words the duplicate, opening and reference conflicts', () => {
    expect(itemDuplicateMessage('School shirt, Size 12')).toBe(
      'School shirt, Size 12 is already in the store.'
    );
    expect(openingStockRecordedMessage('Lekki')).toBe(
      'Opening stock is already recorded for Lekki.'
    );
    expect(deliveryReferenceUsedMessage('REQ-1', 'DEL-2026-0001')).toBe(
      'Reference REQ-1 is already used by DEL-2026-0001.'
    );
  });
});

describe('contract.store', () => {
  it('serves every store route under /store', () => {
    expect(Object.values(contract.store).map((route) => route.path)).toEqual([
      '/store/summary',
      '/store/items',
      '/store/items',
      '/store/items/:id',
      '/store/deliveries',
      '/store/deliveries/:id',
      '/store/deliveries',
      '/store/sales',
      '/store/sales/options',
      '/store/sales/:id',
      '/store/sales',
    ]);
  });
});

describe('storeSaleReference', () => {
  it('is STORE, the compact date and the first 8 characters of the UUID', () => {
    expect(
      storeSaleReference('2026-10-07', '1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed')
    ).toBe('STORE-20261007-1B9D6BCD');
  });
});

describe('saleAccountKinds', () => {
  it('maps POS to pos, transfer to bank and cash to cash then bank', () => {
    expect(saleAccountKinds('pos')).toEqual(['pos']);
    expect(saleAccountKinds('transfer')).toEqual(['bank']);
    expect(saleAccountKinds('cash')).toEqual(['cash', 'bank']);
  });
});

describe('store sale copy', () => {
  it('words the stock shortage, the missing account and the replay', () => {
    expect(
      storeSaleStockShortMessage(3, 'School shirt, Size 12', 'Lekki')
    ).toBe('Only 3 of School shirt, Size 12 left at Lekki.');
    expect(storeSaleNoAccountMessage('pos', 'Ikeja')).toBe(
      'No money account takes POS payments on Ikeja campus.'
    );
    expect(storeSaleNoAccountMessage('transfer', 'Ikeja')).toBe(
      'No money account takes bank transfer payments on Ikeja campus.'
    );
    expect(storeSaleReplayedMessage('STORE-1', 'RCT-2026-0001')).toBe(
      'Reference STORE-1 was already recorded as RCT-2026-0001. Nothing was posted twice.'
    );
  });
});

describe('recordSaleSchema', () => {
  const sale = {
    reference: 'STORE-20261007-1B9D6BCD',
    studentId: id,
    method: 'cash',
    lines: [{ itemId: id, quantity: 2 }],
  };

  it('takes a student, a method and lines', () => {
    expect(recordSaleSchema.safeParse(sale).success).toBe(true);
  });

  it('refuses a sale with no lines', () => {
    expect(
      messages(recordSaleSchema.safeParse({ ...sale, lines: [] }))
    ).toEqual([STORE_SALE_REQUIRED_MESSAGE]);
  });

  it('refuses a zero quantity and one above the cap', () => {
    expect(
      messages(
        recordSaleSchema.safeParse({
          ...sale,
          lines: [{ itemId: id, quantity: 0 }],
        })
      )
    ).toEqual([STORE_SALE_REQUIRED_MESSAGE]);
    expect(
      messages(
        recordSaleSchema.safeParse({
          ...sale,
          lines: [{ itemId: id, quantity: DELIVERY_QUANTITY_MAX + 1 }],
        })
      )
    ).toEqual([STORE_SALE_QUANTITY_MAX_MESSAGE]);
  });

  it('refuses an item listed twice', () => {
    expect(
      messages(
        recordSaleSchema.safeParse({
          ...sale,
          lines: [
            { itemId: id, quantity: 1 },
            { itemId: id, quantity: 2 },
          ],
        })
      )
    ).toEqual([DELIVERY_DUPLICATE_ITEM_MESSAGE]);
  });

  it('refuses more lines than a purchase may hold', () => {
    const lines = Array.from({ length: DELIVERY_LINES_MAX + 1 }, () => ({
      itemId: id,
      quantity: 1,
    }));
    expect(messages(recordSaleSchema.safeParse({ ...sale, lines }))).toContain(
      STORE_SALE_LINES_MAX_MESSAGE
    );
  });

  it('refuses an unknown method and a blank reference', () => {
    expect(
      recordSaleSchema.safeParse({ ...sale, method: 'cheque' }).success
    ).toBe(false);
    expect(
      recordSaleSchema.safeParse({ ...sale, reference: ' ' }).success
    ).toBe(false);
  });
});

describe('saleListQuerySchema', () => {
  it('defaults to page 1 and coerces the string', () => {
    expect(saleListQuerySchema.parse({})).toEqual({ page: 1 });
    expect(saleListQuerySchema.parse({ page: '3', studentId: id })).toEqual({
      page: 3,
      studentId: id,
    });
  });
});

describe('storeSummarySchema', () => {
  it('carries the term figures beside the stock figures', () => {
    const summary = {
      stockValueMinor: 100,
      lowCount: 1,
      termSalesMinor: 650_000,
      termCostMinor: 500_000,
      termSalesCount: 2,
      termItemsSold: 4,
      termStudentsServed: 2,
    };
    expect(storeSummarySchema.parse(summary)).toEqual(summary);
    expect(
      storeSummarySchema.safeParse({ stockValueMinor: 1, lowCount: 0 }).success
    ).toBe(false);
  });
});

interface TestAccount {
  id: string;
  name: string;
  kind: MoneyAccountKind;
  campusId: string | null;
  ledgerAccountId: string;
  retired: boolean;
}

const account = (overrides: Partial<TestAccount> = {}): TestAccount => ({
  id: 'account',
  name: 'Account',
  kind: 'pos',
  campusId: null,
  ledgerAccountId: 'ledger',
  retired: false,
  ...overrides,
});

describe('fittingSaleAccounts', () => {
  it('finds the one POS account', () => {
    const pos = account({ id: 'pos', kind: 'pos' });
    const bank = account({ id: 'bank', kind: 'bank' });
    expect(fittingSaleAccounts('pos', 'lekki', [bank, pos])).toEqual([pos]);
  });

  it('takes a transfer into a bank account only', () => {
    const bank = account({ id: 'bank', kind: 'bank' });
    const cash = account({ id: 'cash', kind: 'cash' });
    expect(fittingSaleAccounts('transfer', 'lekki', [cash, bank])).toEqual([
      bank,
    ]);
  });

  it('lists several fits in the order they were given', () => {
    const first = account({ id: 'first', kind: 'pos' });
    const second = account({ id: 'second', kind: 'pos', campusId: 'lekki' });
    expect(fittingSaleAccounts('pos', 'lekki', [first, second])).toEqual([
      first,
      second,
    ]);
  });

  it('accepts a school-wide account and one on the student’s campus', () => {
    const wide = account({ id: 'wide', kind: 'pos', campusId: null });
    const local = account({ id: 'local', kind: 'pos', campusId: 'lekki' });
    expect(fittingSaleAccounts('pos', 'lekki', [wide, local])).toHaveLength(2);
  });

  it('refuses an account on another campus', () => {
    const elsewhere = account({ kind: 'pos', campusId: 'ikeja' });
    expect(fittingSaleAccounts('pos', 'lekki', [elsewhere])).toEqual([]);
  });

  it('refuses a retired account and a gateway', () => {
    const retired = account({ id: 'retired', kind: 'pos', retired: true });
    const gateway = account({ id: 'gateway', kind: 'gateway' });
    expect(fittingSaleAccounts('pos', 'lekki', [retired, gateway])).toEqual([]);
    expect(fittingSaleAccounts('cash', 'lekki', [gateway])).toEqual([]);
  });

  it('is empty when no account fits', () => {
    expect(fittingSaleAccounts('cash', 'lekki', [])).toEqual([]);
  });

  it('lists cash before bank for a cash sale', () => {
    const bank = account({ id: 'bank', kind: 'bank' });
    const cash = account({ id: 'cash', kind: 'cash' });
    expect(fittingSaleAccounts('cash', 'lekki', [bank, cash])).toEqual([
      cash,
      bank,
    ]);
  });
});

describe('isSellable and booksForLevel', () => {
  const item = {
    retiredAt: null,
    sellPriceMinor: 100,
    kind: 'book' as const,
    classLevel: { id: 'jss1' },
  };

  it('sells an unretired item with a price', () => {
    expect(isSellable(item)).toBe(true);
    expect(isSellable({ ...item, sellPriceMinor: 0 })).toBe(false);
    expect(isSellable({ ...item, retiredAt: '2026-09-01T00:00:00.000Z' })).toBe(
      false
    );
  });

  it('keeps only the books of the level, and none without a level', () => {
    const elsewhere = { ...item, classLevel: { id: 'jss2' } };
    const shirt = { ...item, kind: 'uniform' as const, classLevel: null };
    expect(booksForLevel([item, elsewhere, shirt], 'jss1')).toEqual([item]);
    expect(booksForLevel([item], null)).toEqual([]);
  });
});
