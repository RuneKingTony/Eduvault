import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  WALLET_NOT_FOUND_MESSAGE,
  WALLET_REFERENCE_TAKEN_MESSAGE,
  WALLET_STUDENT_NOT_FOUND_MESSAGE,
  walletEarmarkReleaseOverMessage,
  walletEarmarkSetOverMessage,
  walletSpendOverMessage,
  type Earmark,
  type EarmarkedWallet,
  type PortalWalletMovementList,
  type SetAutoPay,
  type SpendWallet,
  type SpentWallet,
  type Wallet,
  type WalletMovementQuery,
} from '@eduvault/api-contract';
import type { OrgContext } from '../../common/auth';
import { Clock } from '../../common/clock';
import { spendRequestHash } from '../../common/wallet';
import { WalletRepository, type EarmarkOutcome } from './wallet.repository';

const sumOf = (rows: readonly { amountMinor: number }[]): number =>
  rows.reduce((total, row) => total + row.amountMinor, 0);

@Injectable()
export class WalletPortalService {
  constructor(
    private readonly wallets: WalletRepository,
    private readonly clock: Clock
  ) {}

  async mine(ctx: OrgContext): Promise<Wallet> {
    const [currency, found] = await Promise.all([
      this.wallets.currency(ctx.organizationId),
      this.wallets.findOwnWallet(ctx.organizationId, ctx.user.id),
    ]);
    if (found === undefined) {
      throw new NotFoundException(WALLET_NOT_FOUND_MESSAGE);
    }
    return { currency, ...found };
  }

  async movements(
    ctx: OrgContext,
    query: WalletMovementQuery
  ): Promise<PortalWalletMovementList> {
    const [currency, page] = await Promise.all([
      this.wallets.currency(ctx.organizationId),
      this.wallets.ownMovements(ctx.organizationId, ctx.user.id, query),
    ]);
    if (page === undefined) {
      throw new NotFoundException(WALLET_NOT_FOUND_MESSAGE);
    }
    return { currency, ...page };
  }

  async setAutoPay(ctx: OrgContext, input: SetAutoPay): Promise<Wallet> {
    const wallet = await this.mine(ctx);
    const outcome = await this.wallets.setAutoPay({
      organizationId: ctx.organizationId,
      userId: ctx.user.id,
      walletId: wallet.id,
      enabled: input.enabled,
      reference: input.reference,
    });
    if (outcome.status === 'reference_used') {
      throw new ConflictException(WALLET_REFERENCE_TAKEN_MESSAGE);
    }
    return this.mine(ctx);
  }

  private childOf(wallet: Wallet, studentId: string) {
    const child = wallet.children.find((row) => row.studentId === studentId);
    if (child === undefined) {
      throw new NotFoundException(WALLET_STUDENT_NOT_FOUND_MESSAGE);
    }
    return child;
  }

  async spend(ctx: OrgContext, input: SpendWallet): Promise<SpentWallet> {
    const wallet = await this.mine(ctx);
    for (const line of input.lines) {
      this.childOf(wallet, line.studentId);
    }
    const requestHash = spendRequestHash(wallet.id, input);
    const existing = await this.wallets.findSpend(
      ctx.organizationId,
      input.reference
    );
    if (existing !== undefined) {
      if (
        existing.walletId !== wallet.id ||
        existing.requestHash !== requestHash
      ) {
        throw new ConflictException(WALLET_REFERENCE_TAKEN_MESSAGE);
      }
      return this.answer(ctx, input, { id: existing.id, replayed: true });
    }
    const outcome = await this.wallets.spend({
      organizationId: ctx.organizationId,
      userId: ctx.user.id,
      userName: ctx.user.name,
      walletId: wallet.id,
      reference: input.reference,
      requestHash,
      lines: input.lines,
      spentOn: this.clock.today(),
    });
    switch (outcome.status) {
      case 'spent':
      case 'replayed': {
        return this.answer(ctx, input, {
          id: outcome.id,
          replayed: outcome.status === 'replayed',
        });
      }
      case 'reference_used': {
        throw new ConflictException(WALLET_REFERENCE_TAKEN_MESSAGE);
      }
      case 'over': {
        throw new UnprocessableEntityException(
          walletSpendOverMessage(
            this.childOf(wallet, outcome.studentId).name,
            outcome.spendableMinor
          )
        );
      }
    }
  }

  private async answer(
    ctx: OrgContext,
    input: SpendWallet,
    done: { id: string; replayed: boolean }
  ): Promise<SpentWallet> {
    return {
      id: done.id,
      reference: input.reference,
      totalMinor: sumOf(input.lines),
      lines: input.lines,
      replayed: done.replayed,
      wallet: await this.mine(ctx),
    };
  }

  setAside(ctx: OrgContext, input: Earmark): Promise<EarmarkedWallet> {
    return this.earmark(ctx, 'set', input);
  }

  release(ctx: OrgContext, input: Earmark): Promise<EarmarkedWallet> {
    return this.earmark(ctx, 'release', input);
  }

  private async earmark(
    ctx: OrgContext,
    kind: 'set' | 'release',
    input: Earmark
  ): Promise<EarmarkedWallet> {
    const wallet = await this.mine(ctx);
    this.childOf(wallet, input.studentId);
    const outcome = await this.wallets.earmark({
      organizationId: ctx.organizationId,
      userId: ctx.user.id,
      userName: ctx.user.name,
      walletId: wallet.id,
      kind,
      reference: input.reference,
      studentId: input.studentId,
      amountMinor: input.amountMinor,
    });
    this.assertApplied(kind, outcome);
    return {
      replayed: outcome.status === 'replayed',
      wallet: await this.mine(ctx),
    };
  }

  private assertApplied(
    kind: 'set' | 'release',
    outcome: EarmarkOutcome
  ): asserts outcome is Exclude<
    EarmarkOutcome,
    { status: 'reference_used' | 'over' }
  > {
    if (outcome.status === 'reference_used') {
      throw new ConflictException(WALLET_REFERENCE_TAKEN_MESSAGE);
    }
    if (outcome.status === 'over') {
      throw new UnprocessableEntityException(
        kind === 'set'
          ? walletEarmarkSetOverMessage(outcome.limitMinor)
          : walletEarmarkReleaseOverMessage(outcome.limitMinor)
      );
    }
  }
}
