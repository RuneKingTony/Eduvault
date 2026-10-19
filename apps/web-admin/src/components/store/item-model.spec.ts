import {
  BOOK_LEVEL_REQUIRED_MESSAGE,
  ITEM_PRICE_BELOW_COST_MESSAGE,
  ITEM_REQUIRED_MESSAGE,
  type Item,
} from '@eduvault/api-contract';
import {
  emptyItemForm,
  itemChanges,
  itemFormOf,
  newItemRequest,
  withKind,
} from './item-model';

const LEVEL_9 = '00000000-0000-4000-8000-0000000a0009';
const LEVEL = '00000000-0000-4000-8000-0000000a0001';

const shirt: Item = {
  id: 'i1',
  kind: 'uniform',
  name: 'School shirt',
  variant: 'Size 10',
  displayName: 'School shirt, Size 10',
  classLevel: null,
  costPriceMinor: 350_000,
  sellPriceMinor: 450_000,
  lowStockLevel: 5,
  retiredAt: null,
  stock: [],
  state: 'out',
};

const filled = () => ({
  ...emptyItemForm(LEVEL),
  name: 'School shirt',
  size: ' Size 10 ',
  cost: '3,500',
  price: '4,500',
});

describe('newItemRequest', () => {
  it('turns a uniform into minor units with the default low level', () => {
    expect(newItemRequest(filled()).body).toEqual({
      kind: 'uniform',
      name: 'School shirt',
      variant: 'Size 10',
      classLevelId: null,
      costPriceMinor: 350_000,
      sellPriceMinor: 450_000,
      lowStockLevel: 5,
    });
  });

  it('turns a book into its class level with no size', () => {
    const state = withKind({ ...filled(), size: 'x' }, 'book', LEVEL);
    expect(newItemRequest(state).body).toMatchObject({
      kind: 'book',
      variant: null,
      classLevelId: LEVEL,
    });
  });

  it('asks for a name and both prices', () => {
    expect(newItemRequest({ ...filled(), name: ' ' }).error).toBe(
      ITEM_REQUIRED_MESSAGE
    );
    expect(newItemRequest({ ...filled(), cost: '' }).error).toBe(
      ITEM_REQUIRED_MESSAGE
    );
    expect(newItemRequest({ ...filled(), price: 'abc' }).error).toBe(
      ITEM_REQUIRED_MESSAGE
    );
  });

  it('refuses a selling price below the cost price', () => {
    expect(newItemRequest({ ...filled(), price: '3,000' }).error).toBe(
      ITEM_PRICE_BELOW_COST_MESSAGE
    );
  });

  it('accepts a cost of zero', () => {
    expect(newItemRequest({ ...filled(), cost: '0' }).body).toMatchObject({
      costPriceMinor: 0,
    });
  });

  it('refuses a book with no level', () => {
    const state = withKind({ ...filled(), classLevelId: '' }, 'book', '');
    expect(newItemRequest(state).error).toBe(BOOK_LEVEL_REQUIRED_MESSAGE);
  });

  it('keeps a uniform out of a class level', () => {
    const state = { ...filled(), classLevelId: LEVEL };
    expect(newItemRequest(state).body?.classLevelId).toBeNull();
  });
});

describe('withKind', () => {
  it('offers the first level to a book and clears the size', () => {
    expect(
      withKind({ ...filled(), classLevelId: '' }, 'book', LEVEL_9)
    ).toMatchObject({
      kind: 'book',
      size: '',
      classLevelId: LEVEL_9,
    });
  });

  it('drops the level when switching back to a uniform', () => {
    expect(
      withKind(
        { ...filled(), kind: 'book', classLevelId: LEVEL_9 },
        'uniform',
        LEVEL
      )
    ).toMatchObject({ kind: 'uniform', classLevelId: '' });
  });
});

describe('itemChanges', () => {
  it('sends nothing for an untouched form', () => {
    expect(itemChanges(shirt, itemFormOf(shirt)).body).toEqual({});
  });

  it('sends only what changed', () => {
    const state = { ...itemFormOf(shirt), price: '5,000', lowAt: '8' };
    expect(itemChanges(shirt, state).body).toEqual({
      sellPriceMinor: 500_000,
      lowStockLevel: 8,
    });
  });

  it('refuses a selling price below the cost price', () => {
    const state = { ...itemFormOf(shirt), cost: '5,000', price: '4,000' };
    expect(itemChanges(shirt, state).error).toBe(ITEM_PRICE_BELOW_COST_MESSAGE);
  });

  it('asks for a name', () => {
    expect(itemChanges(shirt, { ...itemFormOf(shirt), name: '' }).error).toBe(
      ITEM_REQUIRED_MESSAGE
    );
  });

  it('leaves a book’s size alone', () => {
    const book: Item = {
      ...shirt,
      kind: 'book',
      variant: null,
      classLevel: { id: LEVEL, name: 'JSS 1' },
    };
    expect(itemChanges(book, { ...itemFormOf(book), size: 'x' }).body).toEqual(
      {}
    );
  });
});
