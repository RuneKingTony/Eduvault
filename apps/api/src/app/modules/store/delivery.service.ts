import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DELIVERY_ACCOUNT_MESSAGE,
  DELIVERY_DUPLICATE_ITEM_MESSAGE,
  DELIVERY_FUTURE_DATE_MESSAGE,
  DELIVERY_OPENING_ACCOUNT_MESSAGE,
  DELIVERY_REFERENCE_TAKEN_MESSAGE,
  DELIVERY_REQUIRED_MESSAGE,
  ITEM_NOT_FOUND_MESSAGE,
  MONEY_ACCOUNT_NOT_FOUND_MESSAGE,
  deliveryReferenceUsedMessage,
  deliveryRetiredItemMessage,
  openingStockRecordedMessage,
  type RecordDelivery,
  type RecordedDelivery,
} from '@eduvault/api-contract';
import type { OrgContext } from '../../common/auth';
import { Clock } from '../../common/clock';
import {
  financeActorIn,
  storeDeliveryReceivedActivity,
  storeOpeningStockRecordedActivity,
} from '../../common/activity';
import { documentYear } from '../../common/documents';
import { deliveryRequestHash } from './delivery-request-hash';
import {
  StoreRepository,
  type DeliveryActivity,
  type ExistingDelivery,
  type StoreRef,
} from './store.repository';
import { deliveryInScope, storeInView } from './store-view';
import { orgScopeOf, type OrgScope } from '../../common/scope';

interface Checked {
  store: StoreRef;
  receivedOn: string;
  moneyAccount: { id: string; ledgerAccountId: string } | null;
}

@Injectable()
export class DeliveryService {
  constructor(
    private readonly store: StoreRepository,
    private readonly clock: Clock
  ) {}

  async record(
    ctx: OrgContext,
    input: RecordDelivery
  ): Promise<RecordedDelivery> {
    const requestHash = deliveryRequestHash(input);
    const existing = await this.store.findDeliveryByReference(
      ctx.organizationId,
      input.reference
    );
    if (existing !== undefined) {
      return this.replay(ctx, existing, { input, requestHash });
    }
    const checked = await this.validate(ctx, input);
    const isOpening = input.isOpening === true;
    const outcome = await this.store.insertDelivery(
      {
        organizationId: ctx.organizationId,
        userId: ctx.user.id,
        year: documentYear(this.clock),
        reference: input.reference,
        requestHash,
        store: checked.store,
        supplierName: input.supplierName,
        isOpening,
        receivedOn: checked.receivedOn,
        moneyAccount: checked.moneyAccount,
        lines: input.lines,
      },
      await this.activityFor(ctx, input, checked.store)
    );
    switch (outcome.status) {
      case 'recorded':
      case 'replayed': {
        const detail = await deliveryInScope(this.store, ctx, outcome.id);
        return { ...detail, replayed: outcome.status === 'replayed' };
      }
      case 'reference_used': {
        throw new ConflictException(
          deliveryReferenceUsedMessage(input.reference, outcome.number)
        );
      }
      case 'opening_exists': {
        throw new ConflictException(
          openingStockRecordedMessage(checked.store.campusName)
        );
      }
    }
  }

  private async activityFor(
    ctx: OrgContext,
    input: RecordDelivery,
    store: StoreRef
  ): Promise<DeliveryActivity> {
    const actor = await financeActorIn(ctx, {
      currency: () => this.store.currency(ctx.organizationId),
    });
    const build =
      input.isOpening === true
        ? storeOpeningStockRecordedActivity
        : storeDeliveryReceivedActivity;
    return (delivery) =>
      build(actor, {
        ...delivery,
        storeId: store.id,
        campusId: store.campusId,
        campusName: store.campusName,
        supplierName: input.supplierName,
        lines: input.lines.length,
      });
  }

  private async replay(
    ctx: OrgContext,
    existing: ExistingDelivery,
    request: { input: RecordDelivery; requestHash: string }
  ): Promise<RecordedDelivery> {
    const visible = await this.store.findDelivery(orgScopeOf(ctx), existing.id);
    if (visible === undefined) {
      throw new ConflictException(DELIVERY_REFERENCE_TAKEN_MESSAGE);
    }
    if (existing.requestHash !== request.requestHash) {
      throw new ConflictException(
        deliveryReferenceUsedMessage(request.input.reference, existing.number)
      );
    }
    return { ...visible, replayed: true };
  }

  private async validate(
    ctx: OrgContext,
    input: RecordDelivery
  ): Promise<Checked> {
    const scope = orgScopeOf(ctx);
    const store = await storeInView(this.store, ctx, input.campusId);
    if (
      input.isOpening === true &&
      (await this.store.hasOpeningStock(ctx.organizationId, store.id))
    ) {
      throw new ConflictException(
        openingStockRecordedMessage(store.campusName)
      );
    }
    const receivedOn = input.receivedOn ?? this.clock.today();
    if (receivedOn > this.clock.today()) {
      throw new BadRequestException(DELIVERY_FUTURE_DATE_MESSAGE);
    }
    await this.checkLines(scope, input);
    const moneyAccount = await this.checkAccount(scope, input);
    return { store, receivedOn, moneyAccount };
  }

  private async checkLines(
    scope: OrgScope,
    input: RecordDelivery
  ): Promise<void> {
    if (input.lines.length === 0) {
      throw new BadRequestException(DELIVERY_REQUIRED_MESSAGE);
    }
    const ids = input.lines.map((line) => line.itemId);
    if (new Set(ids).size !== ids.length) {
      throw new BadRequestException(DELIVERY_DUPLICATE_ITEM_MESSAGE);
    }
    const items = await this.store.findItems(scope.organizationId, ids);
    if (items.length !== ids.length) {
      throw new NotFoundException(ITEM_NOT_FOUND_MESSAGE);
    }
    const retired = items.find((item) => item.retiredAt !== null);
    if (retired !== undefined) {
      throw new BadRequestException(
        deliveryRetiredItemMessage(retired.displayName)
      );
    }
  }

  private async checkAccount(
    scope: OrgScope,
    input: RecordDelivery
  ): Promise<Checked['moneyAccount']> {
    if (input.isOpening === true) {
      if (input.moneyAccountId !== undefined) {
        throw new BadRequestException(DELIVERY_OPENING_ACCOUNT_MESSAGE);
      }
      return null;
    }
    if (input.moneyAccountId === undefined) {
      throw new BadRequestException(DELIVERY_ACCOUNT_MESSAGE);
    }
    const account = await this.store.moneyAccount(scope, input.moneyAccountId);
    if (account.status === 'missing') {
      throw new NotFoundException(MONEY_ACCOUNT_NOT_FOUND_MESSAGE);
    }
    if (
      account.status !== 'ok' ||
      (account.campusId !== null && account.campusId !== input.campusId)
    ) {
      throw new BadRequestException(DELIVERY_ACCOUNT_MESSAGE);
    }
    return {
      id: input.moneyAccountId,
      ledgerAccountId: account.ledgerAccountId,
    };
  }
}
