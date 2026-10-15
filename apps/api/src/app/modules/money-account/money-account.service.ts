import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  MONEY_ACCOUNT_BANK_NAME_MESSAGE,
  MONEY_ACCOUNT_NOT_FOUND_MESSAGE,
  MONEY_ACCOUNT_RETIRE_MESSAGE,
  MONEY_ACCOUNT_SCHOOL_WIDE_MESSAGE,
  moneyAccountDuplicateMessage,
  type CashBook,
  type CashBookQuery,
  type CreateMoneyAccountInput,
  type MoneyAccount,
  type MoneyAccountList,
  type UpdateMoneyAccountInput,
} from '@eduvault/api-contract';
import type { OrgContext } from '../../common/auth';
import { accountConflict } from '../../common/ledger';
import { CampusService } from '../campus/campus.service';
import {
  MoneyAccountRepository,
  type MoneyAccountOutcome,
  type MoneyAccountScope,
  type RecordingOption,
} from './money-account.repository';

const scopeOf = (ctx: OrgContext): MoneyAccountScope => ({
  organizationId: ctx.organizationId,
  campusScope: ctx.campusScope,
});

function accountOf(outcome: MoneyAccountOutcome, name: string): MoneyAccount {
  if (outcome.status === 'saved') {
    return outcome.account;
  }
  throw accountConflict(outcome.status, moneyAccountDuplicateMessage(name));
}

@Injectable()
export class MoneyAccountService {
  constructor(
    private readonly accounts: MoneyAccountRepository,
    private readonly campuses: CampusService
  ) {}

  private async require(ctx: OrgContext, id: string): Promise<MoneyAccount> {
    const found = await this.accounts.findById(scopeOf(ctx), id);
    if (found === undefined) {
      throw new NotFoundException(MONEY_ACCOUNT_NOT_FOUND_MESSAGE);
    }
    return found;
  }

  list(ctx: OrgContext): Promise<MoneyAccountList> {
    return this.accounts.list(scopeOf(ctx));
  }

  async cashBook(
    ctx: OrgContext,
    id: string,
    query: CashBookQuery
  ): Promise<CashBook> {
    const account = await this.require(ctx, id);
    const { items, total, currency } = await this.accounts.cashBook(
      scopeOf(ctx),
      account,
      query
    );
    return { currency, account, items, total };
  }

  async create(
    ctx: OrgContext,
    input: CreateMoneyAccountInput
  ): Promise<MoneyAccount> {
    if (input.campusId === null && ctx.campusScope !== 'all') {
      throw new ForbiddenException(MONEY_ACCOUNT_SCHOOL_WIDE_MESSAGE);
    }
    if (input.campusId !== null) {
      await this.campuses.assertInScope(ctx, input.campusId);
    }
    const name = input.name.trim();
    const outcome = await this.accounts.create({
      organizationId: ctx.organizationId,
      userId: ctx.user.id,
      name,
      kind: input.kind,
      bankName: input.kind === 'bank' ? (input.bankName ?? null) : null,
      last4: input.last4 ?? null,
      campusId: input.campusId,
    });
    return accountOf(outcome, name);
  }

  async update(
    ctx: OrgContext,
    id: string,
    input: UpdateMoneyAccountInput
  ): Promise<MoneyAccount> {
    const current = await this.require(ctx, id);
    if (input.retired === false) {
      throw new BadRequestException(MONEY_ACCOUNT_RETIRE_MESSAGE);
    }
    if (input.bankName !== undefined && current.kind !== 'bank') {
      throw new BadRequestException(MONEY_ACCOUNT_BANK_NAME_MESSAGE);
    }
    const outcome = await this.accounts.update(scopeOf(ctx), id, {
      name: input.name,
      bankName: input.bankName,
      last4: input.last4,
      retire: input.retired === true,
    });
    if (outcome === undefined) {
      throw new NotFoundException(MONEY_ACCOUNT_NOT_FOUND_MESSAGE);
    }
    return accountOf(outcome, input.name ?? current.name);
  }

  listForRecording(ctx: OrgContext): Promise<RecordingOption[]> {
    return this.accounts.recordingOptions(scopeOf(ctx));
  }
}
