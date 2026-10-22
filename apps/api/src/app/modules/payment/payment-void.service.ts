import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  PAYMENT_NOT_FOUND_MESSAGE,
  PAYMENT_VOID_EXISTS_MESSAGE,
  PAYMENT_VOID_NOT_FOUND_MESSAGE,
  PAYMENT_VOID_NOT_RECORDED_MESSAGE,
  PAYMENT_VOID_OTHER_CAMPUS_MESSAGE,
  PAYMENT_VOID_REASON_MESSAGE,
  PAYMENT_VOID_STORE_SALE_MESSAGE,
  type PaymentVoidItem,
  type PaymentVoidList,
  type PaymentVoidListQuery,
  type RequestPaymentVoidInput,
  type RequestedPaymentVoid,
} from '@eduvault/api-contract';
import {
  financeActorIn,
  paymentCancellationDeclinedActivity,
  paymentCancelledActivity,
} from '../../common/activity';
import { assertDeclineReason, decide } from '../../common/approvals';
import type { OrgContext } from '../../common/auth';
import { Clock } from '../../common/clock';
import { mirrorLines, voidMemo, voidReference } from './payment-void-posting';
import {
  PaymentVoidRepository,
  type PaymentVoidTx,
  type VoidablePayment,
} from './payment-void.repository';
import { PaymentRepository } from './payment.repository';
import { orgScopeOf, type OrgScope } from '../../common/scope';

const paymentNotFound = () => new NotFoundException(PAYMENT_NOT_FOUND_MESSAGE);
const voidNotFound = () =>
  new NotFoundException(PAYMENT_VOID_NOT_FOUND_MESSAGE);

function assertWholePayment(payment: VoidablePayment): void {
  if (!payment.everyAllocationInScope) {
    throw new ForbiddenException(PAYMENT_VOID_OTHER_CAMPUS_MESSAGE);
  }
}

function assertVoidable(payment: VoidablePayment, hasOpenVoid: boolean): void {
  if (payment.storeSale !== null) {
    throw new ConflictException(PAYMENT_VOID_STORE_SALE_MESSAGE);
  }
  if (hasOpenVoid) {
    throw new ConflictException(PAYMENT_VOID_EXISTS_MESSAGE);
  }
  if (payment.status !== 'posted') {
    throw new ConflictException(PAYMENT_VOID_NOT_RECORDED_MESSAGE);
  }
}

@Injectable()
export class PaymentVoidService {
  constructor(
    private readonly payments: PaymentRepository,
    private readonly voids: PaymentVoidRepository,
    private readonly clock: Clock
  ) {}

  async list(
    ctx: OrgContext,
    query: PaymentVoidListQuery
  ): Promise<PaymentVoidList> {
    const [currency, page] = await Promise.all([
      this.payments.currency(ctx.organizationId),
      this.voids.listVoids(orgScopeOf(ctx), query),
    ]);
    return { currency, ...page };
  }

  async request(
    ctx: OrgContext,
    paymentId: string,
    input: RequestPaymentVoidInput
  ): Promise<RequestedPaymentVoid> {
    const reason = input.reason.trim();
    if (reason === '') {
      throw new BadRequestException(PAYMENT_VOID_REASON_MESSAGE);
    }
    const scope = orgScopeOf(ctx);
    const made = await this.voids.withTx(scope, ctx.user.id, async (tx) => {
      const payment = await tx.lockPayment(paymentId);
      if (payment === undefined) {
        throw paymentNotFound();
      }
      assertWholePayment(payment);
      assertVoidable(payment, await tx.hasOpenVoid(paymentId));
      if (await tx.approvalOn()) {
        const id = await tx.insertSubmitted({ paymentId, reason });
        await tx.setPaymentStatus(paymentId, 'void_pending');
        return { id, autoApproved: false };
      }
      const entryId = await this.postMirror(tx, payment, reason);
      const id = await tx.insertApproved({ paymentId, reason, entryId });
      await tx.setPaymentStatus(paymentId, 'voided');
      await this.recordCancelled(tx, ctx, { payment, autoApproved: true });
      return { id, autoApproved: true };
    });
    return {
      void: await this.item(scope, made.id),
      autoApproved: made.autoApproved,
    };
  }

  async approve(ctx: OrgContext, id: string): Promise<PaymentVoidItem> {
    const scope = orgScopeOf(ctx);
    await this.voids.withTx(scope, ctx.user.id, async (tx) => {
      const found = await tx.lockVoid(id);
      if (found === undefined) {
        throw voidNotFound();
      }
      assertWholePayment(found.payment);
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
          const entryId = await this.postMirror(
            tx,
            found.payment,
            found.reason
          );
          const changed = await tx.approve(id, entryId);
          if (changed) {
            await tx.setPaymentStatus(found.payment.id, 'voided');
            await this.recordCancelled(tx, ctx, {
              payment: found.payment,
              autoApproved: false,
              ownRequest,
            });
          }
          return changed;
        }
      );
    });
    return this.item(scope, id);
  }

  async decline(
    ctx: OrgContext,
    id: string,
    reason: string
  ): Promise<PaymentVoidItem> {
    const declineReason = assertDeclineReason(reason);
    const scope = orgScopeOf(ctx);
    await this.voids.withTx(scope, ctx.user.id, async (tx) => {
      const found = await tx.lockVoid(id);
      if (found === undefined) {
        throw voidNotFound();
      }
      await decide(
        {
          actorId: ctx.user.id,
          createdBy: found.createdBy,
          isOwner: ctx.isOwner,
        },
        async () => {
          const changed =
            found.status === 'submitted' &&
            (await tx.reject(id, declineReason));
          if (changed) {
            await tx.setPaymentStatus(found.payment.id, 'posted');
            await this.recordDeclined(tx, ctx, {
              payment: found.payment,
              voidId: id,
              reason: declineReason,
            });
          }
          return changed;
        }
      );
    });
    return this.item(scope, id);
  }

  private async item(scope: OrgScope, id: string): Promise<PaymentVoidItem> {
    const found = await this.voids.findVoid(scope, id);
    if (found === undefined) {
      throw voidNotFound();
    }
    return found;
  }

  private async recordCancelled(
    tx: PaymentVoidTx,
    ctx: OrgContext,
    cancelled: {
      payment: VoidablePayment;
      autoApproved: boolean;
      ownRequest?: boolean;
    }
  ): Promise<void> {
    await tx.activity.recordMany(
      paymentCancelledActivity(
        await financeActorIn(ctx, tx),
        cancelled.payment,
        {
          allocations: await tx.allocationShares(cancelled.payment.id),
          autoApproved: cancelled.autoApproved,
          ownRequest: cancelled.ownRequest,
        }
      )
    );
  }

  private async recordDeclined(
    tx: PaymentVoidTx,
    ctx: OrgContext,
    declined: { payment: VoidablePayment; voidId: string; reason: string }
  ): Promise<void> {
    await tx.activity.recordMany(
      paymentCancellationDeclinedActivity(
        await financeActorIn(ctx, tx),
        declined.payment,
        {
          voidId: declined.voidId,
          reason: declined.reason,
          allocations: await tx.allocationShares(declined.payment.id),
        }
      )
    );
  }

  private async postMirror(
    tx: PaymentVoidTx,
    payment: VoidablePayment,
    reason: string
  ): Promise<string> {
    return tx.post({
      reference: voidReference(payment.reference),
      kind: 'payment_void',
      effectiveOn: this.clock.today(),
      memo: voidMemo(payment.receiptNumber, reason),
      sourceId: payment.id,
      reversesEntryId: payment.entryId,
      lines: mirrorLines(await tx.originalLines(payment.entryId)),
    });
  }
}
