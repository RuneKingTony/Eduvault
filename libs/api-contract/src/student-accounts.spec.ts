import { contract } from './contract';
import {
  balanceListQuerySchema,
  guardianStatementParamsSchema,
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
