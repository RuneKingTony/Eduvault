import { contract } from './contract';
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
  ITEM_REQUIRED_MESSAGE,
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
  stockState,
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
    ]);
  });
});
