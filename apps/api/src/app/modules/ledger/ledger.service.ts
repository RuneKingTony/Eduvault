import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  LEDGER_ACCOUNT_NOT_FOUND_MESSAGE,
  LEDGER_ACCOUNT_PARENT_MESSAGE,
  LEDGER_CODE_TAKEN_MESSAGE,
  MONEY_ACCOUNT_NOT_FOUND_MESSAGE,
  STUDENT_NOT_FOUND_MESSAGE,
  ledgerAccountDuplicateMessage,
  type CreateLedgerAccountInput,
  type JournalList,
  type JournalQuery,
  type LedgerAccount,
  type LedgerAccountList,
  type OpeningBalances,
  type OpeningBalancesResult,
} from '@eduvault/api-contract';
import type { OrgContext } from '../../common/auth';
import { Clock } from '../../common/clock';
import {
  FEE_INCOME_KEY,
  naturalBalance,
  rollUpChart,
  visibleChart,
} from '../../common/ledger';
import {
  LedgerRepository,
  type LedgerScope,
  type SystemAccounts,
} from './ledger.repository';
import {
  planMoneyAccountEntry,
  planStudentEntry,
  type PlannedEntry,
} from './opening-balances';

const scopeOf = (ctx: OrgContext): LedgerScope => ({
  organizationId: ctx.organizationId,
  campusScope: ctx.campusScope,
});

@Injectable()
export class LedgerService {
  constructor(
    private readonly ledger: LedgerRepository,
    private readonly clock: Clock
  ) {}

  async listAccounts(ctx: OrgContext): Promise<LedgerAccountList> {
    const [chart, currency] = await Promise.all([
      this.ledger.chart(scopeOf(ctx)),
      this.ledger.currency(ctx.organizationId),
    ]);
    return {
      currency,
      scoped: ctx.campusScope !== 'all',
      items: visibleChart(rollUpChart(chart)).map((account) => ({
        id: account.id,
        code: account.code,
        name: account.name,
        type: account.type,
        parentId: account.parentId,
        systemKey: account.systemKey,
        balanceMinor: naturalBalance(
          account.type,
          account.debitMinor,
          account.creditMinor
        ),
      })),
    };
  }

  async createAccount(
    ctx: OrgContext,
    input: CreateLedgerAccountInput
  ): Promise<LedgerAccount> {
    const parent = await this.ledger.findAccount(
      ctx.organizationId,
      input.parentId
    );
    if (parent === undefined) {
      throw new NotFoundException(LEDGER_ACCOUNT_NOT_FOUND_MESSAGE);
    }
    if (parent.systemKey !== FEE_INCOME_KEY) {
      throw new BadRequestException(LEDGER_ACCOUNT_PARENT_MESSAGE);
    }
    const name = input.name.trim();
    const outcome = await this.ledger.createAccount({
      organizationId: ctx.organizationId,
      parentId: parent.id,
      name,
    });
    switch (outcome.status) {
      case 'saved': {
        return outcome.account;
      }
      case 'name_taken': {
        throw new ConflictException(ledgerAccountDuplicateMessage(name));
      }
      case 'code_taken': {
        throw new ConflictException(LEDGER_CODE_TAKEN_MESSAGE);
      }
    }
  }

  journal(ctx: OrgContext, query: JournalQuery): Promise<JournalList> {
    return this.ledger.journal(scopeOf(ctx), query);
  }

  async postOpening(
    ctx: OrgContext,
    input: OpeningBalances
  ): Promise<OpeningBalancesResult> {
    const entries = await this.planOpening(ctx, input);
    const replays = await this.ledger.postOpening({
      organizationId: ctx.organizationId,
      userId: ctx.user.id,
      entries,
    });
    const skipped = entries.flatMap((entry, index) =>
      replays[index] === true
        ? [{ ...entry.subject, reason: 'already_posted' as const }]
        : []
    );
    return { posted: entries.length - skipped.length, skipped };
  }

  /** Every student and account is checked before anything posts, so a refusal posts nothing. */
  private async planOpening(
    ctx: OrgContext,
    input: OpeningBalances
  ): Promise<PlannedEntry[]> {
    const scope = scopeOf(ctx);
    const [campuses, accounts, system] = await Promise.all([
      this.ledger.studentCampuses(scope, {
        studentIds: input.items.map((item) => item.studentId),
        today: this.clock.today(),
      }),
      this.ledger.moneyAccounts(
        scope,
        input.moneyAccounts.map((item) => item.moneyAccountId)
      ),
      this.ledger.systemAccounts(ctx.organizationId),
    ]);
    return [
      ...input.items.map((item) =>
        planStudentEntry(item, studentTarget(campuses, item.studentId, system))
      ),
      ...input.moneyAccounts.map((item) => {
        const account = accounts.find((row) => row.id === item.moneyAccountId);
        if (account === undefined) {
          throw new NotFoundException(MONEY_ACCOUNT_NOT_FOUND_MESSAGE);
        }
        return planMoneyAccountEntry(item, {
          campusId: account.campusId,
          ledgerAccountId: account.ledgerAccountId,
          equityId: system.equityId,
        });
      }),
    ];
  }
}

function studentTarget(
  campuses: Map<string, string>,
  studentId: string,
  system: SystemAccounts
) {
  const campusId = campuses.get(studentId);
  if (campusId === undefined) {
    throw new NotFoundException(STUDENT_NOT_FOUND_MESSAGE);
  }
  return {
    campusId,
    receivableId: system.receivableId,
    equityId: system.equityId,
  };
}
