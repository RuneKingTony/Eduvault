import { z } from 'zod';
import { contract } from './contract';
import {
  ROW_STATUS_LABELS,
  STATEMENT_ROW_STATUSES,
  balanceListQuerySchema,
  familyStatementQuerySchema,
  familyTermFields,
  guardianStatementParamsSchema,
  isOwingStatus,
  rowStatusLabel,
  rowTone,
  statementQuerySchema,
  statementTermFields,
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

  it('takes an optional term id and refuses anything that is not an id', () => {
    const id = '0198a4b2-3c5d-7e6f-8a9b-0c1d2e3f4a5b';
    expect(statementQuerySchema.parse({ termId: id }).termId).toBe(id);
    expect(statementQuerySchema.parse({}).termId).toBeUndefined();
    expect(statementQuerySchema.safeParse({ termId: 'nope' }).success).toBe(
      false
    );
  });
});

describe('familyStatementQuerySchema', () => {
  it('takes an optional term id and no paging', () => {
    const id = '0198a4b2-3c5d-7e6f-8a9b-0c1d2e3f4a5b';
    expect(familyStatementQuerySchema.parse({ termId: id })).toEqual({
      termId: id,
    });
    expect(familyStatementQuerySchema.parse({})).toEqual({});
    expect(
      familyStatementQuerySchema.safeParse({ termId: 'nope' }).success
    ).toBe(false);
  });
});

describe('familyTermFields', () => {
  const schema = z.object(familyTermFields);

  it('accepts the whole-history nulls and a filled term', () => {
    const id = '0198a4b2-3c5d-7e6f-8a9b-0c1d2e3f4a5b';
    expect(schema.safeParse({ term: null, termOptions: [] }).success).toBe(
      true
    );
    expect(
      schema.safeParse({
        term: {
          id,
          label: 'First term, 2026/2027',
          fromOn: '2026-09-01',
          toOn: null,
        },
        termOptions: [{ id, label: 'First term, 2026/2027' }],
      }).success
    ).toBe(true);
  });

  it('leaves the per-student figures to the single statement', () => {
    expect(Object.keys(familyTermFields)).toEqual(['term', 'termOptions']);
    expect(Object.keys(statementTermFields)).toEqual(
      expect.arrayContaining(['broughtForward', 'closingMinor'])
    );
  });
});

describe('statementTermFields', () => {
  const schema = z.object(statementTermFields);
  const whole = {
    term: null,
    broughtForward: null,
    closingMinor: null,
    termOptions: [],
  };

  it('accepts the whole-history nulls', () => {
    expect(schema.safeParse(whole).success).toBe(true);
  });

  it('accepts a filled term, a signed brought forward and a closing figure', () => {
    const id = '0198a4b2-3c5d-7e6f-8a9b-0c1d2e3f4a5b';
    const filled = {
      term: {
        id,
        label: 'First term, 2026/2027',
        fromOn: '2026-09-01',
        toOn: null,
      },
      broughtForward: { amountMinor: -500 },
      closingMinor: 1200,
      termOptions: [{ id, label: 'First term, 2026/2027' }],
    };
    expect(schema.safeParse(filled).success).toBe(true);
    expect(
      schema.safeParse({
        ...filled,
        term: { ...filled.term, toOn: '2026-12-18' },
      }).success
    ).toBe(true);
  });

  it('refuses a fractional amount and a term without a label', () => {
    expect(
      schema.safeParse({ ...whole, broughtForward: { amountMinor: 1.5 } })
        .success
    ).toBe(false);
    expect(
      schema.safeParse({
        ...whole,
        term: { id: 'nope', fromOn: '2026-09-01', toOn: null },
      }).success
    ).toBe(false);
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
    expect(ROW_STATUS_LABELS.moved).toBe('Moved to wallet');
  });

  it('read a voided receipt as voided, and leave other rows alone', () => {
    expect(rowStatusLabel({ status: 'paid', voided: true })).toBe('Voided');
    expect(rowStatusLabel({ status: 'paid', voided: false })).toBe('Paid');
    expect(rowStatusLabel({ status: 'cancelled', voided: false })).toBe(
      'Payment cancelled'
    );
  });

  it('give a voided receipt a neutral tone, whatever its status', () => {
    expect(rowTone({ status: 'paid', voided: true })).toBe('neutral');
    expect(rowTone({ status: 'paid', voided: false })).toBe('paid');
    expect(rowTone({ status: 'charged' })).toBe('owe');
    expect(rowTone({ status: 'moved' })).toBe('neutral');
  });

  it('count charged, cancelled and refunded rows as owing and paid, reduced and moved as not', () => {
    expect(
      STATEMENT_ROW_STATUSES.filter((status) => isOwingStatus(status))
    ).toEqual(['charged', 'cancelled', 'refunded']);
  });
});
