import type {
  StockCount,
  StockCountList,
  StockCountListQuery,
  StockCountStatus,
} from '@eduvault/api-contract';
import type { ApprovalProvider } from '../../common/approvals';
import type { PostInput } from '../../common/ledger';
import type { CountLineFacts, CountMovement, StockLevel } from './stock-count';
import type { ItemRecord, StoreRef, StoreScope } from './store.repository';

export interface StockCountRecord {
  id: string;
  number: string;
  status: StockCountStatus;
  createdBy: string | null;
  store: StoreRef;
  lines: CountLineFacts[];
}

export interface NewStockCount {
  id: string;
  number: string;
  storeId: string;
  status: 'matched' | 'submitted' | 'approved';
  note: string | null;
  journalEntryId: string | null;
  lines: {
    itemId: string;
    expectedQuantity: number;
    countedQuantity: number;
  }[];
}

export interface CountSystemAccounts {
  storeStockId: string;
  storeLossesId: string;
}

export interface StockCountTx {
  store(campusId: string): Promise<StoreRef | undefined>;
  items(ids: readonly string[]): Promise<ItemRecord[]>;
  waitingNumber(storeId: string): Promise<string | undefined>;
  approvalOn(): Promise<boolean>;
  lockStock(
    storeId: string,
    itemIds: readonly string[]
  ): Promise<Map<string, StockLevel>>;
  nextNumber(year: number): Promise<string>;
  systemAccounts(): Promise<CountSystemAccounts>;
  post(entry: PostInput): Promise<string>;
  insertMovements(count: {
    id: string;
    number: string;
    storeId: string;
    movements: readonly CountMovement[];
  }): Promise<void>;
  insertCount(input: NewStockCount): Promise<void>;
  lockCount(id: string): Promise<StockCountRecord | undefined>;
  approve(id: string, entryId: string | undefined): Promise<boolean>;
  reject(id: string, reason: string): Promise<boolean>;
}

export class WaitingCountClash extends Error {
  override readonly name = 'WaitingCountClash';
}

export abstract class StockCountRepository implements ApprovalProvider {
  abstract withTx<T>(
    scope: StoreScope,
    userId: string,
    work: (tx: StockCountTx) => Promise<T>
  ): Promise<T>;

  abstract waitingNumber(
    scope: StoreScope,
    campusId: string
  ): Promise<string | undefined>;

  abstract list(
    scope: StoreScope,
    query: StockCountListQuery
  ): Promise<StockCountList>;

  abstract find(scope: StoreScope, id: string): Promise<StockCount | undefined>;

  abstract waiting(scope: StoreScope): ReturnType<ApprovalProvider['waiting']>;
}
