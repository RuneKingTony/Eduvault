import type {
  CashBook,
  JournalEntry,
  LedgerAccount,
  MoneyAccount,
  MoneyAccountList,
} from '@eduvault/api-contract';
import { testId } from './test-api';

const GTBANK_ID = testId(0x1_40_01);
const GTBANK_LEDGER_ID = testId(0x1_40_11);
const FEE_INCOME_ID = testId(0xe1);
const OPENING_ENTRY_ID = testId(0x1_40_31);

export const moneyAccount = (
  overrides: Partial<MoneyAccount> = {}
): MoneyAccount => ({
  id: GTBANK_ID,
  name: 'GTBank current',
  kind: 'bank',
  campusId: null,
  campusName: null,
  bankName: 'GTBank',
  last4: '4417',
  ledgerAccountId: GTBANK_LEDGER_ID,
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
  id: FEE_INCOME_ID,
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
  entryId: OPENING_ENTRY_ID,
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
