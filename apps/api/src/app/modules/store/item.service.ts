import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BOOK_LEVEL_REQUIRED_MESSAGE,
  BOOK_NO_SIZE_MESSAGE,
  ITEM_LEVEL_NOT_FOUND_MESSAGE,
  ITEM_NOT_FOUND_MESSAGE,
  ITEM_PRICE_BELOW_COST_MESSAGE,
  ITEM_RETIRED_EDIT_MESSAGE,
  UNIFORM_NO_LEVEL_MESSAGE,
  itemDisplayName,
  itemDuplicateMessage,
  type CreateItem,
  type Item,
  type ItemList,
  type ItemListQuery,
  type UpdateItem,
} from '@eduvault/api-contract';
import type { OrgContext } from '../../common/auth';
import { StoreRepository, type ItemRecord } from './store.repository';
import { isLow, stockTotalsOf, storesInView, withStock } from './store-view';

function refuseMismatch(input: Pick<CreateItem, 'kind' | 'classLevelId'>) {
  if (input.kind === 'book' && input.classLevelId === null) {
    throw new BadRequestException(BOOK_LEVEL_REQUIRED_MESSAGE);
  }
  if (input.kind === 'uniform' && input.classLevelId !== null) {
    throw new BadRequestException(UNIFORM_NO_LEVEL_MESSAGE);
  }
}

function refusePriceBelowCost(costMinor: number, sellMinor: number) {
  if (sellMinor < costMinor) {
    throw new BadRequestException(ITEM_PRICE_BELOW_COST_MESSAGE);
  }
}

@Injectable()
export class ItemService {
  constructor(private readonly store: StoreRepository) {}

  async list(ctx: OrgContext, query: ItemListQuery): Promise<ItemList> {
    const stores = await storesInView(this.store, ctx, query.campusId);
    const [records, totals] = await Promise.all([
      this.store.listItems(ctx.organizationId, {
        kind: query.kind,
        q: query.q,
        includeRetired: query.includeRetired,
      }),
      stockTotalsOf(this.store, ctx, stores),
    ]);
    const stocked = withStock(records, stores, totals);
    const matching = query.lowOnly ? stocked.filter(isLow) : stocked;
    const start = (query.page - 1) * query.pageSize;
    return {
      items: matching.slice(start, start + query.pageSize),
      total: matching.length,
    };
  }

  async create(ctx: OrgContext, input: CreateItem): Promise<Item> {
    refuseMismatch(input);
    refusePriceBelowCost(input.costPriceMinor, input.sellPriceMinor);
    if (input.kind === 'book' && input.variant !== null) {
      throw new BadRequestException(BOOK_NO_SIZE_MESSAGE);
    }
    if (input.classLevelId !== null) {
      const level = await this.store.classLevel(
        ctx.organizationId,
        input.classLevelId
      );
      if (level === undefined) {
        throw new NotFoundException(ITEM_LEVEL_NOT_FOUND_MESSAGE);
      }
    }
    const outcome = await this.store.insertItem({
      ...input,
      organizationId: ctx.organizationId,
      userId: ctx.user.id,
    });
    if (outcome.status === 'duplicate') {
      throw new ConflictException(itemDuplicateMessage(itemDisplayName(input)));
    }
    return this.present(ctx, outcome.item);
  }

  async update(ctx: OrgContext, id: string, input: UpdateItem): Promise<Item> {
    const current = await this.store.findItem(ctx.organizationId, id);
    if (current === undefined) {
      throw new NotFoundException(ITEM_NOT_FOUND_MESSAGE);
    }
    if (current.retiredAt !== null) {
      throw new ConflictException(ITEM_RETIRED_EDIT_MESSAGE);
    }
    const next = this.checkedEdit(current, input);
    const outcome = await this.store.updateItem({
      organizationId: ctx.organizationId,
      userId: ctx.user.id,
      itemId: id,
      name: input.name,
      variant: input.variant,
      costPriceMinor: input.costPriceMinor,
      sellPriceMinor: input.sellPriceMinor,
      lowStockLevel: input.lowStockLevel,
      retire: input.retired === true,
    });
    switch (outcome.status) {
      case 'updated': {
        return this.present(ctx, outcome.item);
      }
      case 'duplicate': {
        throw new ConflictException(itemDuplicateMessage(next.displayName));
      }
      case 'retired': {
        throw new ConflictException(ITEM_RETIRED_EDIT_MESSAGE);
      }
      case 'missing': {
        throw new NotFoundException(ITEM_NOT_FOUND_MESSAGE);
      }
    }
  }

  private checkedEdit(
    current: ItemRecord,
    input: UpdateItem
  ): { displayName: string } {
    const variant =
      input.variant === undefined ? current.variant : input.variant;
    if (current.kind === 'book' && variant !== null) {
      throw new BadRequestException(BOOK_NO_SIZE_MESSAGE);
    }
    refusePriceBelowCost(
      input.costPriceMinor ?? current.costPriceMinor,
      input.sellPriceMinor ?? current.sellPriceMinor
    );
    return {
      displayName: itemDisplayName({
        name: input.name ?? current.name,
        variant,
      }),
    };
  }

  private async present(ctx: OrgContext, record: ItemRecord): Promise<Item> {
    const stores = await storesInView(this.store, ctx);
    const totals = await stockTotalsOf(this.store, ctx, stores);
    const [item] = withStock([record], stores, totals);
    if (item === undefined) {
      throw new Error('The item could not be presented');
    }
    return item;
  }
}
