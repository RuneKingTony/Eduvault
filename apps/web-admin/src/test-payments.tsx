import type { ReactElement } from 'react';

import type {
  BalanceList,
  BalanceRow,
  GuardianStatement,
  MePermissions,
  Payment,
  PaymentList,
  PaymentSummary,
  RecordedPayment,
  RecordingOptions,
  StudentStatement,
} from '@eduvault/api-contract';
import { parseStoreSearch } from './store-search';
import { parseAccountsSearch, parseStatementSearch } from './accounts-search';
import { parseAdjustmentsSearch } from './adjustments-search';
import type { Api } from './api';
import { testId } from './test-api';
import { parseBillingSearch } from './billing-search';
import { parseFeesSearch } from './fees-search';
import { parseInvoicesSearch } from './invoices-search';
import { parsePaymentsSearch, parseReceiptSearch } from './payments-search';
import { parseWalletsSearch } from './wallets-search';
import { ownerAccess, renderRoutes } from './test-utils';

export const PAYMENT_ID = testId(0x1_60_01);
export const ADA = testId(0x1_60_11);
export const CHIDI = testId(0x1_60_12);
export const TOBI = testId(0x1_60_13);
export const NGOZI = testId(0x1_60_21);
export const ACCOUNT = testId(0x1_60_31);
export const BANK_ACCOUNT = testId(0x1_60_32);
const PROOF_FILE_ID = '00000000-0000-4000-8000-0000000a0a01';
const STATEMENT_INVOICE_ID = testId(0x1_60_51);
const INVOICE_ENTRY_ID = testId(0x1_60_61);
const PAYMENT_ENTRY_ID = testId(0x1_60_62);

const child = (studentId: string, name: string, owesMinor: number) => ({
  studentId,
  name,
  admissionNumber: `GF-${name.toUpperCase()}`,
  owesMinor,
});

export const recordingOptions = (
  over: Partial<RecordingOptions> = {}
): RecordingOptions => {
  const children = [
    child(ADA, 'Ada Okeke', 18_000_000),
    child(CHIDI, 'Chidi Okeke', 6_000_000),
    child(TOBI, 'Tobi Okeke', 6_000_000),
  ];
  return {
    currency: 'NGN',
    today: '2026-10-07',
    accounts: [
      { id: ACCOUNT, label: 'Lekki cash till', kind: 'cash' },
      { id: BANK_ACCOUNT, label: 'GTBank current · ending 4417', kind: 'bank' },
    ],
    methods: { cash: true, transfer: true, pos: true },
    payers: [{ guardianId: NGOZI, name: 'Ngozi Okeke', children }],
    students: children,
    ...over,
  };
};

export const paymentSummary = (
  over: Partial<PaymentSummary> = {}
): PaymentSummary => ({
  id: PAYMENT_ID,
  receiptNumber: 'RCT-2026-00088',
  reference: 'TRF-20261007-K3Q7ZA',
  paidOn: '2026-10-07',
  method: 'transfer',
  payerName: 'Ngozi Okeke',
  moneyAccount: { id: ACCOUNT, label: 'GTBank current · ending 4417' },
  amountMinor: 24_000_000,
  status: 'posted',
  allocations: [
    {
      studentId: ADA,
      studentName: 'Ada Okeke',
      amountMinor: 18_000_000,
      inScope: true,
    },
    {
      studentId: CHIDI,
      studentName: 'Chidi Okeke',
      amountMinor: 6_000_000,
      inScope: true,
    },
  ],
  ...over,
});

export const paymentList = (
  items: PaymentSummary[] = [paymentSummary()],
  over: Partial<PaymentList> = {}
): PaymentList => ({
  currency: 'NGN',
  items,
  total: items.length,
  summary: {
    receiptCount: items.length,
    receivedMinor: items.reduce((sum, item) => sum + item.amountMinor, 0),
    cancellationsWaiting: 0,
  },
  ...over,
});

const journal = (): NonNullable<Payment['entry']> => ({
  reference: 'TRF-20261007-K3Q7ZA',
  balanced: true,
  lines: [
    {
      accountCode: 1210,
      accountName: 'GTBank current',
      studentName: null,
      campusName: null,
      debitMinor: 24_000_000,
      creditMinor: 0,
    },
    {
      accountCode: 1100,
      accountName: 'Fees owed to the school',
      studentName: 'Ada Okeke',
      campusName: 'Lekki',
      debitMinor: 0,
      creditMinor: 24_000_000,
    },
  ],
});

export const payment = (over: Partial<Payment> = {}): Payment => ({
  currency: 'NGN',
  id: PAYMENT_ID,
  receiptNumber: 'RCT-2026-00088',
  reference: 'TRF-20261007-K3Q7ZA',
  providerReference: 'GTB/FT/2610070031',
  paidOn: '2026-10-07',
  method: 'transfer',
  status: 'posted',
  payerName: 'Ngozi Okeke',
  payerGuardianId: NGOZI,
  moneyAccount: { id: ACCOUNT, label: 'GTBank current · ending 4417' },
  amountMinor: 24_000_000,
  recordedBy: 'Chika Eze',
  recordedAt: '2026-10-07T09:00:00.000Z',
  proof: {
    fileId: PROOF_FILE_ID,
    fileName: 'alert.pdf',
  },
  allocations: [
    {
      studentId: ADA,
      studentName: 'Ada Okeke',
      className: 'JSS 1 Gold',
      amountMinor: 18_000_000,
      inScope: true,
      balanceMinor: 0,
    },
    {
      studentId: CHIDI,
      studentName: 'Chidi Okeke',
      className: null,
      amountMinor: 6_000_000,
      inScope: false,
      balanceMinor: null,
    },
  ],
  void: null,
  storeSale: null,
  entry: journal(),
  voidEntry: null,
  ...over,
});

export const recorded = (
  over: Partial<RecordedPayment> = {}
): RecordedPayment => ({
  ...payment(),
  replayed: false,
  ...over,
});

export const balanceRow = (over: Partial<BalanceRow> = {}): BalanceRow => ({
  studentId: ADA,
  name: 'Ada Okeke',
  admissionNumber: 'GF-0001',
  lifecycle: 'active',
  className: 'JSS 1 Gold',
  guardian: { id: NGOZI, name: 'Ngozi Okeke', phone: '08012345678' },
  balanceMinor: 18_000_000,
  paidMinor: 4_000_000,
  totalMinor: 22_000_000,
  ...over,
});

export const balanceList = (
  items: BalanceRow[] = [balanceRow()],
  over: Partial<BalanceList> = {}
): BalanceList => ({
  currency: 'NGN',
  items,
  total: items.length,
  summary: {
    totalOwedMinor: 31_500_000,
    studentsOwing: 1,
    studentsInScope: 12,
    receivedThisTermMinor: 40_000_000,
    paymentsThisTerm: 5,
    scopeNote: 'Lekki campus',
  },
  ...over,
});

export const statement = (
  over: Partial<StudentStatement> = {}
): StudentStatement => ({
  currency: 'NGN',
  student: {
    id: ADA,
    name: 'Ada Okeke',
    admissionNumber: 'GF-0001',
    className: 'JSS 1 Gold',
    campusName: 'Lekki',
    archived: false,
  },
  totals: {
    balanceMinor: 18_000_000,
    totalMinor: 22_000_000,
    paidMinor: 4_000_000,
    reducedMinor: 0,
  },
  rows: [
    {
      entryId: INVOICE_ENTRY_ID,
      effectiveOn: '2026-09-01',
      reference: 'CHG-2026-00001',
      description: 'Term fees, First term, 2026/2027',
      status: 'charged',
      amountMinor: 22_000_000,
      link: { type: 'invoice', id: STATEMENT_INVOICE_ID },
    },
    {
      entryId: PAYMENT_ENTRY_ID,
      effectiveOn: '2026-09-20',
      reference: 'TRF-20260920-K3Q7ZA',
      description: 'Payment RCT-2026-00088 from Ngozi Okeke (Bank transfer)',
      status: 'paid',
      amountMinor: 4_000_000,
      link: { type: 'payment', id: PAYMENT_ID },
    },
  ],
  total: 2,
  page: 1,
  pageSize: 10,
  unpaid: [
    {
      reference: 'CHG-2026-00001',
      outstandingMinor: 18_000_000,
      link: { type: 'invoice', id: STATEMENT_INVOICE_ID },
    },
  ],
  family: { guardianId: NGOZI, guardianName: 'Ngozi Okeke', childCount: 3 },
  term: null,
  broughtForward: null,
  closingMinor: null,
  termOptions: [],
  ...over,
});

export const guardianStatement = (
  children: StudentStatement[],
  over: Partial<GuardianStatement> = {}
): GuardianStatement => ({
  currency: 'NGN',
  guardian: { id: NGOZI, name: 'Ngozi Okeke' },
  familyTotalMinor: 8_000_000,
  creditMinor: 500_000,
  children,
  term: null,
  termOptions: [],
  ...over,
});

interface RenderOptions {
  access?: MePermissions;
  path?: string;
}

export function renderPayments(
  page: ReactElement,
  api: Partial<Record<keyof Api, unknown>>,
  { access = ownerAccess(), path = '/finance/payments' }: RenderOptions = {}
) {
  const routes = [
    ['/approvals', undefined],
    ['/settings/approvals', undefined],
    ['/finance/adjustments', parseAdjustmentsSearch],
    ['/finance/payments', parsePaymentsSearch],
    ['/finance/payments/$paymentId', parseReceiptSearch],
    ['/finance/payments/$paymentId/print', undefined],
    ['/finance/accounts', parseAccountsSearch],
    ['/finance/accounts/$studentId', parseStatementSearch],
    ['/finance/billing', parseBillingSearch],
    ['/finance/invoices', parseInvoicesSearch],
    ['/finance/invoices/$invoiceId', undefined],
    ['/finance/school-fees', parseFeesSearch],
    ['/finance/store', parseStoreSearch],
    ['/finance/other-fees', parseFeesSearch],
    ['/finance/wallets', parseWalletsSearch],
  ] as const;
  return renderRoutes(page, api, { routes, access, path });
}
