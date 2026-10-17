import { assertBalancedLines } from '../ledger';
import { paymentPostingLines } from './payment-posting';

const money = 'money-ledger';
const receivable = 'receivable';

describe('paymentPostingLines', () => {
  const campusOf = new Map([
    ['ada', 'lekki'],
    ['chidi', 'ikeja'],
  ]);
  const allocations = [
    { studentId: 'ada', amountMinor: 18_000_000 },
    { studentId: 'chidi', amountMinor: 6_000_000 },
  ];

  it('debits the money account once and credits receivables per student on their campus', () => {
    const lines = paymentPostingLines({
      moneyLedgerAccountId: money,
      moneyCampusId: 'lekki',
      receivableId: receivable,
      allocations,
      campusOf,
    });

    expect(lines).toEqual([
      {
        ledgerAccountId: money,
        campusId: 'lekki',
        debitMinor: 24_000_000,
        creditMinor: 0,
      },
      {
        ledgerAccountId: receivable,
        studentId: 'ada',
        campusId: 'lekki',
        debitMinor: 0,
        creditMinor: 18_000_000,
      },
      {
        ledgerAccountId: receivable,
        studentId: 'chidi',
        campusId: 'ikeja',
        debitMinor: 0,
        creditMinor: 6_000_000,
      },
    ]);
    expect(() => {
      assertBalancedLines(lines);
    }).not.toThrow();
  });

  it('leaves the money line school-wide when the account has no campus', () => {
    const [debit] = paymentPostingLines({
      moneyLedgerAccountId: money,
      moneyCampusId: null,
      receivableId: receivable,
      allocations,
      campusOf,
    });
    expect(debit?.campusId).toBeNull();
  });

  it('keeps a student with no known campus on a null campus', () => {
    const lines = paymentPostingLines({
      moneyLedgerAccountId: money,
      moneyCampusId: null,
      receivableId: receivable,
      allocations: [{ studentId: 'nobody', amountMinor: 100 }],
      campusOf,
    });
    expect(lines[1]?.campusId).toBeNull();
  });
});
