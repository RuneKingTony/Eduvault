import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  WALLET_ACCOUNT_NOT_FOUND_MESSAGE,
  WALLET_ACCOUNT_RETIRED_MESSAGE,
  WALLET_NOT_FOUND_MESSAGE,
  WALLET_PAYOUT_REFERENCE_TAKEN_MESSAGE,
  WALLET_REFERENCE_TAKEN_MESSAGE,
  WALLET_REFUND_ACCOUNT_MESSAGE,
  WALLET_REFUND_PAYOUT_ACCOUNT_MESSAGE,
  WALLET_REFUND_PROOF_NOT_FOUND_MESSAGE,
  WALLET_REFUND_PROOF_TAKEN_MESSAGE,
  WALLET_REQUEST_MONEY_GONE_MESSAGE,
  walletRefundOverMessage,
  type ApproveWalletRefundInput,
  type RequestWalletRefund,
  type RequestedWalletRefund,
  type WalletRefundRequest,
} from '@eduvault/api-contract';
import type { OrgContext } from '../../common/auth';
import { Clock } from '../../common/clock';
import { orgScopeOf } from '../../common/scope';
import {
  assertReplay,
  declineRequest,
  decideRequest,
  requestNotFound,
} from './wallet-request-decision';
import { refundRequestHash } from './wallet-request-hash';
import {
  WalletRepository,
  type ApprovalOutcome,
  type NewRefundRequest,
} from './wallet.repository';
import { WalletService } from './wallet.service';

const walletNotFound = () => new NotFoundException(WALLET_NOT_FOUND_MESSAGE);

function settled(outcome: ApprovalOutcome): boolean {
  switch (outcome.status) {
    case 'approved': {
      return true;
    }
    case 'decided': {
      return false;
    }
    case 'money_gone': {
      throw new UnprocessableEntityException(WALLET_REQUEST_MONEY_GONE_MESSAGE);
    }
    case 'account_unusable': {
      throw new UnprocessableEntityException(
        WALLET_REFUND_PAYOUT_ACCOUNT_MESSAGE
      );
    }
    case 'payout_reference_used': {
      throw new ConflictException(WALLET_PAYOUT_REFERENCE_TAKEN_MESSAGE);
    }
  }
}

@Injectable()
export class WalletRefundService {
  constructor(
    private readonly wallets: WalletRepository,
    private readonly walletService: WalletService,
    private readonly clock: Clock
  ) {}

  async request(
    ctx: OrgContext,
    walletId: string,
    input: RequestWalletRefund
  ): Promise<RequestedWalletRefund> {
    const [inScope, existing] = await Promise.all([
      this.wallets.walletInScope(orgScopeOf(ctx), walletId),
      this.wallets.findRefundRequest(ctx.organizationId, input.reference),
    ]);
    if (!inScope) {
      throw walletNotFound();
    }
    const requestHash = refundRequestHash(walletId, input);
    if (existing !== undefined) {
      assertReplay(existing, { walletId, requestHash });
      return this.answer(ctx, walletId, { id: existing.id, replayed: true });
    }
    await this.validate(ctx, input);
    const outcome = await this.wallets.requestRefund(
      this.newRequest(ctx, { walletId, input, requestHash })
    );
    switch (outcome.status) {
      case 'requested':
      case 'replayed': {
        return this.answer(ctx, walletId, {
          id: outcome.id,
          replayed: outcome.status === 'replayed',
        });
      }
      case 'reference_used': {
        throw new ConflictException(WALLET_REFERENCE_TAKEN_MESSAGE);
      }
      case 'proof_taken': {
        throw new ConflictException(WALLET_REFUND_PROOF_TAKEN_MESSAGE);
      }
      case 'over': {
        throw new UnprocessableEntityException(
          walletRefundOverMessage(outcome.limitMinor)
        );
      }
    }
  }

  async approve(
    ctx: OrgContext,
    id: string,
    input: ApproveWalletRefundInput
  ): Promise<WalletRefundRequest> {
    await decideRequest(this.wallets, ctx, {
      kind: 'wallet_refund',
      id,
      run: async (ownRequest) =>
        settled(
          await this.wallets.approveRefund({
            organizationId: ctx.organizationId,
            userId: ctx.user.id,
            userName: ctx.user.name,
            id,
            decidedOn: this.clock.today(),
            ownRequest,
            payoutReference: input.payoutReference.trim(),
          })
        ),
    });
    return this.item(ctx, id);
  }

  async decline(
    ctx: OrgContext,
    id: string,
    reason: string
  ): Promise<WalletRefundRequest> {
    await declineRequest(this.wallets, ctx, {
      kind: 'wallet_refund',
      id,
      reason,
    });
    return this.item(ctx, id);
  }

  private newRequest(
    ctx: OrgContext,
    asked: { walletId: string; input: RequestWalletRefund; requestHash: string }
  ): NewRefundRequest {
    const { walletId, input, requestHash } = asked;
    return {
      organizationId: ctx.organizationId,
      userId: ctx.user.id,
      userName: ctx.user.name,
      walletId,
      reference: input.reference,
      requestHash,
      moneyAccountId: input.moneyAccountId,
      amountMinor: input.amountMinor,
      parentEmail: input.parentEmail,
      reason: input.reason,
      proofFileId: input.proofFileId,
    };
  }

  private async validate(
    ctx: OrgContext,
    input: RequestWalletRefund
  ): Promise<void> {
    const [account, proof] = await Promise.all([
      this.wallets.recordingAccount(orgScopeOf(ctx), input.moneyAccountId),
      this.wallets.refundProof(
        ctx.organizationId,
        ctx.user.id,
        input.proofFileId
      ),
    ]);
    if (account.status === 'missing') {
      throw new NotFoundException(WALLET_ACCOUNT_NOT_FOUND_MESSAGE);
    }
    if (account.status === 'retired') {
      throw new BadRequestException(WALLET_ACCOUNT_RETIRED_MESSAGE);
    }
    if (account.status === 'gateway' || account.kind !== 'bank') {
      throw new BadRequestException(WALLET_REFUND_ACCOUNT_MESSAGE);
    }
    if (proof === 'missing') {
      throw new NotFoundException(WALLET_REFUND_PROOF_NOT_FOUND_MESSAGE);
    }
    if (proof === 'taken') {
      throw new ConflictException(WALLET_REFUND_PROOF_TAKEN_MESSAGE);
    }
  }

  private async answer(
    ctx: OrgContext,
    walletId: string,
    done: { id: string; replayed: boolean }
  ): Promise<RequestedWalletRefund> {
    const [request, wallet] = await Promise.all([
      this.item(ctx, done.id),
      this.walletService.get(ctx, walletId),
    ]);
    return { request, replayed: done.replayed, wallet };
  }

  private async item(
    ctx: OrgContext,
    id: string
  ): Promise<WalletRefundRequest> {
    const found = await this.wallets.findRequest(
      orgScopeOf(ctx),
      'wallet_refund',
      id
    );
    if (found?.kind !== 'wallet_refund') {
      throw requestNotFound();
    }
    return found;
  }
}
