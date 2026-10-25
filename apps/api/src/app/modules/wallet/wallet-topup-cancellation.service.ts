import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  WALLET_CANCEL_EXISTS_MESSAGE,
  WALLET_CANCEL_ONLINE_MESSAGE,
  WALLET_NOT_FOUND_MESSAGE,
  WALLET_REFERENCE_TAKEN_MESSAGE,
  WALLET_REQUEST_MONEY_GONE_MESSAGE,
  WALLET_TOPUP_NOT_FOUND_MESSAGE,
  walletCancelOverMessage,
  type RequestWalletCancellation,
  type RequestedWalletCancellation,
  type WalletCancellationRequest,
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
import { cancellationRequestHash } from './wallet-request-hash';
import {
  WalletRepository,
  type CancellationRequestOutcome,
  type ExistingEntry,
} from './wallet.repository';
import { WalletService } from './wallet.service';

@Injectable()
export class WalletTopUpCancellationService {
  constructor(
    private readonly wallets: WalletRepository,
    private readonly walletService: WalletService,
    private readonly clock: Clock
  ) {}

  async request(
    ctx: OrgContext,
    target: { walletId: string; topUpId: string },
    input: RequestWalletCancellation
  ): Promise<RequestedWalletCancellation> {
    const { walletId, topUpId } = target;
    await this.assertCancellable(ctx, target);
    const requestHash = cancellationRequestHash(target, input);
    const existing = await this.wallets.findCancellationRequest(
      ctx.organizationId,
      input.reference
    );
    if (existing !== undefined) {
      return this.replay(ctx, walletId, { existing, requestHash });
    }
    const outcome = await this.wallets.requestCancellation({
      organizationId: ctx.organizationId,
      userId: ctx.user.id,
      userName: ctx.user.name,
      walletId,
      topUpId,
      reference: input.reference,
      requestHash,
      reason: input.reason,
    });
    return this.answerOutcome(ctx, walletId, outcome);
  }

  async approve(
    ctx: OrgContext,
    id: string
  ): Promise<WalletCancellationRequest> {
    await decideRequest(this.wallets, ctx, {
      kind: 'wallet_topup_cancellation',
      id,
      run: async (ownRequest) => {
        const outcome = await this.wallets.approveCancellation({
          organizationId: ctx.organizationId,
          userId: ctx.user.id,
          userName: ctx.user.name,
          id,
          decidedOn: this.clock.today(),
          ownRequest,
        });
        if (outcome.status === 'money_gone') {
          throw new UnprocessableEntityException(
            WALLET_REQUEST_MONEY_GONE_MESSAGE
          );
        }
        return outcome.status === 'approved';
      },
    });
    return this.item(ctx, id);
  }

  async decline(
    ctx: OrgContext,
    id: string,
    reason: string
  ): Promise<WalletCancellationRequest> {
    await declineRequest(this.wallets, ctx, {
      kind: 'wallet_topup_cancellation',
      id,
      reason,
    });
    return this.item(ctx, id);
  }

  private async assertCancellable(
    ctx: OrgContext,
    target: { walletId: string; topUpId: string }
  ): Promise<void> {
    const scope = orgScopeOf(ctx);
    const [wallet, topUp] = await Promise.all([
      this.wallets.findWallet(scope, target.walletId),
      this.wallets.findTopUpToCancel(scope, target.walletId, target.topUpId),
    ]);
    if (wallet === undefined) {
      throw new NotFoundException(WALLET_NOT_FOUND_MESSAGE);
    }
    if (topUp === undefined) {
      throw new NotFoundException(WALLET_TOPUP_NOT_FOUND_MESSAGE);
    }
    if (topUp.kind === 'online') {
      throw new ConflictException(WALLET_CANCEL_ONLINE_MESSAGE);
    }
  }

  private replay(
    ctx: OrgContext,
    walletId: string,
    found: { existing: ExistingEntry; requestHash: string }
  ): Promise<RequestedWalletCancellation> {
    const { existing, requestHash } = found;
    assertReplay(existing, { walletId, requestHash });
    return this.answer(ctx, walletId, { id: existing.id, replayed: true });
  }

  private answerOutcome(
    ctx: OrgContext,
    walletId: string,
    outcome: CancellationRequestOutcome
  ): Promise<RequestedWalletCancellation> {
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
      case 'exists': {
        throw new ConflictException(WALLET_CANCEL_EXISTS_MESSAGE);
      }
      case 'over': {
        throw new UnprocessableEntityException(
          walletCancelOverMessage(outcome.topUpMinor, outcome.freeMinor)
        );
      }
    }
  }

  private async answer(
    ctx: OrgContext,
    walletId: string,
    done: { id: string; replayed: boolean }
  ): Promise<RequestedWalletCancellation> {
    const [request, wallet] = await Promise.all([
      this.item(ctx, done.id),
      this.walletService.get(ctx, walletId),
    ]);
    return { request, replayed: done.replayed, wallet };
  }

  private async item(
    ctx: OrgContext,
    id: string
  ): Promise<WalletCancellationRequest> {
    const found = await this.wallets.findRequest(
      orgScopeOf(ctx),
      'wallet_topup_cancellation',
      id
    );
    if (found?.kind !== 'wallet_topup_cancellation') {
      throw requestNotFound();
    }
    return found;
  }
}
