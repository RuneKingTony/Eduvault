import { Inject, Injectable } from '@nestjs/common';
import { sql, type Kysely } from 'kysely';
import {
  STORE_LOSSES_SYSTEM_KEY,
  itemDisplayName,
  STORE_STOCK_SYSTEM_KEY,
  stockCountStatusSchema,
  type StockCount,
  type StockCountList,
  type StockCountListQuery,
} from '@eduvault/api-contract';
import type { DB } from '../../../db/db-types';
import {
  decisionsFor,
  isApprovalOn,
  type WaitingApproval,
} from '../../common/approvals';
import { ActivityWriter, type ActivityRecorder } from '../../common/activity';
import { inCampusScope } from '../../common/db/in-campus-scope';
import { KYSELY_TOKEN, type Database } from '../../common/db/tokens';
import { uniqueViolation } from '../../common/db/unique-violation';
import {
  allocateDocumentNumber,
  formatDocumentNumber,
} from '../../common/documents';
import {
  LedgerPoster,
  schoolCurrency,
  systemAccountId,
  type PostInput,
} from '../../common/ledger';
import { inScope } from '../../common/students';
import {
  findStockCount,
  listStockCounts,
  readLines,
  STORE_CAMPUS,
  waitingCountNumber,
  waitingStockCounts,
} from './kysely-stock-count-read.repository';
import { readItems } from './kysely-item.repository';
import { lockStock } from './kysely-stock-lock.repository';
import type { CountMovement } from './stock-count';
import {
  StockCountRepository,
  WaitingCountClash,
  type CountSystemAccounts,
  type NewStockCount,
  type StockCountRecord,
  type StockCountTx,
} from './stock-count.repository';
import type { ItemRecord, StoreRef, StoreScope } from './store.repository';

const WAITING_KEY = 'stock_count_waiting_key';
interface RecordRow {
  id: string;
  number: string;
  status: string;
  created_by: string | null;
  store_id: string;
  campus_id: string;
  campus_name: string;
  store_name: string;
}

class KyselyStockCountTx implements StockCountTx {
  private readonly decisions: ReturnType<typeof decisionsFor>;
  readonly activity: ActivityRecorder;

  constructor(
    private readonly trx: Kysely<DB>,
    private readonly deps: { poster: LedgerPoster; activity: ActivityRecorder },
    private readonly who: { scope: StoreScope; userId: string }
  ) {
    this.activity = deps.activity;
    this.decisions = decisionsFor(trx, {
      table: 'stock_count',
      organizationId: who.scope.organizationId,
      userId: who.userId,
    });
  }

  private get organizationId(): string {
    return this.who.scope.organizationId;
  }

  currency(): Promise<string> {
    return schoolCurrency(this.trx, this.organizationId);
  }

  async store(campusId: string): Promise<StoreRef | undefined> {
    const row = await this.trx
      .selectFrom('store')
      .innerJoin('team', 'team.id', 'store.campus_id')
      .where('store.organization_id', '=', this.organizationId)
      .where('store.campus_id', '=', campusId)
      .where((eb) =>
        inCampusScope(eb, 'store.campus_id', {
          scope: this.who.scope.campusScope,
        })
      )
      .select([
        'store.id',
        'store.campus_id',
        'store.name',
        'team.name as campus_name',
      ])
      .executeTakeFirst();
    return (
      row && {
        id: row.id,
        campusId: row.campus_id,
        campusName: row.campus_name,
        name: row.name,
      }
    );
  }

  items(ids: readonly string[]): Promise<ItemRecord[]> {
    return readItems(this.trx, this.organizationId, ids);
  }

  async waitingNumber(storeId: string): Promise<string | undefined> {
    const row = await this.trx
      .selectFrom('stock_count')
      .select('number')
      .where('organization_id', '=', this.organizationId)
      .where('store_id', '=', storeId)
      .where('status', '=', 'submitted')
      .executeTakeFirst();
    return row?.number;
  }

  approvalOn(): Promise<boolean> {
    return isApprovalOn(this.trx, this.organizationId, 'store_write_off');
  }

  lockStock(storeId: string, itemIds: readonly string[]) {
    return lockStock(this.trx, {
      organizationId: this.organizationId,
      storeId,
      itemIds,
    });
  }

  async nextNumber(year: number): Promise<string> {
    const value = await allocateDocumentNumber(this.trx, {
      organizationId: this.organizationId,
      kind: 'stock_count',
      year,
    });
    return formatDocumentNumber('stock_count', year, value);
  }

  async systemAccounts(): Promise<CountSystemAccounts> {
    const [storeStockId, storeLossesId] = await Promise.all([
      systemAccountId(this.trx, this.organizationId, STORE_STOCK_SYSTEM_KEY),
      systemAccountId(this.trx, this.organizationId, STORE_LOSSES_SYSTEM_KEY),
    ]);
    return { storeStockId, storeLossesId };
  }

  async post(entry: PostInput): Promise<string> {
    const { entry: posted } = await this.deps.poster.post(this.trx, entry);
    return posted.id;
  }

  async insertMovements(count: {
    id: string;
    number: string;
    storeId: string;
    movements: readonly CountMovement[];
  }): Promise<void> {
    if (count.movements.length === 0) {
      return;
    }
    await this.trx
      .insertInto('stock_movement')
      .values(
        count.movements.map((move) => ({
          organization_id: this.organizationId,
          store_id: count.storeId,
          item_id: move.itemId,
          quantity: move.quantity,
          kind: 'count',
          value_minor: String(move.valueMinor),
          reference: count.number,
          source_id: count.id,
          moved_by: this.who.userId,
        }))
      )
      .execute();
  }

  async insertCount(input: NewStockCount): Promise<void> {
    const approved = input.status === 'approved';
    await this.trx
      .insertInto('stock_count')
      .values({
        id: input.id,
        organization_id: this.organizationId,
        number: input.number,
        store_id: input.storeId,
        status: input.status,
        note: input.note,
        journal_entry_id: input.journalEntryId,
        created_by: this.who.userId,
        approved_by: null,
        approved_at: approved ? new Date() : null,
      })
      .execute();
    await this.trx
      .insertInto('stock_count_line')
      .values(
        input.lines.map((line) => ({
          organization_id: this.organizationId,
          stock_count_id: input.id,
          item_id: line.itemId,
          expected_quantity: line.expectedQuantity,
          counted_quantity: line.countedQuantity,
        }))
      )
      .execute();
  }

  async lockCount(id: string): Promise<StockCountRecord | undefined> {
    const { rows } = await sql<RecordRow>`
      SELECT sc.id, sc.number, sc.status, sc.created_by, sc.store_id,
        s.campus_id, t.name AS campus_name, s.name AS store_name
      FROM stock_count sc
      JOIN store s ON s.id = sc.store_id AND s.organization_id = sc.organization_id
      JOIN team t ON t.id = s.campus_id
      WHERE sc.id = ${id} AND sc.organization_id = ${this.organizationId}
        AND ${inScope(STORE_CAMPUS, this.who.scope.campusScope)}
      FOR UPDATE OF sc`.execute(this.trx);
    const row = rows[0];
    if (row === undefined) {
      return undefined;
    }
    const byCount = await readLines(this.trx, this.who.scope, [id]);
    const lines = byCount.get(id) ?? [];
    return {
      id: row.id,
      number: row.number,
      status: stockCountStatusSchema.parse(row.status),
      createdBy: row.created_by,
      store: {
        id: row.store_id,
        campusId: row.campus_id,
        campusName: row.campus_name,
        name: row.store_name,
      },
      lines: lines.map((line) => ({
        itemId: line.item_id,
        displayName: itemDisplayName(line),
        expectedQuantity: line.expected_quantity,
        countedQuantity: line.counted_quantity,
        costPriceMinor: Number(line.cost_price_minor),
      })),
    };
  }

  approve(id: string, entryId: string | undefined): Promise<boolean> {
    return this.decisions.approve(id, entryId);
  }

  reject(id: string, reason: string): Promise<boolean> {
    return this.decisions.reject(id, reason);
  }
}

@Injectable()
export class KyselyStockCountRepository extends StockCountRepository {
  constructor(
    @Inject(KYSELY_TOKEN) private readonly db: Database,
    private readonly poster: LedgerPoster,
    private readonly activity: ActivityWriter
  ) {
    super();
  }

  async withTx<T>(
    scope: StoreScope,
    userId: string,
    work: (tx: StockCountTx) => Promise<T>
  ): Promise<T> {
    try {
      return await this.db
        .transaction()
        .execute((trx) =>
          work(
            new KyselyStockCountTx(
              trx,
              { poster: this.poster, activity: this.activity.within(trx) },
              { scope, userId }
            )
          )
        );
    } catch (error) {
      if (uniqueViolation(error) === WAITING_KEY) {
        throw new WaitingCountClash(WAITING_KEY);
      }
      throw error;
    }
  }

  waitingNumber(
    scope: StoreScope,
    campusId: string
  ): Promise<string | undefined> {
    return waitingCountNumber(this.db, scope, campusId);
  }

  list(scope: StoreScope, query: StockCountListQuery): Promise<StockCountList> {
    return listStockCounts(this.db, scope, query);
  }

  find(scope: StoreScope, id: string): Promise<StockCount | undefined> {
    return findStockCount(this.db, scope, id);
  }

  waiting(scope: StoreScope): Promise<WaitingApproval[]> {
    return waitingStockCounts(this.db, scope);
  }
}
