import type {
  CashBook,
  JournalEntry,
  LedgerAccount,
  MoneyAccount,
  MoneyAccountList,
} from '@eduvault/api-contract';

export const moneyAccount = (
  overrides: Partial<MoneyAccount> = {}
): MoneyAccount => ({
  id: '00000000-0000-4000-8000-0000000000c1',
  name: 'GTBank current',
  kind: 'bank',
  campusId: null,
  campusName: null,
  bankName: 'GTBank',
  last4: '4417',
  ledgerAccountId: '00000000-0000-4000-8000-0000000000d1',
  ledgerCode: 1210,
  balanceMinor: 9_500_000,
  retiredAt: null,
  ...overrides,
});

export const moneyAccountList = (
  items: MoneyAccount[],
  overrides: Partial<MoneyAccountList> = {}
): MoneyAccountList => ({
  currency: 'NGN',
  items,
  hiddenSchoolWideCount: 0,
  ...overrides,
});

export const cashBook = (
  account: MoneyAccount,
  overrides: Partial<CashBook> = {}
): CashBook => ({
  currency: 'NGN',
  account,
  items: [],
  total: 0,
  ...overrides,
});

export const ledgerAccount = (
  overrides: Partial<LedgerAccount> = {}
): LedgerAccount => ({
  id: '00000000-0000-4000-8000-0000000000e1',
  code: 4000,
  name: 'Fee income',
  type: 'income',
  parentId: null,
  systemKey: 'fee_income',
  balanceMinor: 0,
  ...overrides,
});

export const journalEntry = (
  overrides: Partial<JournalEntry> = {}
): JournalEntry => ({
  entryId: '00000000-0000-4000-8000-0000000000f1',
  effectiveOn: '2026-09-01',
  reference: 'OPEN-1',
  kind: 'opening',
  memo: 'Opening balance',
  totalMinor: 1_200_000,
  link: null,
  lines: [
    {
      accountCode: 1100,
      accountName: 'Fees owed to the school',
      studentName: 'Bola Adeyemi',
      campusName: 'Lekki',
      debitMinor: 1_200_000,
      creditMinor: 0,
    },
    {
      accountCode: 3000,
      accountName: 'Opening balance',
      studentName: null,
      campusName: null,
      debitMinor: 0,
      creditMinor: 1_200_000,
    },
  ],
  ...overrides,
});
