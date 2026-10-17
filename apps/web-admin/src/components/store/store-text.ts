import type {
  Delivery,
  Item,
  ItemKind,
  Sale,
  StockState,
} from '@eduvault/api-contract';
import { countOf, naira } from '@eduvault/shared';

export const MASKED_COST = '₦ ••••';
export const MASKED_LABEL = 'Hidden';
export const GO_LIVE_NOTE = 'Stock held at go-live';
export const NO_ACCOUNT_ACCESS_MESSAGE =
  'You need access to money accounts to pay from one. You can still record opening stock.';
export const COST_PRICE_TIP = 'Default unit cost for new deliveries';

export const KIND_LABELS: Record<ItemKind, string> = {
  uniform: 'Uniform',
  book: 'Book',
};

export const KIND_PLURALS: Record<ItemKind, string> = {
  uniform: 'Uniforms',
  book: 'Books',
};

export const itemDetail = (
  item: Pick<Item, 'kind' | 'classLevel' | 'variant'>
): string =>
  item.kind === 'book'
    ? (item.classLevel?.name ?? '')
    : (item.variant ?? 'One size');

export const STOCK_STATE_LABELS: Record<StockState, string> = {
  in: 'In stock',
  low: 'Low stock',
  out: 'Out of stock',
};

export const lowTip = (level: number): string =>
  `Low when ${level} or fewer are left on a campus`;

type StockTone = 'out' | 'low' | 'ok';

export const stockTone = (onHand: number, lowLevel: number): StockTone => {
  if (onHand <= 0) {
    return 'out';
  }
  return onHand <= lowLevel ? 'low' : 'ok';
};

export const stockValueNote = (lowCount: number): string =>
  `At cost · ${countOf(lowCount, 'item', 'items')} low or out`;

interface Scope {
  campuses: readonly { id: string; name: string }[];
  allCampuses: boolean;
  selectedId?: string;
}

export function scopeNote({ campuses, allCampuses, selectedId }: Scope) {
  const chosen = campuses.find((campus) => campus.id === selectedId);
  if (chosen !== undefined) {
    return `${chosen.name} campus`;
  }
  if (allCampuses) {
    return 'All campuses';
  }
  return `${campuses.map((campus) => campus.name).join(', ')} campus`;
}

export const storeDescription = (scope: Scope): string =>
  `Books and uniforms · ${scopeNote(scope)}`;

export const itemAddedMessage = (displayName: string): string =>
  `${displayName} added. Record a delivery to put it in stock.`;

export const itemSavedMessage = (displayName: string): string =>
  `${displayName} saved.`;

export const itemRetiredMessage = (displayName: string): string =>
  `${displayName} retired.`;

export const deliveryRecordedMessage = (
  delivery: Pick<Delivery, 'number' | 'totalMinor' | 'moneyAccount'>,
  campusName: string
): string =>
  delivery.moneyAccount === null
    ? `Opening stock recorded for ${campusName}: ${naira(delivery.totalMinor)} at cost.`
    : `${delivery.number} recorded: ${naira(delivery.totalMinor)} paid from ${delivery.moneyAccount.name}.`;

export const deliveryReplayedMessage = (
  reference: string,
  number: string
): string =>
  `Reference ${reference} was already recorded as ${number}. Nothing was posted twice.`;

const REFERENCE_SUFFIX_LENGTH = 8;

export function newDeliveryReference(
  lagosDate: string,
  uuid: () => string = () => globalThis.crypto.randomUUID()
): string {
  const suffix = uuid()
    .replaceAll('-', '')
    .slice(0, REFERENCE_SUFFIX_LENGTH)
    .toUpperCase();
  return `DEL-REQ-${lagosDate.replaceAll('-', '')}-${suffix}`;
}

export const saleRecordedMessage = (
  sale: Pick<Sale, 'number' | 'totalMinor' | 'receiptNumber'>
): string =>
  `${sale.number}: ${naira(sale.totalMinor)} paid, receipt ${sale.receiptNumber}.`;

export const COSTS_HIDDEN_NOTE = 'Hidden · turn on Show costs';

export const termSoldNote = (students: number): string =>
  `${countOf(students, 'student', 'students')} served`;
