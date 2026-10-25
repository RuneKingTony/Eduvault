import { assertBalancedLines, type LedgerLine } from './ledger-lines';
import { mirrorLines } from './mirror-lines';

const received: LedgerLine[] = [
  {
    ledgerAccountId: 'cash',
    campusId: 'lekki',
    debitMinor: 2_000_000,
    creditMinor: 0,
  },
  {
    ledgerAccountId: 'receivable',
    studentId: 'ada',
    campusId: 'lekki',
    debitMinor: 0,
    creditMinor: 1_200_000,
  },
  {
    ledgerAccountId: 'receivable',
    studentId: 'chidi',
    campusId: 'ikeja',
    debitMinor: 0,
    creditMinor: 800_000,
  },
];

describe('mirrorLines', () => {
  it('swaps the sides and keeps accounts, students and campuses', () => {
    expect(mirrorLines(received)).toEqual([
      {
        ledgerAccountId: 'cash',
        studentId: null,
        familyId: null,
        campusId: 'lekki',
        debitMinor: 0,
        creditMinor: 2_000_000,
      },
      {
        ledgerAccountId: 'receivable',
        studentId: 'ada',
        familyId: null,
        campusId: 'lekki',
        debitMinor: 1_200_000,
        creditMinor: 0,
      },
      {
        ledgerAccountId: 'receivable',
        studentId: 'chidi',
        familyId: null,
        campusId: 'ikeja',
        debitMinor: 800_000,
        creditMinor: 0,
      },
    ]);
  });

  it('still balances', () => {
    expect(() => assertBalancedLines(mirrorLines(received))).not.toThrow();
  });

  it('copies the stored campus, so a student who moved campus since paying changes nothing', () => {
    const afterMove = mirrorLines(received).find(
      (line) => line.studentId === 'ada'
    );
    expect(afterMove?.campusId).toBe('lekki');
  });

  it('leaves a school-wide money line school-wide', () => {
    const [cash] = mirrorLines([
      { ledgerAccountId: 'bank', debitMinor: 500, creditMinor: 0 },
      {
        ledgerAccountId: 'receivable',
        studentId: 'ada',
        debitMinor: 0,
        creditMinor: 500,
      },
    ]);
    expect(cash?.campusId).toBeNull();
  });

  it('keeps the family on a wallet line, which the 2200 account refuses to post without', () => {
    const topUp: LedgerLine[] = [
      {
        ledgerAccountId: 'bank',
        campusId: 'lekki',
        debitMinor: 5_000_000,
        creditMinor: 0,
      },
      {
        ledgerAccountId: 'wallets',
        familyId: 'guardian-1',
        debitMinor: 0,
        creditMinor: 5_000_000,
      },
    ];
    const reversal = mirrorLines(topUp);
    expect(reversal[1]).toEqual({
      ledgerAccountId: 'wallets',
      studentId: null,
      familyId: 'guardian-1',
      campusId: null,
      debitMinor: 5_000_000,
      creditMinor: 0,
    });
    expect(reversal[0]?.familyId).toBeNull();
    expect(() => assertBalancedLines(reversal)).not.toThrow();
  });
});
