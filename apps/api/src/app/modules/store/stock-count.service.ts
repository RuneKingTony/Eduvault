import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ITEM_NOT_FOUND_MESSAGE,
  STOCK_COUNT_CLASH_MESSAGE,
  STOCK_COUNT_NOT_FOUND_MESSAGE,
  STOCK_MOVED_MESSAGE,
  STORE_CAMPUS_NOT_FOUND_MESSAGE,
  stockCountRetiredItemMessage,
  stockCountWaitingMessage,
  type StockCount,
  type StockCountList,
  type StockCountListQuery,
  type SubmitStockCount,
} from '@eduvault/api-contract';
import {
  financeActorIn,
  storeWriteOffApprovedActivity,
  storeWriteOffDeclinedActivity,
  type StoreWriteOffFacts,
} from '../../common/activity';
import { assertDeclineReason, decide } from '../../common/approvals';
import type { OrgContext } from '../../common/auth';
import { Clock } from '../../common/clock';
import { documentYear } from '../../common/documents';
import {
  approvalPlan,
  lineDifference,
  type ApprovalPlan,
  type CountLineFacts,
  type StockLevel,
} from './stock-count';
import {
  StockCountRepository,
  WaitingCountClash,
  type NewStockCount,
  type StockCountTx,
} from './stock-count.repository';
import type { StoreRef } from './store.repository';
import { countPosting } from './store-posting';
import { orgScopeOf } from '../../common/scope';

const SUBMIT_ATTEMPTS = 2;

const notFound = () => new NotFoundException(STOCK_COUNT_NOT_FOUND_MESSAGE);

type Ready = Extract<ApprovalPlan, { status: 'ready' }>;

interface Applied {
  id: string;
  number: string;
  store: StoreRef;
  lines: readonly CountLineFacts[];
}

interface Posted {
  entryId: string | undefined;
  netMinor: number;
}

const differingLines = (lines: readonly CountLineFacts[]): number =>
  lines.filter((line) => lineDifference(line) !== 0).length;

const writeOffFacts = (counted: Applied): StoreWriteOffFacts => ({
  id: counted.id,
  number: counted.number,
  storeId: counted.store.id,
  campusId: counted.store.campusId,
  campusName: counted.store.campusName,
});

@Injectable()
export class StockCountService {
  constructor(
    private readonly counts: StockCountRepository,
    private readonly clock: Clock
  ) {}

  async list(
    ctx: OrgContext,
    query: StockCountListQuery
  ): Promise<StockCountList> {
    const list = await this.counts.list(orgScopeOf(ctx), query);
    if (list.items.length === 0 && query.campusId !== undefined) {
      await this.assertCampusVisible(ctx, query.campusId);
    }
    return list;
  }

  get(ctx: OrgContext, id: string): Promise<StockCount> {
    return this.item(ctx, id);
  }

  async submit(ctx: OrgContext, input: SubmitStockCount): Promise<StockCount> {
    const scope = orgScopeOf(ctx);
    const year = documentYear(this.clock);
    for (let attempt = 0; attempt < SUBMIT_ATTEMPTS; attempt += 1) {
      try {
        const id = await this.counts.withTx(scope, ctx.user.id, (tx) =>
          this.record(tx, { ctx, input, year })
        );
        return await this.item(ctx, id);
      } catch (error) {
        if (!(error instanceof WaitingCountClash)) {
          throw error;
        }
        const number = await this.counts.waitingNumber(scope, input.campusId);
        if (number !== undefined) {
          throw new ConflictException(stockCountWaitingMessage(number));
        }
      }
    }
    throw new ConflictException(STOCK_COUNT_CLASH_MESSAGE);
  }

  async approve(ctx: OrgContext, id: string): Promise<StockCount> {
    await this.counts.withTx(orgScopeOf(ctx), ctx.user.id, async (tx) => {
      const found = await tx.lockCount(id);
      if (found === undefined) {
        throw notFound();
      }
      await decide(
        {
          actorId: ctx.user.id,
          createdBy: found.createdBy,
          isOwner: ctx.isOwner,
        },
        async (ownRequest) => {
          if (found.status !== 'submitted') {
            return false;
          }
          const stock = await tx.lockStock(
            found.store.id,
            found.lines
              .filter((line) => lineDifference(line) !== 0)
              .map((line) => line.itemId)
          );
          const plan = approvalPlan(found.lines, stock);
          if (plan.status === 'moved') {
            throw new ConflictException(STOCK_MOVED_MESSAGE);
          }
          const { entryId, netMinor } = await this.apply(tx, ctx, {
            counted: found,
            plan,
          });
          const changed = await tx.approve(id, entryId);
          if (changed) {
            await this.recordApproved(tx, ctx, {
              counted: found,
              netMinor,
              autoApproved: false,
              ownRequest,
            });
          }
          return changed;
        }
      );
    });
    return this.item(ctx, id);
  }

  async decline(
    ctx: OrgContext,
    id: string,
    reason: string
  ): Promise<StockCount> {
    const declineReason = assertDeclineReason(reason);
    await this.counts.withTx(orgScopeOf(ctx), ctx.user.id, async (tx) => {
      const found = await tx.lockCount(id);
      if (found === undefined) {
        throw notFound();
      }
      await decide(
        {
          actorId: ctx.user.id,
          createdBy: found.createdBy,
          isOwner: ctx.isOwner,
        },
        async () => {
          if (
            found.status !== 'submitted' ||
            !(await tx.reject(id, declineReason))
          ) {
            return false;
          }
          await tx.activity.recordMany(
            storeWriteOffDeclinedActivity(
              await financeActorIn(ctx, tx),
              writeOffFacts(found),
              {
                differences: differingLines(found.lines),
                reason: declineReason,
              }
            )
          );
          return true;
        }
      );
    });
    return this.item(ctx, id);
  }

  private async assertCampusVisible(
    ctx: OrgContext,
    campusId: string
  ): Promise<void> {
    const campus = await this.counts.withTx(
      orgScopeOf(ctx),
      ctx.user.id,
      (tx) => tx.store(campusId)
    );
    if (campus === undefined) {
      throw new NotFoundException(STORE_CAMPUS_NOT_FOUND_MESSAGE);
    }
  }

  private async item(ctx: OrgContext, id: string): Promise<StockCount> {
    const found = await this.counts.find(orgScopeOf(ctx), id);
    if (found === undefined) {
      throw notFound();
    }
    return found;
  }

  private async record(
    tx: StockCountTx,
    request: { ctx: OrgContext; input: SubmitStockCount; year: number }
  ): Promise<string> {
    const { ctx, input, year } = request;
    const store = await tx.store(input.campusId);
    if (store === undefined) {
      throw new NotFoundException(STORE_CAMPUS_NOT_FOUND_MESSAGE);
    }
    const items = await this.checkedItems(tx, input);
    const waiting = await tx.waitingNumber(store.id);
    if (waiting !== undefined) {
      throw new ConflictException(stockCountWaitingMessage(waiting));
    }
    const stock = await tx.lockStock(
      store.id,
      input.lines.map((line) => line.itemId)
    );
    const lines: CountLineFacts[] = input.lines.map((line) => {
      const item = items.get(line.itemId);
      return {
        itemId: line.itemId,
        displayName: item?.displayName ?? '',
        expectedQuantity: stock.get(line.itemId)?.onHand ?? 0,
        countedQuantity: line.countedQuantity,
        costPriceMinor: item?.costPriceMinor ?? 0,
      };
    });
    const counted: Applied = {
      id: randomUUID(),
      number: await tx.nextNumber(year),
      store,
      lines,
    };
    const { status, applied } = await this.settle(tx, ctx, { counted, stock });
    await tx.insertCount({
      id: counted.id,
      number: counted.number,
      storeId: store.id,
      status,
      note: input.note,
      journalEntryId: applied?.entryId ?? null,
      lines: lines.map((line) => ({
        itemId: line.itemId,
        expectedQuantity: line.expectedQuantity,
        countedQuantity: line.countedQuantity,
      })),
    });
    if (applied !== undefined) {
      await this.recordApproved(tx, ctx, {
        counted,
        netMinor: applied.netMinor,
        autoApproved: true,
      });
    }
    return counted.id;
  }

  private async settle(
    tx: StockCountTx,
    ctx: OrgContext,
    now: { counted: Applied; stock: ReadonlyMap<string, StockLevel> }
  ): Promise<{ status: NewStockCount['status']; applied?: Posted }> {
    if (differingLines(now.counted.lines) === 0) {
      return { status: 'matched' };
    }
    if (await tx.approvalOn()) {
      return { status: 'submitted' };
    }
    return { status: 'approved', applied: await this.applyNow(tx, ctx, now) };
  }

  private async recordApproved(
    tx: StockCountTx,
    ctx: OrgContext,
    outcome: {
      counted: Applied;
      netMinor: number;
      autoApproved: boolean;
      ownRequest?: boolean;
    }
  ): Promise<void> {
    const { counted, ...write } = outcome;
    await tx.activity.recordMany(
      storeWriteOffApprovedActivity(
        await financeActorIn(ctx, tx),
        writeOffFacts(counted),
        { ...write, differences: differingLines(counted.lines) }
      )
    );
  }

  private async checkedItems(tx: StockCountTx, input: SubmitStockCount) {
    const ids = input.lines.map((line) => line.itemId);
    const found = await tx.items(ids);
    if (found.length !== ids.length) {
      throw new NotFoundException(ITEM_NOT_FOUND_MESSAGE);
    }
    const retired = found.find((item) => item.retiredAt !== null);
    if (retired !== undefined) {
      throw new BadRequestException(
        stockCountRetiredItemMessage(retired.displayName)
      );
    }
    return new Map(found.map((item) => [item.id, item]));
  }

  private async applyNow(
    tx: StockCountTx,
    ctx: OrgContext,
    now: { counted: Applied; stock: ReadonlyMap<string, StockLevel> }
  ): Promise<Posted> {
    const { counted, stock } = now;
    const plan = approvalPlan(counted.lines, stock);
    if (plan.status === 'moved') {
      throw new ConflictException(STOCK_MOVED_MESSAGE);
    }
    return this.apply(tx, ctx, { counted, plan });
  }

  private async apply(
    tx: StockCountTx,
    ctx: OrgContext,
    applied: { counted: Applied; plan: Ready }
  ): Promise<Posted> {
    const { counted, plan } = applied;
    await tx.insertMovements({
      id: counted.id,
      number: counted.number,
      storeId: counted.store.id,
      movements: plan.movements,
    });
    const accounts = await tx.systemAccounts();
    const posting = countPosting({
      organizationId: ctx.organizationId,
      number: counted.number,
      countId: counted.id,
      campusId: counted.store.campusId,
      effectiveOn: this.clock.today(),
      postedBy: ctx.user.id,
      ...accounts,
      netMinor: plan.netMinor,
    });
    return {
      entryId: posting === undefined ? undefined : await tx.post(posting),
      netMinor: plan.netMinor,
    };
  }
}
