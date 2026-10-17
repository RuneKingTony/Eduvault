import { assertBalancedLines } from '../ledger';
import { chargePostingLines } from './charge-posting';

const base = {
  receivableId: 'owed-1100',
  studentId: 'ada',
  campusId: 'lekki',
};

describe('chargePostingLines', () => {
  it('debits Fees owed and credits the fee type for a fee line', () => {
    expect(
      chargePostingLines({
        ...base,
        lines: [{ ledgerAccountId: 'tuition', amountMinor: 18_000_000 }],
      })
    ).toEqual([
      {
        ledgerAccountId: 'owed-1100',
        studentId: 'ada',
        campusId: 'lekki',
        debitMinor: 18_000_000,
        creditMinor: 0,
      },
      {
        ledgerAccountId: 'tuition',
        campusId: 'lekki',
        debitMinor: 0,
        creditMinor: 18_000_000,
      },
    ]);
  });

  it('debits Discounts given and credits Fees owed for a discount line', () => {
    expect(
      chargePostingLines({
        ...base,
        lines: [{ ledgerAccountId: 'discounts-5000', amountMinor: -900_000 }],
      })
    ).toEqual([
      {
        ledgerAccountId: 'discounts-5000',
        campusId: 'lekki',
        debitMinor: 900_000,
        creditMinor: 0,
      },
      {
        ledgerAccountId: 'owed-1100',
        studentId: 'ada',
        campusId: 'lekki',
        debitMinor: 0,
        creditMinor: 900_000,
      },
    ]);
  });

  it('mirrors the charge line for line and balances', () => {
    const lines = chargePostingLines({
      ...base,
      lines: [
        { ledgerAccountId: 'tuition', amountMinor: 18_000_000 },
        { ledgerAccountId: 'bus', amountMinor: 4_000_000 },
        { ledgerAccountId: 'discounts-5000', amountMinor: -900_000 },
      ],
    });
    expect(lines).toHaveLength(6);
    expect(() => {
      assertBalancedLines(lines);
    }).not.toThrow();
  });

  it('puts the student on every Fees owed line and the campus on every line', () => {
    const lines = chargePostingLines({
      ...base,
      lines: [
        { ledgerAccountId: 'tuition', amountMinor: 100 },
        { ledgerAccountId: 'discounts-5000', amountMinor: -10 },
      ],
    });
    expect(lines.map((line) => line.campusId)).toEqual([
      'lekki',
      'lekki',
      'lekki',
      'lekki',
    ]);
    expect(
      lines
        .filter((line) => line.ledgerAccountId === 'owed-1100')
        .map((line) => line.studentId)
    ).toEqual(['ada', 'ada']);
  });
});
