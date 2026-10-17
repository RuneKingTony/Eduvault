import {
  STOCK_COUNT_NEGATIVE_MESSAGE,
  STOCK_COUNT_REQUIRED_MESSAGE,
} from '@eduvault/api-contract';
import { IKEJA, LEKKI } from '../../test-members';
import { SHIRT_ID, TIE_ID, shirt, tie } from '../../test-store';
import {
  countRequest,
  expectedAt,
  initialCount,
  validateCount,
  withCampus,
  withCounted,
} from './stock-count-model';

const items = [shirt(), tie()];

describe('stock count model', () => {
  it('reads expected stock from the chosen campus', () => {
    expect(expectedAt(shirt(), LEKKI.id)).toBe(12);
    expect(expectedAt(shirt(), IKEJA.id)).toBe(0);
    expect(expectedAt({ stock: [] }, LEKKI.id)).toBe(0);
  });

  it('prefills every counted figure with the expected one, and again on a new campus', () => {
    const state = initialCount(LEKKI.id, items);
    expect(state.counted).toEqual({ [SHIRT_ID]: '12', [TIE_ID]: '5' });
    expect(withCampus(state, IKEJA.id, items).counted).toEqual({
      [SHIRT_ID]: '0',
      [TIE_ID]: '5',
    });
  });

  it('sends every item, the trimmed note and whole numbers', () => {
    const state = withCounted(
      { ...initialCount(LEKKI.id, items), note: ' Shelf count ' },
      TIE_ID,
      ' 4 '
    );
    expect(countRequest(state, items)).toEqual({
      campusId: LEKKI.id,
      note: 'Shelf count',
      lines: [
        { itemId: SHIRT_ID, countedQuantity: 12 },
        { itemId: TIE_ID, countedQuantity: 4 },
      ],
    });
  });

  it('leaves the note out when blank', () => {
    expect(
      countRequest(initialCount(LEKKI.id, items), items)
    ).not.toHaveProperty('note');
  });

  it('refuses a blank, negative or fractional figure and an empty list', () => {
    const state = initialCount(LEKKI.id, items);
    for (const text of ['', '-1', '1.5', 'x']) {
      expect(validateCount(withCounted(state, TIE_ID, text), items)).toBe(
        STOCK_COUNT_NEGATIVE_MESSAGE
      );
    }
    expect(validateCount(state, [])).toBe(STOCK_COUNT_REQUIRED_MESSAGE);
    expect(validateCount(state, items)).toBeUndefined();
    expect(
      validateCount(withCounted(state, TIE_ID, '0'), items)
    ).toBeUndefined();
  });
});
