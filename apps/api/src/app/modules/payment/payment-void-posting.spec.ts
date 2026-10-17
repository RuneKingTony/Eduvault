import { assertBalancedLines, type LedgerLine } from '../../common/ledger';
import { mirrorLines, voidMemo, voidReference } from './payment-void-posting';

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
        campusId: 'lekki',
        debitMinor: 0,
        creditMinor: 2_000_000,
      },
      {
        ledgerAccountId: 'receivable',
        studentId: 'ada',
        campusId: 'lekki',
        debitMinor: 1_200_000,
        creditMinor: 0,
      },
      {
        ledgerAccountId: 'receivable',
        studentId: 'chidi',
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
});

describe('voidReference and voidMemo', () => {
  it('names the entry after the payment reference and the memo after the receipt', () => {
    expect(voidReference('CASH-20261015-A1')).toBe('VOID-CASH-20261015-A1');
    expect(voidMemo('RCT-2026-00098', 'Wrong child')).toBe(
      'Void of RCT-2026-00098: Wrong child'
    );
  });

  it('keeps the memo within the journal’s 500 characters', () => {
    expect(voidMemo('RCT-2026-00098', 'x'.repeat(500))).toHaveLength(500);
  });
});
