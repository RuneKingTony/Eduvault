import { Injectable, NotFoundException } from '@nestjs/common';
import {
  FINANCE_PAGE_SIZE,
  GUARDIAN_ACCOUNT_NOT_FOUND_MESSAGE,
  STUDENT_ACCOUNT_NOT_FOUND_MESSAGE,
  TERM_NOT_FOUND_MESSAGE,
  type BalanceList,
  type BalanceListQuery,
  type DashboardFinance,
  type FamilyStatementQuery,
  type GuardianStatement,
  type StatementQuery,
  type StudentStatement,
  type OwedByLife,
} from '@eduvault/api-contract';
import { can } from '@eduvault/policy';
import type { OrgContext } from '../../common/auth';
import { Clock } from '../../common/clock';
import { familyTotals, statementTotals, termSlice } from '../../common/ledger';
import {
  describeForFamily,
  describeMovement,
  pageOfRows,
  scopeNote,
  statementRowsOf,
  unpaidOf,
  withNet,
  type Describer,
  type MovementRecord,
} from './statement-assembly';
import {
  StudentAccountRepository,
  type AccountScope,
  type TermStart,
} from './student-account.repository';
import { termOptionsOf, termWindowsOf, type TermWindow } from './term-window';

export type OwnStatement = Omit<StudentStatement, 'student' | 'family'>;

interface StudentHistory {
  currency: string;
  movements: readonly MovementRecord[];
  terms: readonly TermStart[];
  today: string;
}

export type FamilyTermFields = Pick<GuardianStatement, 'term' | 'termOptions'>;

type TermFields = Pick<
  OwnStatement,
  'term' | 'broughtForward' | 'closingMinor'
>;

function windowOf(
  windows: readonly TermWindow[],
  termId: string | undefined
): TermWindow | undefined {
  const found = windows.find(({ id }) => id === termId);
  if (termId !== undefined && found === undefined) {
    throw new NotFoundException(TERM_NOT_FOUND_MESSAGE);
  }
  return found;
}

function familyTermOf(
  terms: readonly TermStart[],
  termId: string | undefined,
  today: string
): FamilyTermFields {
  const windows = termWindowsOf(terms);
  return {
    term: windowOf(windows, termId) ?? null,
    termOptions: termOptionsOf(windows, today),
  };
}

function shownIn(
  movements: readonly MovementRecord[],
  window: TermWindow | undefined
): { shown: readonly MovementRecord[] } & TermFields {
  if (window === undefined) {
    return {
      shown: movements,
      term: null,
      broughtForward: null,
      closingMinor: null,
    };
  }
  const { broughtForwardMinor, inTerm, closingMinor } = termSlice(
    movements.map((movement) => withNet(movement)),
    window
  );
  return {
    shown: inTerm,
    term: window,
    broughtForward: { amountMinor: broughtForwardMinor },
    closingMinor,
  };
}

function ownStatementOf(
  { currency, movements, terms, today }: StudentHistory,
  query: StatementQuery,
  describe: Describer
): OwnStatement {
  const windows = termWindowsOf(terms);
  const { shown, ...termFields } = shownIn(
    movements,
    windowOf(windows, query.termId)
  );
  const rows = statementRowsOf(shown, describe);
  const { items, page } = pageOfRows(rows, query.page, query.pageSize);
  return {
    currency,
    totals: statementTotals(movements),
    rows: items,
    total: rows.length,
    page,
    pageSize: query.pageSize,
    unpaid: unpaidOf(movements),
    termOptions: termOptionsOf(windows, today),
    ...termFields,
  };
}

function requireOwnStudents(ctx: OrgContext, studentIds: readonly string[]) {
  if (studentIds.some((id) => !ctx.studentScope.includes(id))) {
    throw new NotFoundException(STUDENT_ACCOUNT_NOT_FOUND_MESSAGE);
  }
}

interface Received {
  minor: number;
  count: number;
}

const whenReceived = <T extends object>(
  received: Received | undefined,
  fields: (received: Received) => T
): T | undefined => (received === undefined ? undefined : fields(received));

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
      this.receivedFor(ctx, scope),
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
        ...whenReceived(received, ({ minor, count }) => ({
          receivedThisTermMinor: minor,
          paymentsThisTerm: count,
        })),
        scopeNote: scopeNote(scope.campusScope === 'all' ? 'all' : names),
      },
    };
  }

  async dashboardFinance(ctx: OrgContext): Promise<DashboardFinance | null> {
    if (!(await this.accounts.hasCurrentTerm(ctx.organizationId))) {
      return null;
    }
    const scope = this.scopeOf(ctx);
    const [currency, counts, received] = await Promise.all([
      this.accounts.currency(ctx.organizationId),
      this.accounts.balanceCounts(scope),
      this.receivedFor(ctx, scope),
    ]);
    return {
      currency,
      owedMinor: counts.totalOwedMinor,
      owingStudents: counts.studentsOwing,
      ...whenReceived(received, ({ minor, count }) => ({
        receivedMinor: minor,
        paymentCount: count,
      })),
    };
  }

  async owedByLife(
    ctx: OrgContext
  ): Promise<{ currency: string; owed: OwedByLife }> {
    const [currency, owed] = await Promise.all([
      this.accounts.currency(ctx.organizationId),
      this.accounts.owedByLife(this.scopeOf(ctx)),
    ]);
    return { currency, owed };
  }

  private async receivedFor(
    ctx: OrgContext,
    scope: AccountScope
  ): Promise<Received | undefined> {
    return can(ctx.permissions, 'payment', 'read')
      ? this.accounts.receivedThisTerm(scope)
      : undefined;
  }

  async statement(
    ctx: OrgContext,
    studentId: string,
    query: StatementQuery
  ): Promise<StudentStatement> {
    return this.statementOf(ctx, studentId, { query });
  }

  private async statementOf(
    ctx: OrgContext,
    studentId: string,
    { query, terms }: { query: StatementQuery; terms?: readonly TermStart[] }
  ): Promise<StudentStatement> {
    const scope = this.scopeOf(ctx);
    const header = await this.accounts.studentHeader(scope, studentId);
    if (header === undefined) {
      throw new NotFoundException(STUDENT_ACCOUNT_NOT_FOUND_MESSAGE);
    }
    const [history, family] = await Promise.all([
      this.history(ctx.organizationId, studentId, terms),
      this.accounts.family(scope, studentId),
    ]);
    return {
      ...ownStatementOf(history, query, describeMovement),
      student: header,
      family,
    };
  }

  async familyTerm(
    ctx: OrgContext,
    termId: string | undefined
  ): Promise<FamilyTermFields> {
    return familyTermOf(
      await this.accounts.termWindows(ctx.organizationId),
      termId,
      this.clock.today()
    );
  }

  async guardianStatement(
    ctx: OrgContext,
    guardianId: string,
    query: FamilyStatementQuery
  ): Promise<GuardianStatement> {
    const found = await this.accounts.guardianChildren(
      this.scopeOf(ctx),
      guardianId
    );
    if (found === undefined) {
      throw new NotFoundException(GUARDIAN_ACCOUNT_NOT_FOUND_MESSAGE);
    }
    const terms = await this.accounts.termWindows(ctx.organizationId);
    const termFields = familyTermOf(terms, query.termId, this.clock.today());
    const [currency, children] = await Promise.all([
      this.accounts.currency(ctx.organizationId),
      Promise.all(
        found.studentIds.map((studentId) =>
          this.statementOf(ctx, studentId, {
            query: { pageSize: FINANCE_PAGE_SIZE, termId: query.termId },
            terms,
          })
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
      ...termFields,
    };
  }

  async ownStatement(
    ctx: OrgContext,
    studentId: string,
    query: StatementQuery
  ): Promise<OwnStatement> {
    requireOwnStudents(ctx, [studentId]);
    return ownStatementOf(
      await this.history(ctx.organizationId, studentId),
      query,
      describeForFamily
    );
  }

  async ownBalances(
    ctx: OrgContext,
    studentIds: readonly string[]
  ): Promise<{ currency: string; balances: Map<string, number> }> {
    requireOwnStudents(ctx, studentIds);
    const [currency, histories] = await Promise.all([
      this.accounts.currency(ctx.organizationId),
      Promise.all(
        studentIds.map((studentId) =>
          this.accounts.movements(ctx.organizationId, studentId)
        )
      ),
    ]);
    return {
      currency,
      balances: new Map(
        studentIds.map((studentId, index) => [
          studentId,
          statementTotals(histories[index] ?? []).balanceMinor,
        ])
      ),
    };
  }

  private async history(
    organizationId: string,
    studentId: string,
    loadedTerms?: readonly TermStart[]
  ): Promise<StudentHistory> {
    const [currency, movements, terms] = await Promise.all([
      this.accounts.currency(organizationId),
      this.accounts.movements(organizationId, studentId),
      loadedTerms ?? this.accounts.termWindows(organizationId),
    ]);
    return { currency, movements, terms, today: this.clock.today() };
  }
}
