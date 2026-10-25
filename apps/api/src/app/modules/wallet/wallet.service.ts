import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  WALLET_ACCOUNT_GATEWAY_MESSAGE,
  WALLET_ACCOUNT_METHOD_MESSAGE,
  WALLET_ACCOUNT_NOT_FOUND_MESSAGE,
  WALLET_ACCOUNT_RETIRED_MESSAGE,
  WALLET_FUTURE_DATE_MESSAGE,
  WALLET_METHOD_OFF_MESSAGE,
  WALLET_NOT_FOUND_MESSAGE,
  WALLET_NOT_PAYING_MESSAGE,
  WALLET_PROOF_NOT_FOUND_MESSAGE,
  WALLET_PROOF_TAKEN_MESSAGE,
  WALLET_REFERENCE_TAKEN_MESSAGE,
  accountTakesMethod,
  type TopUpOptions,
  type TopUpWallet,
  type ToppedUpWallet,
  type RefundOptions,
  type Wallet,
  type WalletList,
  type WalletListQuery,
  type WalletMovementList,
  type WalletMovementQuery,
} from '@eduvault/api-contract';
import type { OrgContext } from '../../common/auth';
import { Clock } from '../../common/clock';
import { orgScopeOf, type OrgScope } from '../../common/scope';
import { MoneyAccountService } from '../money-account/money-account.service';
import { topUpRequestHash } from './wallet-request-hash';
import { WalletRepository } from './wallet.repository';

const notFound = () => new NotFoundException(WALLET_NOT_FOUND_MESSAGE);

@Injectable()
export class WalletService {
  constructor(
    private readonly wallets: WalletRepository,
    private readonly clock: Clock,
    private readonly moneyAccounts: MoneyAccountService
  ) {}

  async topUpOptions(ctx: OrgContext): Promise<TopUpOptions> {
    const [currency, methods, accounts] = await Promise.all([
      this.wallets.currency(ctx.organizationId),
      this.wallets.paymentMethods(ctx.organizationId),
      this.moneyAccounts.listForRecording(ctx),
    ]);
    return { currency, today: this.clock.today(), accounts, methods };
  }

  async refundOptions(ctx: OrgContext): Promise<RefundOptions> {
    const [currency, accounts] = await Promise.all([
      this.wallets.currency(ctx.organizationId),
      this.moneyAccounts.listForRecording(ctx),
    ]);
    return {
      currency,
      accounts: accounts.filter((account) => account.kind === 'bank'),
    };
  }

  async list(ctx: OrgContext, query: WalletListQuery): Promise<WalletList> {
    const [currency, page] = await Promise.all([
      this.wallets.currency(ctx.organizationId),
      this.wallets.list(orgScopeOf(ctx), query),
    ]);
    return { currency, ...page };
  }

  async get(ctx: OrgContext, walletId: string): Promise<Wallet> {
    const [currency, found] = await Promise.all([
      this.wallets.currency(ctx.organizationId),
      this.wallets.findWallet(orgScopeOf(ctx), walletId),
    ]);
    if (found === undefined) {
      throw notFound();
    }
    return { currency, ...found };
  }

  async movements(
    ctx: OrgContext,
    walletId: string,
    query: WalletMovementQuery
  ): Promise<WalletMovementList> {
    const scope = orgScopeOf(ctx);
    if ((await this.wallets.findWallet(scope, walletId)) === undefined) {
      throw notFound();
    }
    const [currency, page] = await Promise.all([
      this.wallets.currency(ctx.organizationId),
      this.wallets.movements(scope, walletId, query),
    ]);
    return { currency, ...page };
  }

  async topUp(
    ctx: OrgContext,
    walletId: string,
    input: TopUpWallet
  ): Promise<ToppedUpWallet> {
    const scope = orgScopeOf(ctx);
    if ((await this.wallets.findWallet(scope, walletId)) === undefined) {
      throw notFound();
    }
    const requestHash = topUpRequestHash(walletId, input);
    const existing = await this.wallets.findTopUp(
      ctx.organizationId,
      input.reference
    );
    if (existing !== undefined) {
      if (
        existing.walletId !== walletId ||
        existing.requestHash !== requestHash
      ) {
        throw new ConflictException(WALLET_REFERENCE_TAKEN_MESSAGE);
      }
      return this.answer(ctx, walletId, {
        id: existing.id,
        input,
        replayed: true,
      });
    }
    const account = await this.validate(ctx, walletId, input);
    const outcome = await this.wallets.insertTopUp({
      organizationId: ctx.organizationId,
      userId: ctx.user.id,
      userName: ctx.user.name,
      walletId,
      reference: input.reference,
      requestHash,
      moneyAccountId: input.moneyAccountId,
      ledgerAccountId: account.ledgerAccountId,
      accountCampusId: account.campusId,
      method: input.method,
      amountMinor: input.amountMinor,
      receivedOn: input.receivedOn,
      depositorName: input.depositorName ?? null,
      proofFileId: input.proofFileId,
    });
    if (outcome.status === 'recorded' || outcome.status === 'replayed') {
      return this.answer(ctx, walletId, {
        id: outcome.id,
        input,
        replayed: outcome.status === 'replayed',
      });
    }
    throw new ConflictException(
      outcome.status === 'proof_taken'
        ? WALLET_PROOF_TAKEN_MESSAGE
        : WALLET_REFERENCE_TAKEN_MESSAGE
    );
  }

  private async answer(
    ctx: OrgContext,
    walletId: string,
    done: { id: string; input: TopUpWallet; replayed: boolean }
  ): Promise<ToppedUpWallet> {
    const wallet = await this.get(ctx, walletId);
    return {
      id: done.id,
      reference: done.input.reference,
      amountMinor: done.input.amountMinor,
      method: done.input.method,
      receivedOn: done.input.receivedOn,
      replayed: done.replayed,
      wallet,
    };
  }

  private async validate(
    ctx: OrgContext,
    walletId: string,
    input: TopUpWallet
  ): Promise<{ ledgerAccountId: string; campusId: string | null }> {
    const scope = orgScopeOf(ctx);
    if (!(await this.wallets.guardianPays(ctx.organizationId, walletId))) {
      throw new BadRequestException(WALLET_NOT_PAYING_MESSAGE);
    }
    const methods = await this.wallets.paymentMethods(ctx.organizationId);
    if (!methods[input.method]) {
      throw new BadRequestException(WALLET_METHOD_OFF_MESSAGE);
    }
    if (input.receivedOn > this.clock.today()) {
      throw new BadRequestException(WALLET_FUTURE_DATE_MESSAGE);
    }
    const account = await this.usableAccount(scope, input);
    const proof = await this.wallets.proof(
      ctx.organizationId,
      ctx.user.id,
      input.proofFileId
    );
    if (proof === 'missing') {
      throw new NotFoundException(WALLET_PROOF_NOT_FOUND_MESSAGE);
    }
    if (proof === 'taken') {
      throw new ConflictException(WALLET_PROOF_TAKEN_MESSAGE);
    }
    return account;
  }

  private async usableAccount(scope: OrgScope, input: TopUpWallet) {
    const account = await this.wallets.recordingAccount(
      scope,
      input.moneyAccountId
    );
    if (account.status === 'missing') {
      throw new NotFoundException(WALLET_ACCOUNT_NOT_FOUND_MESSAGE);
    }
    if (account.status === 'retired') {
      throw new BadRequestException(WALLET_ACCOUNT_RETIRED_MESSAGE);
    }
    if (account.status === 'gateway') {
      throw new BadRequestException(WALLET_ACCOUNT_GATEWAY_MESSAGE);
    }
    if (!accountTakesMethod(account.kind, input.method)) {
      throw new BadRequestException(WALLET_ACCOUNT_METHOD_MESSAGE);
    }
    return account;
  }
}
