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
  Campus,
  CreateFeeLineInput,
  FeeCopySource,
  FeeGrid,
  FeeGridCell,
  FeeGridRow,
  FeeLine,
  FeeCandidates,
  FeeOptIns,
  FeePreview,
  FeeSetup,
  FeeType,
  MePermissions,
} from '@eduvault/api-contract';
import { PermissionsProvider } from '@eduvault/auth-client';
import { TooltipProvider } from '@eduvault/ui';
import { ApiProvider, type Api } from './api';
import { checked } from './test-api';
import { parseFeesSearch } from './fees-search';
import { IKEJA, LEKKI, campus } from './test-announcements';
import { ownerAccess } from './test-utils';

const uuid = (n: number) =>
  `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;

export const TERM_1 = uuid(0x1_01);
export const TERM_2 = uuid(0x1_02);
export const JSS1 = uuid(0x2_01);
export const JSS2 = uuid(0x2_02);
export const JSS3 = uuid(0x2_03);
export const FEE_LINE = uuid(0x4_01);
export const FEE_LINE_LEKKI = uuid(0x4_02);
export const FEE_LINE_RETIRED = uuid(0x4_03);
export const FEE_LINE_BUS = uuid(0x4_04);
export const FEE_LINE_PTA = uuid(0x4_05);
export const ADA = uuid(0x5_01);
export const CHIDI = uuid(0x5_02);
const NEW_FEE_TYPE = uuid(0x3_09);

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

export const copySource = (
  overrides: Partial<FeeCopySource> = {}
): FeeCopySource => ({
  sourceTerm: {
    id: uuid(0x1_00),
    name: 'Third term',
    schoolYearName: '2025/2026',
  },
  liveLineCount: 12,
  targetHasLines: false,
  ...overrides,
});

export const feeLine = (overrides: Partial<FeeLine> = {}): FeeLine => ({
  id: FEE_LINE,
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
    feeLineId: FEE_LINE,
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
      id: ADA,
      name: 'Ada Okeke',
      admissionNumber: 'GF-0123',
      levelName: 'JSS 2',
    },
    {
      id: CHIDI,
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
    id: ADA,
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
      feeLineId: FEE_LINE,
      description: 'Tuition',
      feeTypeName: 'Tuition',
      amountMinor: 18_000_000,
      optedIn: false,
      campusName: null,
    },
    {
      feeLineId: FEE_LINE_BUS,
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

export const optInRoster = (overrides: Partial<FeeOptIns> = {}): FeeOptIns => ({
  schoolYearName: '2026/2027',
  items: [
    {
      studentId: ADA,
      name: 'Ada Okeke',
      admissionNumber: 'GF-0123',
      levelName: 'JSS 2',
      campusName: 'Lekki',
      optedIn: true,
    },
    {
      studentId: CHIDI,
      name: 'Chidi Eze',
      admissionNumber: 'GF-0124',
      levelName: 'JSS 2',
      campusName: 'Ikeja',
      optedIn: false,
    },
  ],
  total: 2,
  ...overrides,
});

interface FeesApiOptions {
  lines?: FeeLine[];
  optIns?: FeeOptIns;
  grid?: FeeGrid;
  types?: FeeType[];
  preview?: FeePreview;
  copySource?: FeeCopySource;
  campuses?: Campus[];
}

const pickerApi = (campuses: Campus[]) => ({
  campuses: { list: vi.fn().mockResolvedValue(campuses) },
  feeOptions: {
    list: vi.fn().mockResolvedValue([]),
    set: vi
      .fn()
      .mockImplementation(
        ({
          params,
          body,
        }: {
          params: { feeTypeId: string };
          body: { optedIn: boolean };
        }) =>
          Promise.resolve({
            feeTypeId: params.feeTypeId,
            optedIn: body.optedIn,
          })
      ),
  },
});

const optInWrites = (roster: FeeOptIns) => ({
  list: vi.fn().mockResolvedValue(roster),
  set: vi
    .fn()
    .mockImplementation(
      ({
        params,
        body,
      }: {
        params: { feeTypeId: string };
        body: { studentIds: string[]; optedIn: boolean };
      }) =>
        Promise.resolve({
          feeTypeId: params.feeTypeId,
          optedIn: body.optedIn,
          changed: body.studentIds.length,
          unchanged: 0,
        })
    ),
});

const feeLineWrites = () => ({
  create: vi.fn().mockImplementation(({ body }: { body: CreateFeeLineInput }) =>
    Promise.resolve(
      feeLine({
        termId: body.termId,
        classLevelId: body.classLevelId,
        feeTypeId: body.feeTypeId,
        campusId: body.campusId,
        name: body.name,
        amountMinor: body.amountMinor,
        appliesTo: body.appliesTo ?? 'all',
        isOptional: body.isOptional ?? false,
      })
    )
  ),
  update: vi
    .fn()
    .mockImplementation(
      ({
        params,
        body,
      }: {
        params: { id: string };
        body: { amountMinor: number };
      }) =>
        Promise.resolve(
          feeLine({ id: params.id, amountMinor: body.amountMinor })
        )
    ),
  retire: vi
    .fn()
    .mockImplementation(({ params }: { params: { id: string } }) =>
      Promise.resolve(
        feeLine({ id: params.id, retiredAt: '2026-10-05T09:00:00.000Z' })
      )
    ),
});

export function feesApi(options: FeesApiOptions = {}) {
  const lines = options.lines ?? [feeLine()];
  return {
    ...pickerApi(
      options.campuses ?? [campus(LEKKI, 'Lekki'), campus(IKEJA, 'Ikeja')]
    ),
    feeLines: {
      setup: vi.fn().mockResolvedValue(feeSetup()),
      list: vi.fn().mockResolvedValue(lines),
      grid: vi.fn().mockResolvedValue(options.grid ?? feeGrid()),
      preview: vi.fn().mockResolvedValue(options.preview ?? preview()),
      candidates: vi.fn().mockResolvedValue(candidates()),
      copySource: vi.fn().mockResolvedValue(options.copySource ?? copySource()),
      copy: vi.fn().mockResolvedValue({
        copied: 12,
        sourceTerm: copySource().sourceTerm,
      }),
      ...feeLineWrites(),
    },
    feeOptIns: optInWrites(options.optIns ?? optInRoster()),
    feeTypes: {
      list: vi.fn().mockResolvedValue(options.types ?? [TUITION, PTA, BUS]),
      create: vi
        .fn()
        .mockImplementation(({ body }: { body: { name: string } }) =>
          Promise.resolve({ id: NEW_FEE_TYPE, code: 4090, name: body.name })
        ),
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
        <ApiProvider api={checked(api)}>
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
