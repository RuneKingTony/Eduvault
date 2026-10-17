import {
  DELIVERY_ACCOUNT_MESSAGE,
  DELIVERY_FUTURE_DATE_MESSAGE,
  DELIVERY_REQUIRED_MESSAGE,
  DELIVERY_UNIT_COST_MESSAGE,
  OPENING_STOCK_SUPPLIER,
  type Item,
  type MoneyAccount,
  type RecordDeliveryInput,
} from '@eduvault/api-contract';
import { parseNaira } from '@eduvault/shared';
import { nairaText } from '../payments/record-payment-model';

export interface LineState {
  quantity: string;
  unitCost: string;
}

export interface DeliveryState {
  reference: string;
  supplier: string;
  campusId: string;
  accountId: string;
  opening: boolean;
  receivedOn: string;
  lines: Readonly<Record<string, LineState>>;
}

type Account = Pick<MoneyAccount, 'id' | 'kind' | 'campusId' | 'retiredAt'>;

export function eligibleAccounts<T extends Account>(
  accounts: readonly T[],
  campusId: string
): T[] {
  return accounts.filter(
    (account) =>
      account.kind !== 'gateway' &&
      account.retiredAt === null &&
      (account.campusId === null || account.campusId === campusId)
  );
}

const firstAccountId = (accounts: readonly Account[], campusId: string) =>
  eligibleAccounts(accounts, campusId)[0]?.id ?? '';

function linesFor(
  items: readonly Pick<Item, 'id' | 'costPriceMinor'>[]
): Record<string, LineState> {
  return Object.fromEntries(
    items.map((item) => [
      item.id,
      { quantity: '', unitCost: nairaText(item.costPriceMinor) },
    ])
  );
}

export function initialDelivery(
  reference: string,
  campusId: string,
  today: string
): DeliveryState {
  return {
    reference,
    supplier: '',
    campusId,
    accountId: '',
    opening: false,
    receivedOn: today,
    lines: {},
  };
}

export function withLoaded(
  state: DeliveryState,
  items: readonly Pick<Item, 'id' | 'costPriceMinor'>[],
  accounts: readonly Account[]
): DeliveryState {
  const accountStillFits = eligibleAccounts(accounts, state.campusId).some(
    (account) => account.id === state.accountId
  );
  return {
    ...state,
    lines: { ...linesFor(items), ...state.lines },
    accountId: accountStillFits
      ? state.accountId
      : firstAccountId(accounts, state.campusId),
  };
}

export function withCampus(
  state: DeliveryState,
  campusId: string,
  accounts: readonly Account[]
): DeliveryState {
  return {
    ...state,
    campusId,
    accountId: eligibleAccounts(accounts, campusId).some(
      (account) => account.id === state.accountId
    )
      ? state.accountId
      : firstAccountId(accounts, campusId),
  };
}

export function withOpening(
  state: DeliveryState,
  opening: boolean
): DeliveryState {
  const typed =
    state.supplier.trim() !== '' && state.supplier !== OPENING_STOCK_SUPPLIER;
  const fallback = opening ? OPENING_STOCK_SUPPLIER : '';
  return { ...state, opening, supplier: typed ? state.supplier : fallback };
}

export const withLine = (
  state: DeliveryState,
  itemId: string,
  change: Partial<LineState>
): DeliveryState => ({
  ...state,
  lines: {
    ...state.lines,
    [itemId]: {
      quantity: '',
      unitCost: '',
      ...state.lines[itemId],
      ...change,
    },
  },
});

const quantityOf = (text: string): number =>
  /^\d+$/.test(text.trim()) ? Number(text) : 0;

const received = (state: DeliveryState) =>
  Object.entries(state.lines)
    .map(([itemId, line]) => ({
      itemId,
      line,
      quantity: quantityOf(line.quantity),
    }))
    .filter((row) => row.quantity > 0);

export function validateDelivery(
  state: DeliveryState,
  today: string
): string | undefined {
  const rows = received(state);
  if (state.supplier.trim() === '' || rows.length === 0) {
    return DELIVERY_REQUIRED_MESSAGE;
  }
  if (rows.some((row) => (parseNaira(row.line.unitCost) ?? 0) <= 0)) {
    return DELIVERY_UNIT_COST_MESSAGE;
  }
  if (state.receivedOn > today) {
    return DELIVERY_FUTURE_DATE_MESSAGE;
  }
  if (!state.opening && state.accountId === '') {
    return DELIVERY_ACCOUNT_MESSAGE;
  }
  return undefined;
}

export function deliveryRequest(state: DeliveryState): RecordDeliveryInput {
  return {
    reference: state.reference,
    campusId: state.campusId,
    supplierName: state.supplier.trim(),
    ...(state.opening
      ? { isOpening: true }
      : { moneyAccountId: state.accountId }),
    receivedOn: state.receivedOn,
    lines: received(state).map((row) => ({
      itemId: row.itemId,
      quantity: row.quantity,
      unitCostMinor: parseNaira(row.line.unitCost) ?? 0,
    })),
  };
}

export function totalMinor(state: DeliveryState): number {
  return received(state).reduce(
    (sum, row) => sum + row.quantity * (parseNaira(row.line.unitCost) ?? 0),
    0
  );
}
