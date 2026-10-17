import {
  ITEM_PRICE_BELOW_COST_MESSAGE,
  createItemSchema,
  updateItemSchema,
  type CreateItem,
  type Item,
  type ItemKind,
  type UpdateItem,
  type UpdateItemInput,
} from '@eduvault/api-contract';
import { parseNaira } from '@eduvault/shared';
import { nairaText } from '../payments/record-payment-model';

const CHECK_MESSAGE = 'Check the item details.';

export interface ItemFormState {
  kind: ItemKind;
  name: string;
  size: string;
  classLevelId: string;
  cost: string;
  price: string;
  lowAt: string;
}

type Checked<T> =
  { body: T; error?: undefined } | { body?: undefined; error: string };

export const emptyItemForm = (classLevelId: string): ItemFormState => ({
  kind: 'uniform',
  name: '',
  size: '',
  classLevelId,
  cost: '',
  price: '',
  lowAt: '5',
});

export const itemFormOf = (item: Item): ItemFormState => ({
  kind: item.kind,
  name: item.name,
  size: item.variant ?? '',
  classLevelId: item.classLevel?.id ?? '',
  cost: nairaText(item.costPriceMinor),
  price: nairaText(item.sellPriceMinor),
  lowAt: String(item.lowStockLevel),
});

const lowLevelOf = (text: string): number | undefined =>
  text.trim() === '' ? undefined : Number(text);

export function withKind(
  state: ItemFormState,
  kind: ItemKind,
  firstLevelId: string
): ItemFormState {
  return {
    ...state,
    kind,
    size: kind === 'book' ? '' : state.size,
    classLevelId: kind === 'book' ? state.classLevelId || firstLevelId : '',
  };
}

export function newItemRequest(state: ItemFormState): Checked<CreateItem> {
  const result = createItemSchema.safeParse({
    kind: state.kind,
    name: state.name,
    variant: state.kind === 'uniform' ? state.size : null,
    classLevelId: state.kind === 'book' ? state.classLevelId || null : null,
    costPriceMinor: parseNaira(state.cost),
    sellPriceMinor: parseNaira(state.price),
    lowStockLevel: lowLevelOf(state.lowAt),
  });
  return result.success
    ? { body: result.data }
    : { error: result.error.issues[0]?.message ?? CHECK_MESSAGE };
}

const differs = <T>(next: T | undefined, current: T): next is T =>
  next !== undefined && next !== current;

function changedFields(
  item: Item,
  next: UpdateItem,
  state: ItemFormState
): UpdateItemInput {
  const costPriceMinor = parseNaira(state.cost);
  const sellPriceMinor = parseNaira(state.price);
  return {
    ...(differs(next.name, item.name) ? { name: next.name } : {}),
    ...(differs(next.variant, item.variant) ? { variant: next.variant } : {}),
    ...(differs(costPriceMinor, item.costPriceMinor) ? { costPriceMinor } : {}),
    ...(differs(sellPriceMinor, item.sellPriceMinor) ? { sellPriceMinor } : {}),
    ...(differs(next.lowStockLevel, item.lowStockLevel)
      ? { lowStockLevel: next.lowStockLevel }
      : {}),
  };
}

/** Only the changed fields go to the server, so an untouched price writes no history row. */
export function itemChanges(
  item: Item,
  state: ItemFormState
): Checked<UpdateItemInput> {
  const costPriceMinor = parseNaira(state.cost);
  const sellPriceMinor = parseNaira(state.price);
  const result = updateItemSchema.safeParse({
    name: state.name,
    ...(item.kind === 'uniform' ? { variant: state.size } : {}),
    costPriceMinor,
    sellPriceMinor,
    lowStockLevel: lowLevelOf(state.lowAt),
  });
  if (!result.success) {
    return { error: result.error.issues[0]?.message ?? CHECK_MESSAGE };
  }
  if (
    costPriceMinor !== undefined &&
    sellPriceMinor !== undefined &&
    sellPriceMinor < costPriceMinor
  ) {
    return { error: ITEM_PRICE_BELOW_COST_MESSAGE };
  }
  return { body: changedFields(item, result.data, state) };
}
