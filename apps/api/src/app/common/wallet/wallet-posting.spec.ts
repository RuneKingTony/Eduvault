import { assertBalancedLines } from '../ledger';
import {
  creditMigrationPostingLines,
  refundPostingLines,
  spendPostingLines,
  topUpPostingLines,
} from './wallet-posting';

const wallets = 'wallets-2200';
const receivable = 'receivable-1100';
const family = 'guardian-1';

describe('topUpPostingLines', () => {
  const lines = topUpPostingLines({
    moneyLedgerAccountId: 'till',
    moneyCampusId: 'lekki',
    walletsAccountId: wallets,
    familyId: family,
    amountMinor: 5_000_000,
  });

  it('debits the money account on its campus and credits the wallet with the family', () => {
    expect(lines).toEqual([
      {
        ledgerAccountId: 'till',
        campusId: 'lekki',
        debitMinor: 5_000_000,
        creditMinor: 0,
      },
      {
        ledgerAccountId: wallets,
        familyId: family,
        debitMinor: 0,
        creditMinor: 5_000_000,
      },
    ]);
  });

  it('balances, and tags the family only on the wallet line', () => {
    expect(() => {
      assertBalancedLines(lines);
    }).not.toThrow();
    expect(lines.filter((line) => line.familyId !== undefined)).toHaveLength(1);
  });

  it('keeps a school-wide money account school-wide', () => {
    const [cash] = topUpPostingLines({
      moneyLedgerAccountId: 'bank',
      moneyCampusId: null,
      walletsAccountId: wallets,
      familyId: family,
      amountMinor: 100,
    });
    expect(cash?.campusId).toBeNull();
  });
});

describe('spendPostingLines', () => {
  const campusOf = new Map([
    ['ada', 'lekki'],
    ['chidi', 'ikeja'],
  ]);
  const lines = spendPostingLines({
    walletsAccountId: wallets,
    receivableId: receivable,
    familyId: family,
    lines: [
      { studentId: 'ada', amountMinor: 1_800_000 },
      { studentId: 'chidi', amountMinor: 600_000 },
    ],
    campusOf,
  });

  it('debits the wallet and credits the receivable once per child', () => {
    expect(lines).toEqual([
      {
        ledgerAccountId: wallets,
        familyId: family,
        studentId: 'ada',
        debitMinor: 1_800_000,
        creditMinor: 0,
      },
      {
        ledgerAccountId: receivable,
        studentId: 'ada',
        campusId: 'lekki',
        debitMinor: 0,
        creditMinor: 1_800_000,
      },
      {
        ledgerAccountId: wallets,
        familyId: family,
        studentId: 'chidi',
        debitMinor: 600_000,
        creditMinor: 0,
      },
      {
        ledgerAccountId: receivable,
        studentId: 'chidi',
        campusId: 'ikeja',
        debitMinor: 0,
        creditMinor: 600_000,
      },
    ]);
  });

  it('balances and puts exactly one receivable credit on each child', () => {
    expect(() => {
      assertBalancedLines(lines);
    }).not.toThrow();
    const credits = lines.filter((line) => line.ledgerAccountId === receivable);
    expect(credits.map((line) => line.studentId)).toEqual(['ada', 'chidi']);
  });

  it('tags the family on every wallet line and on no receivable line', () => {
    for (const line of lines) {
      expect(line.familyId).toBe(
        line.ledgerAccountId === wallets ? family : undefined
      );
    }
  });
});

describe('refundPostingLines', () => {
  const lines = refundPostingLines({
    moneyLedgerAccountId: 'bank',
    moneyCampusId: 'lekki',
    walletsAccountId: wallets,
    familyId: family,
    amountMinor: 1_500_000,
  });

  it('takes the money out of the family’s wallet and out of the bank account', () => {
    expect(lines).toEqual([
      {
        ledgerAccountId: wallets,
        familyId: family,
        debitMinor: 1_500_000,
        creditMinor: 0,
      },
      {
        ledgerAccountId: 'bank',
        campusId: 'lekki',
        debitMinor: 0,
        creditMinor: 1_500_000,
      },
    ]);
  });

  it('balances and tags the family only on the wallet line', () => {
    expect(() => {
      assertBalancedLines(lines);
    }).not.toThrow();
    expect(lines.filter((line) => line.familyId !== undefined)).toHaveLength(1);
  });
});

describe('creditMigrationPostingLines', () => {
  const lines = creditMigrationPostingLines({
    walletsAccountId: wallets,
    receivableId: receivable,
    familyId: family,
    children: [
      { studentId: 'ada', campusId: 'lekki', amountMinor: 500_000 },
      { studentId: 'uche', campusId: 'ikeja', amountMinor: 300_000 },
    ],
  });

  it('takes each child’s credit off their fee account and puts the total on the wallet', () => {
    expect(lines).toEqual([
      {
        ledgerAccountId: receivable,
        studentId: 'ada',
        campusId: 'lekki',
        debitMinor: 500_000,
        creditMinor: 0,
      },
      {
        ledgerAccountId: receivable,
        studentId: 'uche',
        campusId: 'ikeja',
        debitMinor: 300_000,
        creditMinor: 0,
      },
      {
        ledgerAccountId: wallets,
        familyId: family,
        debitMinor: 0,
        creditMinor: 800_000,
      },
    ]);
  });

  it('balances and tags the family only on the wallet line', () => {
    expect(() => {
      assertBalancedLines(lines);
    }).not.toThrow();
    expect(lines.filter((line) => line.familyId !== undefined)).toHaveLength(1);
  });
});
