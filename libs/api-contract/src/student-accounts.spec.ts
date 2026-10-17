import { contract } from './contract';
import {
  ROW_STATUS_LABELS,
  STATEMENT_ROW_STATUSES,
  balanceListQuerySchema,
  guardianStatementParamsSchema,
  isOwingStatus,
  statementQuerySchema,
} from './student-accounts';

describe('balanceListQuerySchema', () => {
  it('opens on the Owing filter, page 1, 10 rows', () => {
    expect(balanceListQuerySchema.parse({})).toEqual({
      filter: 'owing',
      page: 1,
      pageSize: 10,
    });
  });

  it('takes the five filters and refuses any other', () => {
    for (const filter of [
      'owing',
      'owing_current',
      'owing_gone',
      'paid',
      'all',
    ]) {
      expect(balanceListQuerySchema.parse({ filter }).filter).toBe(filter);
    }
    expect(balanceListQuerySchema.safeParse({ filter: 'rich' }).success).toBe(
      false
    );
  });

  it('trims the search', () => {
    expect(balanceListQuerySchema.parse({ q: '  GF-01 ' }).q).toBe('GF-01');
  });
});

describe('statementQuerySchema', () => {
  it('leaves the page open so the statement can open on its last page', () => {
    expect(statementQuerySchema.parse({})).toEqual({ pageSize: 10 });
    expect(statementQuerySchema.parse({ page: '2' }).page).toBe(2);
  });

  it('refuses a page below 1', () => {
    expect(statementQuerySchema.safeParse({ page: '0' }).success).toBe(false);
  });
});

describe('studentAccounts routes', () => {
  it('reads balances, one statement and a family statement', () => {
    expect(contract.studentAccounts.balances.path).toBe('/finance/balances');
    expect(contract.studentAccounts.statement.path).toBe(
      '/finance/students/:studentId/statement'
    );
    expect(contract.studentAccounts.guardianStatement.path).toBe(
      '/finance/guardians/:guardianId/statement'
    );
    expect(
      guardianStatementParamsSchema.safeParse({ guardianId: 'nope' }).success
    ).toBe(false);
  });
});

describe('the statement row statuses', () => {
  it('label every status in plain words', () => {
    expect(Object.keys(ROW_STATUS_LABELS)).toEqual([...STATEMENT_ROW_STATUSES]);
    expect(ROW_STATUS_LABELS.cancelled).toBe('Payment cancelled');
    expect(ROW_STATUS_LABELS.refunded).toBe('Refunded');
  });

  it('count charged, cancelled and refunded rows as owing and paid and reduced as not', () => {
    expect(
      STATEMENT_ROW_STATUSES.filter((status) => isOwingStatus(status))
    ).toEqual(['charged', 'cancelled', 'refunded']);
  });
});
