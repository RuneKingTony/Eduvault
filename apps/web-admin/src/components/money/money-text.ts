import type {
  JournalKind,
  LedgerAccountType,
  MoneyAccount,
  MoneyAccountKind,
} from '@eduvault/api-contract';

export const SCHOOL_WIDE_LABEL = 'School-wide';

export const KIND_LABELS: Record<MoneyAccountKind, string> = {
  cash: 'Cash',
  bank: 'Bank',
  pos: 'POS',
  gateway: 'Online payments',
};

export const TYPE_WORDS: Record<LedgerAccountType, string> = {
  asset: 'Money held',
  liability: 'Money owed',
  equity: 'Opening balance',
  income: 'Income',
  expense: 'Cost',
};

export const JOURNAL_KIND_LABELS: Record<JournalKind, string> = {
  invoice: 'Charge',
  adhoc: 'One-off charge',
  payment: 'Payment',
  payment_void: 'Payment voided',
  adjustment: 'Adjustment',
  opening: 'Opening balance',
  store: 'Store sale',
  store_receive: 'Store delivery',
  store_cost: 'Store cost',
  store_count: 'Stock count',
  wallet_topup: 'Wallet top-up',
  wallet_spend: 'Paid from wallet',
};

export const BUILT_IN_TIP =
  'Built in. The system posts to this one, so it can’t be changed.';

export const ACCOUNTS_TIP =
  'Where the school’s money sits. A balance is worked out from the books, never typed in.';

export const campusLabel = (campusName: string | null): string =>
  campusName ?? SCHOOL_WIDE_LABEL;

export const entryCaption = (reference: string, memo: string | null): string =>
  memo === null ? reference : `${reference} · ${memo}`;

export const endingText = (last4: string | null): string =>
  last4 === null ? '' : ` · ending ${last4}`;

export const tileSubline = (
  account: Pick<MoneyAccount, 'campusName' | 'last4'>
): string => `${campusLabel(account.campusName)}${endingText(account.last4)}`;

export const hiddenAccountsText = (count: number): string =>
  count === 1
    ? '1 school-wide account is hidden. Seeing it needs access to every campus.'
    : `${count} school-wide accounts are hidden. Seeing them needs access to every campus.`;

export const hiddenFooterText = (count: number): string =>
  count === 1
    ? '1 school-wide account not shown for your campus.'
    : `${count} school-wide accounts not shown for your campus.`;

function joinNames(names: readonly string[]): string {
  if (names.length <= 1) {
    return names.join('');
  }
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1) ?? ''}`;
}

export const scopeText = (campusNames: readonly string[]): string =>
  campusNames.length === 1
    ? `Showing ${joinNames(campusNames)} campus only.`
    : `Showing ${joinNames(campusNames)} campuses only.`;
