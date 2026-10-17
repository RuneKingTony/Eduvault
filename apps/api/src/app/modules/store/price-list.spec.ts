import { storeItem } from './fake-store.repository';
import { buildPriceList } from './price-list';

const jss2 = { id: 'jss2', name: 'JSS 2' };
const jss3 = { id: 'jss3', name: 'JSS 3' };
const methods = { cash: true, transfer: true, pos: false };

const base = {
  levelId: 'jss2',
  levelName: 'JSS 2',
  onHand: new Map<string, number>(),
  methods,
};

describe('buildPriceList', () => {
  it('lists the books for the child’s level only', () => {
    const maths = storeItem({
      kind: 'book',
      name: 'Mathematics',
      variant: null,
      classLevel: jss2,
    });
    const other = storeItem({
      kind: 'book',
      name: 'Biology',
      variant: null,
      classLevel: jss3,
    });
    const list = buildPriceList({
      ...base,
      items: [other, maths],
      onHand: new Map([[maths.id, 4]]),
    });
    expect(list.levelName).toBe('JSS 2');
    expect(list.books).toEqual([
      { name: 'Mathematics', priceMinor: 450_000, inStock: true },
    ]);
  });

  it('marks a book out of stock when the campus store holds none', () => {
    const maths = storeItem({
      kind: 'book',
      name: 'Mathematics',
      variant: null,
      classLevel: jss2,
    });
    const list = buildPriceList({
      ...base,
      items: [maths],
      onHand: new Map([[maths.id, 0]]),
    });
    expect(list.books[0]?.inStock).toBe(false);
  });

  it('lists no books for a child with no level', () => {
    const maths = storeItem({
      kind: 'book',
      name: 'Mathematics',
      variant: null,
      classLevel: jss2,
    });
    expect(
      buildPriceList({
        ...base,
        levelId: null,
        levelName: null,
        items: [maths],
      }).books
    ).toEqual([]);
  });

  it('groups a uniform’s sizes with the price range and any size in stock', () => {
    const small = storeItem({ variant: 'Size 8', sellPriceMinor: 350_000 });
    const large = storeItem({ variant: 'Size 12', sellPriceMinor: 450_000 });
    const mid = storeItem({ variant: 'Size 10', sellPriceMinor: 400_000 });
    const list = buildPriceList({
      ...base,
      items: [large, small, mid],
      onHand: new Map([[mid.id, 2]]),
    });
    expect(list.uniforms).toEqual([
      {
        name: 'School shirt',
        sizes: ['Size 8', 'Size 10', 'Size 12'],
        minPriceMinor: 350_000,
        maxPriceMinor: 450_000,
        inStock: true,
      },
    ]);
  });

  it('shows a one-size uniform with no sizes and out of stock with none held', () => {
    const tie = storeItem({ name: 'Tie', variant: null });
    expect(buildPriceList({ ...base, items: [tie] }).uniforms).toEqual([
      {
        name: 'Tie',
        sizes: [],
        minPriceMinor: 450_000,
        maxPriceMinor: 450_000,
        inStock: false,
      },
    ]);
  });

  it('leaves out retired items', () => {
    const retired = storeItem({
      name: 'Old badge',
      variant: null,
      retiredAt: '2026-09-01T00:00:00.000Z',
    });
    const list = buildPriceList({ ...base, items: [retired] });
    expect(list.uniforms).toEqual([]);
    expect(list.books).toEqual([]);
  });

  it('leaves out an item with no selling price', () => {
    const free = storeItem({
      name: 'Old badge',
      variant: null,
      sellPriceMinor: 0,
    });
    const list = buildPriceList({ ...base, items: [free] });
    expect(list.uniforms).toEqual([]);
  });

  it('names only the switched-on ways to pay, cash first', () => {
    expect(buildPriceList({ ...base, items: [] }).paymentMethods).toEqual([
      'cash',
      'transfer',
    ]);
    expect(
      buildPriceList({
        ...base,
        items: [],
        methods: { cash: true, transfer: true, pos: true },
      }).paymentMethods
    ).toEqual(['cash', 'pos', 'transfer']);
  });
});
