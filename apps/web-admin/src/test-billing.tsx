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
  BillingRun,
  BillingRunList,
  BillingRunSummary,
  BillingTerm,
  Invoice,
  InvoiceJournal,
  InvoiceLine,
  InvoiceList,
  InvoiceSummary,
  MePermissions,
  PrepareResult,
} from '@eduvault/api-contract';
import { PermissionsProvider } from '@eduvault/auth-client';
import { TooltipProvider } from '@eduvault/ui';
import { parseStoreSearch } from './store-search';
import { parseStatementSearch } from './accounts-search';
import { ApiProvider, type Api } from './api';
import { checked } from './test-api';
import { parseBillingSearch, parseRunSearch } from './billing-search';
import { parseFeesSearch } from './fees-search';
import { parseInvoicesSearch } from './invoices-search';
import { JSS1, feesApi } from './test-fees';
import { ownerAccess } from './test-utils';

export const RUN_ID = '00000000-0000-4000-8000-0000000a0001';
export const INVOICE_ID = '00000000-0000-4000-8000-0000000b0001';
export const TERM_ONE = '00000000-0000-4000-8000-000000000101';
export const TERM_TWO = '00000000-0000-4000-8000-000000000102';

export const billingTerm = (over: Partial<BillingTerm> = {}): BillingTerm => ({
  termId: TERM_ONE,
  name: 'First term',
  schoolYearName: '2026/2027',
  charged: 'all',
  isDefault: false,
  levelIds: [JSS1],
  ...over,
});

export const runSummary = (
  over: Partial<BillingRunSummary> = {}
): BillingRunSummary => ({
  id: RUN_ID,
  number: 'BR-2026-0001',
  termId: TERM_ONE,
  termName: 'First term, 2026/2027',
  scope: 'school',
  scopeLabel: 'Whole school',
  chargeCount: 2,
  totalMinor: 45_200_000,
  createdBy: 'Chika Eze',
  issuedAt: '2026-10-14T09:00:00.000Z',
  status: 'issued',
  ...over,
});

export const invoiceSummary = (
  over: Partial<InvoiceSummary> = {}
): InvoiceSummary => ({
  id: INVOICE_ID,
  number: 'CHG-2026-00001',
  studentId: 'st-1',
  studentName: 'Ada Okeke',
  admissionNumber: 'GF-0123',
  armName: 'JSS 2 Gold',
  kind: 'term',
  termId: TERM_ONE,
  termName: 'First term, 2026/2027',
  forText: 'First term, 2026/2027',
  feeCount: 3,
  totalMinor: 22_600_000,
  status: 'issued',
  date: '2026-10-14',
  ...over,
});

export const billingRun = (over: Partial<BillingRun> = {}): BillingRun => ({
  ...runSummary(),
  currency: 'NGN',
  createdAt: '2026-10-13T09:00:00.000Z',
  issuedBy: 'Chika Eze',
  cancelledBy: null,
  cancelledAt: null,
  sentCount: 2,
  feesChangedSincePrepared: false,
  charges: [
    invoiceSummary(),
    invoiceSummary({
      id: 'inv-2',
      number: 'CHG-2026-00002',
      studentName: 'Tobi Adewale',
      admissionNumber: 'GF-0124',
    }),
  ],
  ...over,
});

export const draftRun = (over: Partial<BillingRun> = {}): BillingRun =>
  billingRun({
    number: 'BR-2026-0002',
    termName: 'Second term, 2026/2027',
    status: 'draft',
    issuedAt: null,
    issuedBy: null,
    sentCount: 0,
    charges: [
      invoiceSummary({ number: null, status: 'draft' }),
      invoiceSummary({
        id: 'inv-2',
        number: null,
        status: 'draft',
        studentName: 'Tobi Adewale',
        admissionNumber: 'GF-0124',
      }),
    ],
    ...over,
  });

const sentJournal = (): InvoiceJournal => ({
  reference: 'CHG-2026-00001',
  balanced: true,
  lines: [
    {
      accountCode: 1100,
      accountName: 'Fees owed to the school',
      studentName: 'Ada Okeke',
      campusName: 'Lekki',
      debitMinor: 18_000_000,
      creditMinor: 0,
    },
    {
      accountCode: 4010,
      accountName: 'Tuition',
      studentName: null,
      campusName: 'Lekki',
      debitMinor: 0,
      creditMinor: 18_000_000,
    },
  ],
});

const invoiceLines = (): InvoiceLine[] => [
  {
    id: 'l1',
    description: 'JSS 2 Tuition',
    amountMinor: 18_000_000,
    ledgerAccountId: 'a1',
    feeLineId: 'f1',
    studentDiscountId: null,
  },
  {
    id: 'l2',
    description: 'Sibling discount (3 children) (5% of tuition)',
    amountMinor: -900_000,
    ledgerAccountId: 'a2',
    feeLineId: null,
    studentDiscountId: 'd1',
  },
];

export const invoice = (over: Partial<Invoice> = {}): Invoice => ({
  currency: 'NGN',
  id: INVOICE_ID,
  number: 'CHG-2026-00001',
  kind: 'term',
  status: 'issued',
  student: {
    id: 'st-1',
    name: 'Ada Okeke',
    admissionNumber: 'GF-0123',
    armName: 'JSS 2 Gold',
  },
  termId: TERM_ONE,
  termName: 'First term, 2026/2027',
  campusId: 'c1',
  campusName: 'Lekki',
  lines: invoiceLines(),
  totalMinor: 17_100_000,
  broughtForwardMinor: 1_200_000,
  dueAtIssueMinor: 18_300_000,
  balanceTodayMinor: 5_800_000,
  billingRun: { id: RUN_ID, number: 'BR-2026-0001' },
  createdAt: '2026-10-13T09:00:00.000Z',
  issuedAt: '2026-10-14T09:00:00.000Z',
  issuedBy: 'Chika Eze',
  chargedTo: { name: 'Ngozi Okeke', relationship: 'mother' },
  journal: sentJournal(),
  source: null,
  ...over,
});

export const prepareResult = (
  over: Partial<PrepareResult> = {}
): PrepareResult => ({
  runId: RUN_ID,
  number: 'BR-2026-0002',
  created: 3,
  skipped: 1,
  none: 0,
  termId: TERM_TWO,
  ...over,
});

interface BillingApiOptions {
  runs?: BillingRunSummary[];
  terms?: BillingTerm[];
  run?: BillingRun;
  invoices?: InvoiceSummary[];
  invoice?: Invoice;
}

const invoiceList = (items: InvoiceSummary[]): InvoiceList => ({
  currency: 'NGN',
  items,
  total: items.length,
  counts: { term: items.length, adhoc: 0, store: 2 },
  summary: {
    sentCount: items.filter((item) => item.status === 'issued').length,
    sentTotalMinor: 45_200_000,
    draftCount: items.filter((item) => item.status === 'draft').length,
  },
});

const defaultTerms = (): BillingTerm[] => [
  billingTerm({ charged: 'all' }),
  billingTerm({
    termId: TERM_TWO,
    name: 'Second term',
    charged: 'none',
    isDefault: true,
  }),
];

function runsApi(options: BillingApiOptions) {
  const runs = options.runs ?? [runSummary()];
  const run = options.run ?? billingRun();
  const list: BillingRunList = {
    currency: 'NGN',
    items: runs,
    total: runs.length,
  };
  return {
    list: vi.fn().mockResolvedValue(list),
    terms: vi.fn().mockResolvedValue(options.terms ?? defaultTerms()),
    get: vi.fn().mockResolvedValue(run),
    prepare: vi.fn().mockResolvedValue(prepareResult()),
    issue: vi.fn().mockResolvedValue({
      ...run,
      status: 'issued',
      sentCount: run.chargeCount,
    }),
    cancel: vi.fn().mockResolvedValue({ ...run, status: 'cancelled' }),
  };
}

export function billingApi(options: BillingApiOptions = {}) {
  return {
    ...feesApi(),
    billingRuns: runsApi(options),
    invoices: {
      list: vi
        .fn()
        .mockResolvedValue(invoiceList(options.invoices ?? [invoiceSummary()])),
      get: vi.fn().mockResolvedValue(options.invoice ?? invoice()),
    },
  };
}

interface RenderOptions {
  access?: MePermissions;
  path?: string;
}

export function renderBilling(
  page: ReactElement,
  api: Partial<Record<keyof Api, unknown>>,
  { access = ownerAccess(), path = '/finance/billing' }: RenderOptions = {}
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const root = createRootRoute({
    component: () => (
      <QueryClientProvider client={queryClient}>
        <ApiProvider api={checked(api)}>
          <PermissionsProvider value={access}>
            <TooltipProvider>{page}</TooltipProvider>
          </PermissionsProvider>
        </ApiProvider>
      </QueryClientProvider>
    ),
  });
  const routes = [
    ['/finance/accounts/$studentId', parseStatementSearch],
    ['/finance/billing', parseBillingSearch],
    ['/finance/billing/$runId', parseRunSearch],
    ['/finance/invoices', parseInvoicesSearch],
    ['/finance/invoices/$invoiceId', undefined],
    ['/finance/school-fees', parseFeesSearch],
    ['/finance/store', parseStoreSearch],
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
  return router;
}
