import { UnbalancedEntryError, assertBalancedLines } from './ledger-lines';

const debit = (debitMinor: number) => ({
  ledgerAccountId: 'a',
  debitMinor,
  creditMinor: 0,
});
const credit = (creditMinor: number) => ({
  ledgerAccountId: 'b',
  debitMinor: 0,
  creditMinor,
});

describe('assertBalancedLines', () => {
  it('accepts a balanced pair and a balanced split', () => {
    expect(() => {
      assertBalancedLines([debit(500), credit(500)]);
    }).not.toThrow();
    expect(() => {
      assertBalancedLines([debit(500), credit(200), credit(300)]);
    }).not.toThrow();
  });

  it('refuses no lines and a single line', () => {
    expect(() => {
      assertBalancedLines([]);
    }).toThrow(UnbalancedEntryError);
    expect(() => {
      assertBalancedLines([debit(500)]);
    }).toThrow('at least two lines');
  });

  it('refuses a line with both sides or neither', () => {
    const both = { ledgerAccountId: 'a', debitMinor: 5, creditMinor: 5 };
    const neither = { ledgerAccountId: 'a', debitMinor: 0, creditMinor: 0 };
    expect(() => {
      assertBalancedLines([both, credit(0)]);
    }).toThrow('either a debit or a credit');
    expect(() => {
      assertBalancedLines([neither, debit(5)]);
    }).toThrow('either a debit or a credit');
  });

  it('refuses fractions, negatives and unsafe integers', () => {
    for (const bad of [10.5, -5, Number.MAX_SAFE_INTEGER + 1, Number.NaN]) {
      expect(() => {
        assertBalancedLines([debit(bad), credit(10)]);
      }).toThrow('whole minor units');
    }
  });

  it('refuses debits that differ from credits', () => {
    expect(() => {
      assertBalancedLines([debit(500), credit(499)]);
    }).toThrow('Debits and credits must be equal');
  });
});
