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
import { checked, testId } from './test-api';
import { parseBillingSearch, parseRunSearch } from './billing-search';
import { parseFeesSearch } from './fees-search';
import { parseInvoicesSearch } from './invoices-search';
import { FEE_LINE, JSS1, feesApi } from './test-fees';
import { ownerAccess } from './test-utils';

export const RUN_ID = testId(0x1_50_01);
export const RUN_TWO_ID = testId(0x1_50_02);
export const INVOICE_ID = testId(0x1_50_11);
export const INVOICE_TWO_ID = testId(0x1_50_12);
export const TERM_ONE = testId(0x1_50_21);
export const TERM_TWO = testId(0x1_50_22);
const INVOICE_STUDENT_ID = testId(0x1_50_31);
const INVOICE_STUDENT_TWO_ID = testId(0x1_50_32);
const INVOICE_CAMPUS_ID = testId(0x1_50_41);
const LINE_TUITION_ID = testId(0x1_50_51);
const LINE_DISCOUNT_ID = testId(0x1_50_52);
const LEDGER_TUITION_ID = testId(0x1_50_61);
const LEDGER_DISCOUNT_ID = testId(0x1_50_62);
const STUDENT_DISCOUNT_ID = testId(0x1_50_71);

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
  studentId: INVOICE_STUDENT_ID,
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
      id: INVOICE_TWO_ID,
      studentId: INVOICE_STUDENT_TWO_ID,
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
    termId: TERM_TWO,
    termName: 'Second term, 2026/2027',
    status: 'draft',
    issuedAt: null,
    issuedBy: null,
    sentCount: 0,
    charges: [
      invoiceSummary({
        number: null,
        status: 'draft',
        termId: TERM_TWO,
        termName: 'Second term, 2026/2027',
      }),
      invoiceSummary({
        id: INVOICE_TWO_ID,
        termId: TERM_TWO,
        termName: 'Second term, 2026/2027',
        studentId: INVOICE_STUDENT_TWO_ID,
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
    id: LINE_TUITION_ID,
    description: 'JSS 2 Tuition',
    amountMinor: 18_000_000,
    ledgerAccountId: LEDGER_TUITION_ID,
    feeLineId: FEE_LINE,
    studentDiscountId: null,
  },
  {
    id: LINE_DISCOUNT_ID,
    description: 'Sibling discount (3 children) (5% of tuition)',
    amountMinor: -900_000,
    ledgerAccountId: LEDGER_DISCOUNT_ID,
    feeLineId: null,
    studentDiscountId: STUDENT_DISCOUNT_ID,
  },
];

export const invoice = (over: Partial<Invoice> = {}): Invoice => ({
  currency: 'NGN',
  id: INVOICE_ID,
  number: 'CHG-2026-00001',
  kind: 'term',
  status: 'issued',
  student: {
    id: INVOICE_STUDENT_ID,
    name: 'Ada Okeke',
    admissionNumber: 'GF-0123',
    armName: 'JSS 2 Gold',
  },
  termId: TERM_ONE,
  termName: 'First term, 2026/2027',
  campusId: INVOICE_CAMPUS_ID,
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
    prepare: vi
      .fn()
      .mockImplementation(({ body }: { body: { termId: string } }) =>
        Promise.resolve(prepareResult({ termId: body.termId }))
      ),
    issue: vi
      .fn()
      .mockImplementation(({ params }: { params: { id: string } }) =>
        Promise.resolve({
          ...run,
          id: params.id,
          status: 'issued',
          issuedAt: '2026-10-15T09:00:00.000Z',
          issuedBy: 'Chika Eze',
          sentCount: run.chargeCount,
        })
      ),
    cancel: vi
      .fn()
      .mockImplementation(({ params }: { params: { id: string } }) =>
        Promise.resolve({
          ...run,
          id: params.id,
          status: 'cancelled',
          cancelledBy: 'Chika Eze',
          cancelledAt: '2026-10-15T09:00:00.000Z',
        })
      ),
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
