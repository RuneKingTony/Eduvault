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
  FeeGrid,
  FeeGridCell,
  FeeGridRow,
  FeeLine,
  FeeCandidates,
  FeePreview,
  FeeSetup,
  FeeType,
  MePermissions,
} from '@eduvault/api-contract';
import { PermissionsProvider } from '@eduvault/auth-client';
import { TooltipProvider } from '@eduvault/ui';
import { ApiProvider, type Api } from './api';
import { parseFeesSearch } from './fees-search';
import { IKEJA, LEKKI, campus } from './test-announcements';
import { ownerAccess } from './test-utils';

const uuid = (n: number) =>
  `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;

export const TERM_1 = uuid(0x1_01);
export const TERM_2 = uuid(0x1_02);
export const JSS1 = uuid(0x2_01);
const JSS2 = uuid(0x2_02);

export const TUITION: FeeType = {
  id: uuid(0x3_01),
  code: 4010,
  name: 'Tuition',
};
export const PTA: FeeType = { id: uuid(0x3_02), code: 4020, name: 'PTA fee' };
export const BUS: FeeType = {
  id: uuid(0x3_03),
  code: 4030,
  name: 'School bus',
};

const feeSetup = (): FeeSetup => ({
  terms: [
    {
      id: TERM_1,
      name: 'First term',
      schoolYearName: '2026/2027',
      isCurrent: true,
    },
    {
      id: TERM_2,
      name: 'Second term',
      schoolYearName: '2026/2027',
      isCurrent: false,
    },
  ],
  levels: [
    { id: JSS1, name: 'JSS 1', sequence: 7 },
    { id: JSS2, name: 'JSS 2', sequence: 8 },
  ],
});

export const feeLine = (overrides: Partial<FeeLine> = {}): FeeLine => ({
  id: 'fl-1',
  termId: TERM_1,
  classLevelId: JSS2,
  levelName: 'JSS 2',
  levelSequence: 8,
  feeTypeId: TUITION.id,
  feeTypeCode: TUITION.code,
  feeTypeName: TUITION.name,
  campusId: null,
  campusName: null,
  name: 'Tuition',
  amountMinor: 18_000_000,
  appliesTo: 'all',
  isOptional: false,
  retiredAt: null,
  createdAt: '2026-10-01T09:00:00.000Z',
  ...overrides,
});

export const gridCell = (
  overrides: Partial<FeeGridCell> = {}
): FeeGridCell => ({
  feeTypeId: TUITION.id,
  base: {
    feeLineId: 'fl-1',
    amountMinor: 18_000_000,
    appliesTo: 'all',
    isOptional: false,
  },
  overrides: [],
  ...overrides,
});

export const gridRow = (overrides: Partial<FeeGridRow> = {}): FeeGridRow => ({
  level: { id: JSS2, name: 'JSS 2', sequence: 8 },
  cells: [gridCell()],
  typicalTotalMinor: 19_000_000,
  ...overrides,
});

export const feeGrid = (overrides: Partial<FeeGrid> = {}): FeeGrid => ({
  currency: 'NGN',
  feeTypes: [TUITION],
  rows: [gridRow()],
  ...overrides,
});

const candidates = (overrides: Partial<FeeCandidates> = {}): FeeCandidates => ({
  items: [
    {
      id: 'st-1',
      name: 'Ada Okeke',
      admissionNumber: 'GF-0123',
      levelName: 'JSS 2',
    },
    {
      id: 'st-2',
      name: 'Chidi Eze',
      admissionNumber: 'GF-0124',
      levelName: 'JSS 2',
    },
  ],
  total: 2,
  ...overrides,
});

export const preview = (overrides: Partial<FeePreview> = {}): FeePreview => ({
  currency: 'NGN',
  student: {
    id: 'st-1',
    name: 'Ada Okeke',
    armName: 'JSS 2 Gold',
    levelName: 'JSS 2',
    campusId: LEKKI,
    campusName: 'Lekki',
    isNew: false,
  },
  charged: null,
  lines: [
    {
      feeLineId: 'fl-1',
      description: 'Tuition',
      feeTypeName: 'Tuition',
      amountMinor: 18_000_000,
      optedIn: false,
      campusName: null,
    },
    {
      feeLineId: 'fl-2',
      description: 'School bus',
      feeTypeName: 'School bus',
      amountMinor: 4_500_000,
      optedIn: true,
      campusName: 'Lekki',
    },
  ],
  totalMinor: 22_500_000,
  pendingDiscounts: [],
  ...overrides,
});

interface FeesApiOptions {
  lines?: FeeLine[];
  grid?: FeeGrid;
  types?: FeeType[];
  preview?: FeePreview;
}

const pickerApi = () => ({
  campuses: {
    list: vi
      .fn()
      .mockResolvedValue([campus(LEKKI, 'Lekki'), campus(IKEJA, 'Ikeja')]),
  },
  feeOptions: {
    list: vi.fn().mockResolvedValue([]),
    set: vi.fn().mockResolvedValue({ feeTypeId: BUS.id, optedIn: true }),
  },
});

export function feesApi(options: FeesApiOptions = {}) {
  const lines = options.lines ?? [feeLine()];
  return {
    ...pickerApi(),
    feeLines: {
      setup: vi.fn().mockResolvedValue(feeSetup()),
      list: vi.fn().mockResolvedValue(lines),
      grid: vi.fn().mockResolvedValue(options.grid ?? feeGrid()),
      preview: vi.fn().mockResolvedValue(options.preview ?? preview()),
      candidates: vi.fn().mockResolvedValue(candidates()),
      create: vi.fn().mockResolvedValue(feeLine({ name: 'Excursion' })),
      update: vi.fn().mockResolvedValue(feeLine({ amountMinor: 20_000_000 })),
      retire: vi
        .fn()
        .mockResolvedValue(feeLine({ retiredAt: '2026-10-05T09:00:00.000Z' })),
    },
    feeTypes: {
      list: vi.fn().mockResolvedValue(options.types ?? [TUITION, PTA, BUS]),
      create: vi
        .fn()
        .mockResolvedValue({ id: 'ft-new', code: 4090, name: 'Sports levy' }),
    },
  };
}

export function renderFees(
  page: ReactElement,
  api: Partial<Record<keyof Api, unknown>>,
  access: MePermissions = ownerAccess()
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
  const routes = ['/finance/school-fees', '/finance/other-fees'].map((path) =>
    createRoute({
      getParentRoute: () => root,
      path,
      validateSearch: parseFeesSearch,
    })
  );
  const router = createRouter({
    routeTree: root.addChildren(routes),
    history: createMemoryHistory({ initialEntries: ['/finance/school-fees'] }),
  });
  render(<RouterProvider router={router} />);
  return router;
}
