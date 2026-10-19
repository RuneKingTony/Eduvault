import type {
  Delivery,
  DeliveryDetail,
  DeliveryLineInput,
  DeliveryListQuery,
  Item,
  ItemKind,
} from '@eduvault/api-contract';
import type { ActivityInput } from '../../common/activity';
import type { OrgScope } from '../../common/scope';

export type ItemRecord = Omit<Item, 'stock' | 'state'>;

export interface StoreRef {
  id: string;
  campusId: string;
  campusName: string;
  name: string;
}

export interface StockTotals {
  storeId: string;
  itemId: string;
  onHand: number;
  valueMinor: number;
}

export interface ItemFilter {
  kind?: ItemKind;
  q?: string;
  includeRetired: boolean;
}

export interface NewItem {
  organizationId: string;
  userId: string;
  kind: ItemKind;
  name: string;
  variant: string | null;
  classLevelId: string | null;
  costPriceMinor: number;
  sellPriceMinor: number;
  lowStockLevel: number;
}

export type ItemInsertOutcome =
  { status: 'created'; item: ItemRecord } | { status: 'duplicate' };

export interface ItemChange {
  organizationId: string;
  userId: string;
  itemId: string;
  name?: string;
  variant?: string | null;
  costPriceMinor?: number;
  sellPriceMinor?: number;
  lowStockLevel?: number;
  retire: boolean;
}

export type ItemUpdateOutcome =
  | { status: 'updated'; item: ItemRecord }
  | { status: 'duplicate' }
  | { status: 'retired' }
  | { status: 'missing' };

export type MoneyAccountCheck =
  | { status: 'missing' }
  | { status: 'retired' }
  | { status: 'gateway' }
  | { status: 'ok'; ledgerAccountId: string; campusId: string | null };

export interface ExistingDelivery {
  id: string;
  number: string;
  requestHash: string;
}

export interface NewDelivery {
  organizationId: string;
  userId: string;
  year: number;
  reference: string;
  requestHash: string;
  store: StoreRef;
  supplierName: string;
  isOpening: boolean;
  receivedOn: string;
  moneyAccount: { id: string; ledgerAccountId: string } | null;
  lines: DeliveryLineInput[];
}

export type DeliveryActivity = (delivery: {
  id: string;
  number: string;
  totalMinor: number;
}) => ActivityInput[];

export type DeliveryOutcome =
  | { status: 'recorded'; id: string }
  | { status: 'replayed'; id: string }
  | { status: 'reference_used'; number: string }
  | { status: 'opening_exists' };

export interface DeliveryPage {
  items: Delivery[];
  total: number;
  suppliers: string[];
}

export interface DeliveryPageQuery extends Pick<DeliveryListQuery, 'page'> {
  pageSize: number;
  campusId?: string;
}

export abstract class StoreRepository {
  abstract classLevel(
    organizationId: string,
    id: string
  ): Promise<{ id: string; name: string } | undefined>;

  abstract listItems(
    organizationId: string,
    filter: ItemFilter
  ): Promise<ItemRecord[]>;

  abstract findItem(
    organizationId: string,
    id: string
  ): Promise<ItemRecord | undefined>;

  abstract findItems(
    organizationId: string,
    ids: readonly string[]
  ): Promise<ItemRecord[]>;

  abstract insertItem(input: NewItem): Promise<ItemInsertOutcome>;

  abstract updateItem(change: ItemChange): Promise<ItemUpdateOutcome>;

  abstract storesInScope(scope: OrgScope): Promise<StoreRef[]>;

  abstract stockTotals(
    organizationId: string,
    storeIds: readonly string[]
  ): Promise<StockTotals[]>;

  abstract findDeliveryByReference(
    organizationId: string,
    reference: string
  ): Promise<ExistingDelivery | undefined>;

  abstract moneyAccount(
    scope: OrgScope,
    moneyAccountId: string
  ): Promise<MoneyAccountCheck>;

  abstract hasOpeningStock(
    organizationId: string,
    storeId: string
  ): Promise<boolean>;

  abstract currency(organizationId: string): Promise<string>;

  abstract insertDelivery(
    input: NewDelivery,
    activity: DeliveryActivity
  ): Promise<DeliveryOutcome>;

  abstract listDeliveries(
    scope: OrgScope,
    query: DeliveryPageQuery
  ): Promise<DeliveryPage>;

  abstract findDelivery(
    scope: OrgScope,
    id: string
  ): Promise<DeliveryDetail | undefined>;
}
