import type { ItemRecord, StoreRef } from './store.repository';
import type {
  StockCount,
  StockCountList,
  StockCountListQuery,
  StockCountStatus,
} from '@eduvault/api-contract';
import type { ActivityInput } from '../../common/activity';
import type { WaitingApproval } from '../../common/approvals';
import { canSeeCampus } from '../../common/campus-scope';
import type { PostInput } from '../../common/ledger';
import {
  differenceValue,
  NO_STOCK,
  differencesSummary,
  lineDifference,
  netValue,
  type CountMovement,
  type StockLevel,
} from './stock-count';
import {
  StockCountRepository,
  WaitingCountClash,
  type NewStockCount,
  type StockCountRecord,
  type StockCountTx,
} from './stock-count.repository';
import type { OrgScope } from '../../common/scope';

interface StoredCount extends Omit<NewStockCount, 'status'> {
  createdBy: string;
  rejectionReason: string | null;
  decidedBy: string | null;
  status: StockCountStatus;
}

export class FakeStockCountRepository extends StockCountRepository {
  stores = new Map<string, StoreRef>();
  items = new Map<string, ItemRecord>();
  stock = new Map<string, StockLevel>();
  switchedOff = false;
  stored: StoredCount[] = [];
  posted: PostInput[] = [];
  recorded: ActivityInput[] = [];
  movements: (CountMovement & { number: string })[] = [];
  lockedItems: string[][] = [];
  lostRaces = 0;
  approveChanges = true;
  private nextNo = 1;
  private actor = '';

  seedStore(store: StoreRef): void {
    this.stores.set(store.campusId, store);
  }

  seedItem(item: ItemRecord): void {
    this.items.set(item.id, item);
  }

  setStock(storeId: string, itemId: string, level: StockLevel): void {
    this.stock.set(`${storeId}:${itemId}`, level);
  }

  async withTx<T>(
    _scope: OrgScope,
    userId: string,
    work: (tx: StockCountTx) => Promise<T>
  ): Promise<T> {
    this.actor = userId;
    const stored = structuredClone(this.stored);
    const posted = [...this.posted];
    const recorded = [...this.recorded];
    const movements = [...this.movements];
    const nextNo = this.nextNo;
    try {
      return await work(this.tx());
    } catch (error) {
      this.stored = stored;
      this.posted = posted;
      this.recorded = recorded;
      this.movements = movements;
      this.nextNo = nextNo;
      throw error;
    }
  }

  waitingNumber(
    _scope: OrgScope,
    campusId: string
  ): Promise<string | undefined> {
    const store = this.stores.get(campusId);
    return Promise.resolve(
      this.stored.find(
        (count) => count.storeId === store?.id && count.status === 'submitted'
      )?.number
    );
  }

  list(scope: OrgScope, query: StockCountListQuery): Promise<StockCountList> {
    const all = this.stored
      .map((count) => this.view(count))
      .toReversed()
      .filter(
        (count) =>
          canSeeCampus(scope.campusScope, count.campusId) &&
          (query.campusId === undefined || count.campusId === query.campusId)
      );
    const start = (query.page - 1) * query.pageSize;
    return Promise.resolve({
      items: all.slice(start, start + query.pageSize),
      total: all.length,
    });
  }

  find(scope: OrgScope, id: string): Promise<StockCount | undefined> {
    const found = this.stored.find((count) => count.id === id);
    const view = found && this.view(found);
    return Promise.resolve(
      view && canSeeCampus(scope.campusScope, view.campusId) ? view : undefined
    );
  }

  waiting(): Promise<WaitingApproval[]> {
    return Promise.resolve([]);
  }

  private storeOf(storeId: string): StoreRef {
    const store = [...this.stores.values()].find(
      (candidate) => candidate.id === storeId
    );
    if (store === undefined) {
      throw new Error(`No store ${storeId}`);
    }
    return store;
  }

  private view(count: StoredCount): StockCount {
    const store = this.storeOf(count.storeId);
    const lines = count.lines.map((line) => {
      const item = this.items.get(line.itemId);
      const difference = lineDifference(line);
      return {
        itemId: line.itemId,
        displayName: item?.displayName ?? '',
        expectedQuantity: line.expectedQuantity,
        countedQuantity: line.countedQuantity,
        difference,
        valueMinor: differenceValue(
          difference,
          this.stock.get(`${count.storeId}:${line.itemId}`) ?? NO_STOCK,
          item?.costPriceMinor ?? 0
        ),
      };
    });
    return {
      id: count.id,
      number: count.number,
      campusId: store.campusId,
      campusName: store.campusName,
      status: count.status,
      note: count.note,
      createdAt: '2026-10-17T08:00:00.000Z',
      countedBy: { id: count.createdBy, name: count.createdBy },
      decidedBy:
        count.decidedBy === null
          ? null
          : { id: count.decidedBy, name: count.decidedBy },
      rejectionReason: count.rejectionReason,
      netValueMinor: netValue(lines),
      differences: differencesSummary(lines),
      lines,
    };
  }

  private recordOf(count: StoredCount): StockCountRecord {
    return {
      id: count.id,
      number: count.number,
      status: count.status,
      createdBy: count.createdBy,
      store: this.storeOf(count.storeId),
      lines: count.lines.map((line) => ({
        ...line,
        displayName: this.items.get(line.itemId)?.displayName ?? '',
        costPriceMinor: this.items.get(line.itemId)?.costPriceMinor ?? 0,
      })),
    };
  }

  private tx(): StockCountTx {
    return { ...this.reads(), ...this.writes(), ...this.decisions() };
  }

  private reads(): Pick<
    StockCountTx,
    | 'store'
    | 'items'
    | 'waitingNumber'
    | 'approvalOn'
    | 'lockStock'
    | 'systemAccounts'
    | 'lockCount'
    | 'currency'
  > {
    return {
      currency: () => Promise.resolve('NGN'),
      store: (campusId) => Promise.resolve(this.stores.get(campusId)),
      items: (ids) =>
        Promise.resolve(
          ids.flatMap((id) => {
            const item = this.items.get(id);
            return item === undefined ? [] : [item];
          })
        ),
      waitingNumber: (storeId) =>
        Promise.resolve(
          this.lostRaces > 0
            ? undefined
            : this.stored.find(
                (count) =>
                  count.storeId === storeId && count.status === 'submitted'
              )?.number
        ),
      approvalOn: () => Promise.resolve(!this.switchedOff),
      lockStock: (storeId, itemIds) => {
        this.lockedItems.push([...itemIds]);
        return Promise.resolve(
          new Map(
            itemIds.flatMap((id) => {
              const level = this.stock.get(`${storeId}:${id}`);
              return level === undefined ? [] : [[id, level] as const];
            })
          )
        );
      },
      systemAccounts: () =>
        Promise.resolve({
          storeStockId: 'store-stock',
          storeLossesId: 'store-losses',
        }),
      lockCount: (id) => {
        const found = this.stored.find((count) => count.id === id);
        return Promise.resolve(found && this.recordOf(found));
      },
    };
  }

  private writes(): Pick<
    StockCountTx,
    'nextNumber' | 'post' | 'insertMovements' | 'insertCount' | 'activity'
  > {
    return {
      activity: {
        recordMany: (inputs) => {
          this.recorded.push(...inputs);
          return Promise.resolve();
        },
      },
      nextNumber: (year) =>
        Promise.resolve(
          `CNT-${year}-${String(this.nextNo++).padStart(4, '0')}`
        ),
      post: (entry) => {
        this.posted.push(entry);
        return Promise.resolve(`entry-${this.posted.length}`);
      },
      insertMovements: (count) => {
        this.movements.push(
          ...count.movements.map((move) => ({ ...move, number: count.number }))
        );
        return Promise.resolve();
      },
      insertCount: (input) => {
        if (this.lostRaces > 0) {
          this.lostRaces -= 1;
          return Promise.reject(
            new WaitingCountClash('stock_count_waiting_key')
          );
        }
        this.stored.push({
          ...input,
          createdBy: this.actor,
          rejectionReason: null,
          decidedBy: null,
        });
        return Promise.resolve();
      },
    };
  }

  private decisions(): Pick<StockCountTx, 'approve' | 'reject'> {
    return {
      approve: (id, entryId) => {
        const row = this.stored.find((count) => count.id === id);
        if (row !== undefined && this.approveChanges) {
          Object.assign(row, {
            status: 'approved',
            decidedBy: this.actor,
            journalEntryId: entryId ?? null,
          });
        }
        return Promise.resolve(this.approveChanges);
      },
      reject: (id, reason) => {
        const row = this.stored.find((count) => count.id === id);
        if (row !== undefined) {
          Object.assign(row, {
            status: 'rejected',
            decidedBy: this.actor,
            rejectionReason: reason,
          });
        }
        return Promise.resolve(row !== undefined);
      },
    };
  }
}
