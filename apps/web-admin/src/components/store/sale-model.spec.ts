import { STORE_SALE_REQUIRED_MESSAGE, type Item } from '@eduvault/api-contract';
import {
  NO_METHOD_MESSAGE,
  effectiveAccount,
  initialSale,
  intoFor,
  owesLabel,
  saleLines,
  saleMethods,
  saleRequest,
  saleSections,
  saleTotalMinor,
  stockOn,
  studentLabel,
  validateSale,
  withAccount,
  withMethod,
  withQuantity,
  withStudent,
  type SaleAccountOption,
  type SaleStudent,
} from './sale-model';

const ALL = { cash: true, transfer: true, pos: true };

const ada: SaleStudent = {
  id: 'ada',
  name: 'Ada Okeke',
  admissionNumber: 'GF-0123',
  className: 'JSS 2 Gold',
  levelId: 'jss2',
  levelName: 'JSS 2',
  campusId: 'lekki',
  campusName: 'Lekki',
  balanceMinor: 0,
};

const account = (
  over: Partial<SaleAccountOption> & Pick<SaleAccountOption, 'id' | 'kind'>
): SaleAccountOption => ({
  name: over.id,
  campusId: null,
  ...over,
});

const item = (over: Partial<Item> & Pick<Item, 'id' | 'kind'>): Item => ({
  name: over.id,
  variant: null,
  displayName: over.id,
  classLevel: null,
  costPriceMinor: 100_000,
  sellPriceMinor: 200_000,
  lowStockLevel: 5,
  retiredAt: null,
  stock: [],
  state: 'in',
  ...over,
});

const onShelf = (campusId: string, onHand: number): Item['stock'] => [
  { campusId, onHand, valueMinor: onHand * 100_000, averageCostMinor: 100_000 },
];

describe('the sale reference', () => {
  it('stays the same through every change made while the purchase is being filled in or retried', () => {
    const state = withStudent(initialSale('STORE-1', ALL), 'ada');
    expect(withMethod(state, 'pos').reference).toBe('STORE-1');
    expect(withAccount(state, 'acct').reference).toBe('STORE-1');
    expect(
      withQuantity(state, { itemId: 'a', text: '2', onHand: 5 }).reference
    ).toBe('STORE-1');
    expect(withStudent(state, 'tobi').reference).toBe('STORE-1');
  });
});

describe('saleMethods', () => {
  it('lists the switched-on methods as Cash, POS, Bank transfer', () => {
    expect(saleMethods(ALL)).toEqual(['cash', 'pos', 'transfer']);
    expect(saleMethods({ cash: true, transfer: true, pos: false })).toEqual([
      'cash',
      'transfer',
    ]);
  });

  it('starts on the first switched-on method, or none', () => {
    expect(initialSale('r', ALL).method).toBe('cash');
    expect(
      initialSale('r', { cash: false, transfer: true, pos: true }).method
    ).toBe('pos');
    expect(
      initialSale('r', { cash: false, transfer: false, pos: false }).method
    ).toBe('');
  });
});

describe('withQuantity', () => {
  const base = initialSale('r', ALL);

  it('caps what is typed at the stock on hand', () => {
    expect(
      withQuantity(base, { itemId: 'a', text: '9', onHand: 3 }).quantities
    ).toEqual({ a: '3' });
  });

  it('keeps digits only and lets the field empty', () => {
    expect(
      withQuantity(base, { itemId: 'a', text: '2x', onHand: 5 }).quantities['a']
    ).toBe('2');
    expect(
      withQuantity(base, { itemId: 'a', text: '', onHand: 5 }).quantities['a']
    ).toBe('');
  });

  it('allows nothing when the shelf is empty', () => {
    expect(
      withQuantity(base, { itemId: 'a', text: '4', onHand: 0 }).quantities['a']
    ).toBe('0');
  });

  it('clears the lines and the chosen account when another student is picked', () => {
    const state = withAccount(
      withQuantity(withStudent(base, 'ada'), {
        itemId: 'a',
        text: '2',
        onHand: 5,
      }),
      'acct'
    );
    expect(withStudent(state, 'tobi')).toMatchObject({
      studentId: 'tobi',
      accountId: '',
      quantities: {},
    });
  });
});

describe('saleSections', () => {
  const books = item({
    id: 'maths',
    kind: 'book',
    classLevel: { id: 'jss2', name: 'JSS 2' },
    stock: onShelf('lekki', 4),
  });
  const otherLevel = item({
    id: 'bio',
    kind: 'book',
    classLevel: { id: 'jss3', name: 'JSS 3' },
  });
  const shirt = item({
    id: 'shirt',
    kind: 'uniform',
    stock: onShelf('lekki', 2),
  });

  it('puts the student’s level books before the uniforms, with stock from their campus', () => {
    const sections = saleSections([shirt, otherLevel, books], ada);
    expect(sections.map((section) => section.title)).toEqual([
      'Books for JSS 2',
      'Uniforms',
    ]);
    expect(sections[0]?.rows).toEqual([{ item: books, onHand: 4 }]);
    expect(sections[1]?.rows).toEqual([{ item: shirt, onHand: 2 }]);
  });

  it('omits a section with nothing in it and leaves out retired items', () => {
    const retired = item({
      id: 'old',
      kind: 'uniform',
      retiredAt: '2026-09-01T00:00:00.000Z',
    });
    expect(
      saleSections([retired, books], ada).map((section) => section.title)
    ).toEqual(['Books for JSS 2']);
    expect(saleSections([retired], ada)).toEqual([]);
  });

  it('leaves out an item with no selling price', () => {
    expect(saleSections([{ ...shirt, sellPriceMinor: 0 }], ada)).toEqual([]);
  });

  it('shows no books to a student with no level', () => {
    const unplaced = { ...ada, levelId: null, levelName: null };
    expect(
      saleSections([books, shirt], unplaced).map((section) => section.title)
    ).toEqual(['Uniforms']);
  });

  it('counts nothing on a campus the item has no stock row for', () => {
    expect(stockOn(shirt, 'ikeja')).toBe(0);
  });
});

describe('intoFor', () => {
  const pos = account({ id: 'pos', kind: 'pos' });
  const bank = account({ id: 'bank', kind: 'bank' });
  const cash = account({ id: 'cash', kind: 'cash', campusId: 'lekki' });

  it('has nothing to say before a student and a method are chosen', () => {
    expect(intoFor('cash', undefined, [cash])).toBeUndefined();
    expect(intoFor('', ada, [cash])).toBeUndefined();
  });

  it('chooses the only fit itself', () => {
    expect(intoFor('pos', ada, [pos, bank, cash])).toEqual({
      status: 'chosen',
      account: pos,
    });
    expect(intoFor('transfer', ada, [pos, bank, cash])).toEqual({
      status: 'chosen',
      account: bank,
    });
  });

  it('says choose when several accounts fit and none when no account fits', () => {
    const elsewhere = account({ id: 'x', kind: 'pos', campusId: 'ikeja' });
    expect(intoFor('cash', ada, [bank, cash])?.status).toBe('choose');
    expect(intoFor('pos', ada, [elsewhere])?.status).toBe('none');
  });

  it('defaults the select to the first fit and keeps a picked one', () => {
    const into = intoFor('cash', ada, [bank, cash]);
    expect(effectiveAccount({ accountId: '' }, into)).toBe(cash);
    expect(effectiveAccount({ accountId: 'bank' }, into)).toBe(bank);
    expect(effectiveAccount({ accountId: 'gone' }, into)).toBe(cash);
    expect(
      effectiveAccount({ accountId: '' }, { status: 'none' })
    ).toBeUndefined();
    expect(effectiveAccount({ accountId: '' }, undefined)).toBeUndefined();
  });
});

describe('lines, total and request', () => {
  const state = {
    ...withStudent(initialSale('STORE-1', ALL), 'ada'),
    quantities: { a: '2', b: '', c: '0', d: '1' },
  };

  it('keeps only the items with a quantity', () => {
    expect(saleLines(state)).toEqual([
      { itemId: 'a', quantity: 2 },
      { itemId: 'd', quantity: 1 },
    ]);
  });

  it('totals at the selling price', () => {
    expect(
      saleTotalMinor(state, [
        { id: 'a', sellPriceMinor: 450_000 },
        { id: 'd', sellPriceMinor: 150_000 },
      ])
    ).toBe(1_050_000);
  });

  it('builds the request with the account and proof only when there are some', () => {
    expect(
      saleRequest(state, { accountId: 'acct', proofFileId: 'proof' })
    ).toEqual({
      reference: 'STORE-1',
      studentId: 'ada',
      method: 'cash',
      moneyAccountId: 'acct',
      proofFileId: 'proof',
      lines: [
        { itemId: 'a', quantity: 2 },
        { itemId: 'd', quantity: 1 },
      ],
    });
    expect(
      saleRequest(state, { accountId: undefined, proofFileId: undefined })
    ).not.toHaveProperty('proofFileId');
  });
});

const filled = (method: 'cash' | 'pos' | 'transfer' | '') => ({
  ...withStudent(initialSale('r', ALL), 'ada'),
  method,
  quantities: { a: '1' },
});

describe('validateSale', () => {
  const into = {
    status: 'chosen',
    account: account({ id: 'a', kind: 'cash' }),
  } as const;

  it('asks for a student and an item first', () => {
    expect(
      validateSale(filled('cash'), {
        student: undefined,
        into,
        hasProof: false,
      })
    ).toBe(STORE_SALE_REQUIRED_MESSAGE);
    expect(
      validateSale(
        { ...filled('cash'), quantities: {} },
        { student: ada, into, hasProof: false }
      )
    ).toBe(STORE_SALE_REQUIRED_MESSAGE);
  });

  it('asks how the student paid', () => {
    expect(
      validateSale(filled(''), { student: ada, into, hasProof: false })
    ).toBe(NO_METHOD_MESSAGE);
  });

  it('asks for the POS slip and the transfer receipt by name', () => {
    expect(
      validateSale(filled('pos'), { student: ada, into, hasProof: false })
    ).toBe('Upload the POS slip before recording.');
    expect(
      validateSale(filled('transfer'), { student: ada, into, hasProof: false })
    ).toBe('Upload the transfer receipt before recording.');
    expect(
      validateSale(filled('pos'), { student: ada, into, hasProof: true })
    ).toBeUndefined();
  });

  it('refuses when no account fits, naming the campus', () => {
    expect(
      validateSale(filled('cash'), {
        student: ada,
        into: { status: 'none' },
        hasProof: false,
      })
    ).toBe('No money account takes cash payments on Lekki campus.');
  });

  it('passes a complete cash purchase', () => {
    expect(
      validateSale(filled('cash'), { student: ada, into, hasProof: false })
    ).toBeUndefined();
  });
});

describe('labels', () => {
  it('words the student and the balance pill', () => {
    expect(studentLabel(ada)).toBe('Ada Okeke · GF-0123');
    expect(owesLabel(1_250_000)).toBe('₦12,500 owing');
    expect(owesLabel(-300_000)).toBe('₦3,000 extra paid');
    expect(owesLabel(0)).toBe('Paid up');
  });
});
