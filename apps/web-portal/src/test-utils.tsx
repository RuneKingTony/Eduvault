import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type {
  CalendarCurrent,
  DayOffEntry,
  MePermissions,
  PortalAnnouncementList,
  PortalAnnouncements,
  PortalChild,
  PortalFamilyStatement,
  PortalMe,
  PortalStatement,
  PortalPriceList,
  PortalPurchase,
  PortalPurchases,
  PortalStudent,
  PortalWalletMovement,
  PortalWalletMovementList,
  Wallet,
  WalletChild,
} from '@eduvault/api-contract';
import { PermissionsProvider } from '@eduvault/auth-client';
import { accessOfStarter } from '@eduvault/auth-client/testing';
import { toPermissionMap, type Permission } from '@eduvault/policy';
import { ApiProvider, type Api } from './api';
import { checked } from './test-api';

export const ADA_ID = '5b0f1e1e-6e53-4c52-9f1c-0a1d7a7f9c11';
export const TOBI_ID = '7e2a3c4d-1f5b-4a6e-8b9c-2d3e4f5a6b7c';
export const EFE_ID = '9c4b5d6e-3a7d-4c8f-9dae-4f5a6b7c8d9e';
export const NNE_ID = 'a1b2c3d4-5e6f-4a7b-8c9d-0e1f2a3b4c5d';
export const STRANGER_ID = 'c3d4e5f6-7a8b-4c9d-8e0f-1a2b3c4d5e6f';

export const testId = (n: number): string =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

export const portalChild = (
  overrides: Partial<PortalChild> = {}
): PortalChild => ({
  id: ADA_ID,
  firstName: 'Ada',
  lastName: 'Okeke',
  className: 'JSS 1 Gold',
  campusName: 'Lekki',
  archived: false,
  ...overrides,
});

export const portalMe = (overrides: Partial<PortalMe> = {}): PortalMe => ({
  kind: 'guardian',
  name: 'Ngozi Okeke',
  firstName: 'Ngozi',
  login: { username: 'okeke-family', email: null },
  school: {
    name: 'Greenfield College',
    admissionPrefix: 'GF',
    currency: 'NGN',
    logoUrl: null,
    email: null,
  },
  children: [portalChild()],
  ...overrides,
});

export const portalStudent = (
  overrides: Partial<PortalStudent> = {}
): PortalStudent => ({
  id: ADA_ID,
  firstName: 'Ada',
  lastName: 'Okeke',
  admissionNumber: 'GF-0123',
  dateOfBirth: '2014-05-02',
  className: 'JSS 1 Gold',
  campusName: 'Lekki',
  classTeacherName: 'Zainab Lead',
  username: 'greenfield-0123',
  archived: false,
  ...overrides,
});

export const portalAnnouncements = (
  overrides: Partial<PortalAnnouncements> = {}
): PortalAnnouncements => ({ items: [], newThisWeek: 0, ...overrides });

export const portalAnnouncementList = (
  overrides: Partial<PortalAnnouncementList> = {}
): PortalAnnouncementList => ({ items: [], total: 0, ...overrides });

export const portalPurchase = (
  overrides: Partial<PortalPurchase> = {}
): PortalPurchase => ({
  id: '6c0f1e1e-6e53-4c52-9f1c-0a1d7a7f9c21',
  date: '2026-09-08',
  campusName: 'Lekki',
  receiptNumber: 'RCT-2026-00012',
  method: 'pos',
  totalMinor: 1_300_000,
  lines: [
    {
      itemName: 'School shirt, Size 12',
      quantity: 2,
      unitPriceMinor: 450_000,
      amountMinor: 900_000,
    },
    {
      itemName: 'Mathematics',
      quantity: 1,
      unitPriceMinor: 400_000,
      amountMinor: 400_000,
    },
  ],
  ...overrides,
});

export const portalPurchases = (
  overrides: Partial<PortalPurchases> = {}
): PortalPurchases => ({
  termName: 'First term',
  spentThisTermMinor: 1_300_000,
  termPurchaseCount: 1,
  itemsBought: 3,
  sales: [portalPurchase()],
  ...overrides,
});

export const portalPriceList = (
  overrides: Partial<PortalPriceList> = {}
): PortalPriceList => ({
  levelName: 'JSS 1',
  books: [
    { name: 'Mathematics', priceMinor: 400_000, inStock: true },
    { name: 'Basic Science', priceMinor: 340_000, inStock: false },
  ],
  uniforms: [
    {
      name: 'School shirt',
      sizes: ['Size 8', 'Size 10', 'Size 12'],
      minPriceMinor: 400_000,
      maxPriceMinor: 450_000,
      inStock: true,
    },
    {
      name: 'School tie',
      sizes: [],
      minPriceMinor: 180_000,
      maxPriceMinor: 180_000,
      inStock: false,
    },
  ],
  paymentMethods: ['cash', 'pos', 'transfer'],
  ...overrides,
});

export const calendarCurrent = (
  overrides: Partial<CalendarCurrent> = {}
): CalendarCurrent => ({
  term: {
    id: 'b0f1e1e5-6e53-4c52-9f1c-0a1d7a7f9c11',
    schoolYearId: 'd0f1e1e5-6e53-4c52-9f1c-0a1d7a7f9c11',
    sequence: 1,
    name: 'First term',
    startsOn: '2026-09-07',
    endsOn: '2026-12-11',
    isCurrent: true,
    ended: false,
    schoolDays: 70,
    holidayCount: 0,
    holidays: [],
    canMakeCurrent: false,
  },
  schoolYear: {
    id: 'd0f1e1e5-6e53-4c52-9f1c-0a1d7a7f9c11',
    name: '2026/2027',
    startsOn: '2026-09-07',
    endsOn: '2027-07-23',
  },
  schoolDays: 70,
  schoolDaysSoFar: 24,
  ...overrides,
});

export const dayOffEntry = (
  overrides: Partial<DayOffEntry> = {}
): DayOffEntry => ({
  kind: 'holiday',
  name: 'Founders day',
  start: '2026-10-29',
  end: '2026-10-29',
  days: 1,
  ...overrides,
});

export const portalStatement = (
  overrides: Partial<PortalStatement> = {}
): PortalStatement => ({
  currency: 'NGN',
  student: {
    id: ADA_ID,
    name: 'Ada Okeke',
    admissionNumber: 'GF-0123',
    className: 'JSS 1 Gold',
    campusName: 'Lekki',
    archived: false,
  },
  totals: {
    balanceMinor: 6_000_000,
    totalMinor: 10_000_000,
    paidMinor: 4_000_000,
    reducedMinor: 0,
  },
  rows: [
    {
      effectiveOn: '2026-09-07',
      description: 'Term fees, First term',
      status: 'charged',
      amountMinor: 10_000_000,
    },
    {
      effectiveOn: '2026-09-12',
      description: 'Payment RCT-0001 from Ngozi Okeke (Bank transfer)',
      status: 'paid',
      amountMinor: 4_000_000,
    },
  ],
  total: 2,
  page: 1,
  pageSize: 10,
  unpaid: [{ number: 'CHG-0001', outstandingMinor: 6_000_000 }],
  term: null,
  broughtForward: null,
  closingMinor: null,
  termOptions: [],
  ...overrides,
});

export const portalFamilyStatement = (
  overrides: Partial<PortalFamilyStatement> = {}
): PortalFamilyStatement => ({
  currency: 'NGN',
  totalOwedMinor: 6_000_000,
  creditMinor: 0,
  children: [
    {
      studentId: ADA_ID,
      name: 'Ada Okeke',
      className: 'JSS 1 Gold',
      campusName: 'Lekki',
      archived: false,
      balanceMinor: 6_000_000,
    },
  ],
  term: null,
  termOptions: [],
  ...overrides,
});

const guardianAccess = (
  permissions: readonly Permission[] = ['student:readOwn']
): MePermissions => ({
  ...accessOfStarter('guardian', []),
  permissions: toPermissionMap(permissions),
  classScope: [],
});

export function renderWithApi(
  ui: ReactElement,
  api: Partial<Record<keyof Api, unknown>>,
  held: readonly Permission[] = ['student:readOwn']
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <PermissionsProvider value={guardianAccess(held)}>
        <ApiProvider api={checked(api)}>{ui}</ApiProvider>
      </PermissionsProvider>
    </QueryClientProvider>
  );
}

const WALLET_ID = testId(0x2_00_01);
const GUARDIAN_ID = testId(0x2_00_02);

export const walletChild = (over: Partial<WalletChild> = {}): WalletChild => ({
  studentId: ADA_ID,
  name: 'Ada Okeke',
  admissionNumber: 'GF-0123',
  inScope: true,
  owedMinor: 6_000_000,
  earmarkMinor: 0,
  spendableMinor: 5_000_000,
  oldestUnpaidOn: '2026-09-07',
  ...over,
});

export const portalWallet = (over: Partial<Wallet> = {}): Wallet => ({
  currency: 'NGN',
  id: WALLET_ID,
  guardian: { id: GUARDIAN_ID, name: 'Ngozi Okeke', phone: '08012345678' },
  reservedAccount: null,
  gatewayConnected: false,
  autoPay: false,
  balanceMinor: 5_000_000,
  setAsideMinor: 0,
  freeMinor: 5_000_000,
  children: [walletChild()],
  ...over,
});

export const portalMovement = (
  over: Partial<PortalWalletMovement> = {}
): PortalWalletMovement => ({
  id: testId(0x2_00_11),
  effectiveOn: '2026-10-07',
  postedAt: '2026-10-07T09:00:00.000Z',
  kind: 'wallet_topup',
  reference: 'CSH-20261007-K3Q7ZA',
  studentId: null,
  studentName: null,
  amountMinor: 5_000_000,
  source: { type: 'topup', method: 'cash', depositorName: 'Uncle Bode' },
  ...over,
});

export const portalMovements = (
  items: PortalWalletMovement[] = [portalMovement()],
  over: Partial<PortalWalletMovementList> = {}
): PortalWalletMovementList => ({
  currency: 'NGN',
  items,
  total: items.length,
  ...over,
});
