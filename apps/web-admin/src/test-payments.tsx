import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { render } from '@testing-library/react';
import type {
  BalanceList,
  BalanceRow,
  MePermissions,
  Payment,
  PaymentList,
  PaymentSummary,
  RecordedPayment,
  RecordingOptions,
  StudentStatement,
} from '@eduvault/api-contract';
import { PermissionsProvider } from '@eduvault/auth-client';
import { TooltipProvider } from '@eduvault/ui';
import { parseAccountsSearch, parseStatementSearch } from './accounts-search';
import { ApiProvider, type Api } from './api';
import { parseBillingSearch } from './billing-search';
import { parseFeesSearch } from './fees-search';
import { parseInvoicesSearch } from './invoices-search';
import { parsePaymentsSearch, parseReceiptSearch } from './payments-search';
import { ownerAccess } from './test-utils';

export const PAYMENT_ID = '00000000-0000-4000-8000-0000000c0001';
export const ADA = '00000000-0000-4000-8000-0000000d0001';
export const CHIDI = '00000000-0000-4000-8000-0000000d0002';
export const TOBI = '00000000-0000-4000-8000-0000000d0003';
export const NGOZI = '00000000-0000-4000-8000-0000000e0001';
export const ACCOUNT = '00000000-0000-4000-8000-0000000f0001';

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
    accounts: [{ id: ACCOUNT, label: 'GTBank current · ending 4417' }],
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
    fileId: '00000000-0000-4000-8000-0000000a0a01',
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
    totalOwedMinor: 18_000_000,
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
      entryId: '00000000-0000-4000-8000-0000000b0001',
      effectiveOn: '2026-09-01',
      reference: 'CHG-2026-00001',
      description: 'Term fees, First term, 2026/2027',
      status: 'charged',
      amountMinor: 22_000_000,
      link: { type: 'invoice', id: '00000000-0000-4000-8000-0000000b0001' },
    },
    {
      entryId: '00000000-0000-4000-8000-0000000b0002',
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
      link: { type: 'invoice', id: '00000000-0000-4000-8000-0000000b0001' },
    },
  ],
  family: { guardianId: NGOZI, guardianName: 'Ngozi Okeke', childCount: 3 },
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
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const root = createRootRoute({
    component: () => (
      <QueryClientProvider client={queryClient}>
        <ApiProvider api={api as unknown as Api}>
          <PermissionsProvider value={access}>
            <TooltipProvider>{page}</TooltipProvider>
          </PermissionsProvider>
        </ApiProvider>
      </QueryClientProvider>
    ),
  });
  const routes = [
    ['/finance/payments', parsePaymentsSearch],
    ['/finance/payments/$paymentId', parseReceiptSearch],
    ['/finance/payments/$paymentId/print', undefined],
    ['/finance/accounts', parseAccountsSearch],
    ['/finance/accounts/$studentId', parseStatementSearch],
    ['/finance/billing', parseBillingSearch],
    ['/finance/invoices', parseInvoicesSearch],
    ['/finance/invoices/$invoiceId', undefined],
    ['/finance/school-fees', parseFeesSearch],
    ['/finance/other-fees', parseFeesSearch],
  ] as const;
  const router = createRouter({
    routeTree: root.addChildren(
      routes.map(([routePath, validateSearch]) =>
        createRoute({
          getParentRoute: () => root,
          path: routePath,
          validateSearch,
        })
      )
    ),
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  render(<RouterProvider router={router} />);
  return { router, queryClient };
}
