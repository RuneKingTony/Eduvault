import {
  STOCK_COUNT_NEGATIVE_MESSAGE,
  STOCK_COUNT_REQUIRED_MESSAGE,
  type Item,
  type SubmitStockCountInput,
} from '@eduvault/api-contract';

export interface CountState {
  campusId: string;
  note: string;
  counted: Readonly<Record<string, string>>;
}

type Counted = Pick<Item, 'id' | 'stock'>;

export const expectedAt = (item: Pick<Item, 'stock'>, campusId: string) =>
  item.stock.find((row) => row.campusId === campusId)?.onHand ?? 0;

const prefilled = (
  items: readonly Counted[],
  campusId: string
): Record<string, string> =>
  Object.fromEntries(
    items.map((item) => [item.id, String(expectedAt(item, campusId))])
  );

export const initialCount = (
  campusId: string,
  items: readonly Counted[]
): CountState => ({ campusId, note: '', counted: prefilled(items, campusId) });

export const withCampus = (
  state: CountState,
  campusId: string,
  items: readonly Counted[]
): CountState => ({
  ...state,
  campusId,
  counted: prefilled(items, campusId),
});

export const withCounted = (
  state: CountState,
  itemId: string,
  text: string
): CountState => ({
  ...state,
  counted: { ...state.counted, [itemId]: text },
});

const WHOLE_NUMBER = /^\d+$/;

export function validateCount(
  state: CountState,
  items: readonly Counted[]
): string | undefined {
  if (items.length === 0) {
    return STOCK_COUNT_REQUIRED_MESSAGE;
  }
  const valid = items.every((item) =>
    WHOLE_NUMBER.test((state.counted[item.id] ?? '').trim())
  );
  return valid ? undefined : STOCK_COUNT_NEGATIVE_MESSAGE;
}

export function countRequest(
  state: CountState,
  items: readonly Counted[]
): SubmitStockCountInput {
  const note = state.note.trim();
  return {
    campusId: state.campusId,
    ...(note === '' ? {} : { note }),
    lines: items.map((item) => ({
      itemId: item.id,
      countedQuantity: Number((state.counted[item.id] ?? '').trim()),
    })),
  };
}
