import { Injectable, NotFoundException } from '@nestjs/common';
import {
  FINANCE_PAGE_SIZE,
  GUARDIAN_ACCOUNT_NOT_FOUND_MESSAGE,
  STUDENT_ACCOUNT_NOT_FOUND_MESSAGE,
  type BalanceList,
  type BalanceListQuery,
  type GuardianStatement,
  type StatementQuery,
  type StudentStatement,
} from '@eduvault/api-contract';
import type { OrgContext } from '../../common/auth';
import { Clock } from '../../common/clock';
import { familyTotals, statementTotals } from '../../common/ledger';
import {
  pageOfRows,
  scopeNote,
  statementRowsOf,
  unpaidOf,
} from './statement-assembly';
import {
  StudentAccountRepository,
  type AccountScope,
} from './student-account.repository';

@Injectable()
export class StudentAccountService {
  constructor(
    private readonly accounts: StudentAccountRepository,
    private readonly clock: Clock
  ) {}

  private scopeOf(ctx: OrgContext): AccountScope {
    return {
      organizationId: ctx.organizationId,
      campusScope: ctx.campusScope,
      today: this.clock.today(),
    };
  }

  async balances(
    ctx: OrgContext,
    query: BalanceListQuery
  ): Promise<BalanceList> {
    const scope = this.scopeOf(ctx);
    const [currency, page, counts, received, names] = await Promise.all([
      this.accounts.currency(ctx.organizationId),
      this.accounts.balancePage(scope, query),
      this.accounts.balanceCounts(scope),
      this.accounts.receivedThisTerm(scope),
      scope.campusScope === 'all'
        ? Promise.resolve<string[]>([])
        : this.accounts.campusNames(scope),
    ]);
    return {
      currency,
      total: page.total,
      items: page.items.map(({ kindMovements, ...row }) => {
        const { totalMinor, paidMinor } = statementTotals(kindMovements);
        return { ...row, totalMinor, paidMinor };
      }),
      summary: {
        ...counts,
        receivedThisTermMinor: received.minor,
        paymentsThisTerm: received.count,
        scopeNote: scopeNote(scope.campusScope === 'all' ? 'all' : names),
      },
    };
  }

  async statement(
    ctx: OrgContext,
    studentId: string,
    query: StatementQuery
  ): Promise<StudentStatement> {
    const scope = this.scopeOf(ctx);
    const header = await this.accounts.studentHeader(scope, studentId);
    if (header === undefined) {
      throw new NotFoundException(STUDENT_ACCOUNT_NOT_FOUND_MESSAGE);
    }
    const [currency, movements, family] = await Promise.all([
      this.accounts.currency(ctx.organizationId),
      this.accounts.movements(ctx.organizationId, studentId),
      this.accounts.family(scope, studentId),
    ]);
    const rows = statementRowsOf(movements);
    const { items, page } = pageOfRows(rows, query.page, query.pageSize);
    return {
      currency,
      student: header,
      totals: statementTotals(movements),
      rows: items,
      total: rows.length,
      page,
      pageSize: query.pageSize,
      unpaid: unpaidOf(movements),
      family,
    };
  }

  async guardianStatement(
    ctx: OrgContext,
    guardianId: string
  ): Promise<GuardianStatement> {
    const found = await this.accounts.guardianChildren(
      this.scopeOf(ctx),
      guardianId
    );
    if (found === undefined) {
      throw new NotFoundException(GUARDIAN_ACCOUNT_NOT_FOUND_MESSAGE);
    }
    const [currency, children] = await Promise.all([
      this.accounts.currency(ctx.organizationId),
      Promise.all(
        found.studentIds.map((studentId) =>
          this.statement(ctx, studentId, { pageSize: FINANCE_PAGE_SIZE })
        )
      ),
    ]);
    const { owedMinor, creditMinor } = familyTotals(
      children.map((child) => child.totals.balanceMinor)
    );
    return {
      currency,
      guardian: found.guardian,
      familyTotalMinor: owedMinor,
      creditMinor,
      children,
    };
  }
}
