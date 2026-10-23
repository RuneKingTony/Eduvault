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
  MePermissions,
  ToppedUpWallet,
  TopUpOptions,
  Wallet,
  WalletChild,
  WalletList,
  WalletMovement,
  WalletMovementList,
  WalletSummary,
} from '@eduvault/api-contract';
import { PermissionsProvider } from '@eduvault/auth-client';
import { TooltipProvider } from '@eduvault/ui';
import { parseAccountsSearch, parseStatementSearch } from './accounts-search';
import { ApiProvider, type Api } from './api';
import { checked, testId } from './test-api';
import { parseWalletSearch, parseWalletsSearch } from './wallets-search';
import { ownerAccess } from './test-utils';

export const WALLET_ID = testId(0x1_70_01);
export const OTHER_WALLET_ID = testId(0x1_70_02);
const GUARDIAN_ID = testId(0x1_70_11);
export const OTHER_GUARDIAN_ID = testId(0x1_70_12);
const ADA = testId(0x1_70_21);
export const TOBI = testId(0x1_70_22);
export const TILL = testId(0x1_70_31);
export const BANK = testId(0x1_70_32);
const TOP_UP_ID = testId(0x1_70_41);
const SPEND_ID = testId(0x1_70_42);
export const RECEIPT_FILE_ID = testId(0x1_70_51);
const LINE_A = testId(0x1_70_61);
const LINE_B = testId(0x1_70_62);
const ENTRY_A = testId(0x1_70_71);
const ENTRY_B = testId(0x1_70_72);

export const walletChild = (over: Partial<WalletChild> = {}): WalletChild => ({
  studentId: ADA,
  name: 'Ada Okeke',
  admissionNumber: 'GF-0001',
  inScope: true,
  owedMinor: 18_000_000,
  earmarkMinor: 0,
  spendableMinor: 5_000_000,
  ...over,
});

export const wallet = (over: Partial<Wallet> = {}): Wallet => ({
  currency: 'NGN',
  id: WALLET_ID,
  guardian: { id: GUARDIAN_ID, name: 'Ngozi Okeke', phone: '08012345678' },
  balanceMinor: 5_000_000,
  setAsideMinor: 1_000_000,
  freeMinor: 4_000_000,
  children: [
    walletChild({ earmarkMinor: 1_000_000 }),
    walletChild({
      studentId: TOBI,
      name: 'Tobi Okeke',
      admissionNumber: 'GF-0002',
      owedMinor: 0,
      spendableMinor: 0,
    }),
  ],
  ...over,
});

export const walletSummary = (
  over: Partial<WalletSummary> = {}
): WalletSummary => ({
  id: WALLET_ID,
  guardianId: GUARDIAN_ID,
  guardianName: 'Ngozi Okeke',
  guardianPhone: '08012345678',
  childCount: 2,
  balanceMinor: 5_000_000,
  setAsideMinor: 1_000_000,
  freeMinor: 4_000_000,
  ...over,
});

export const walletList = (
  items: WalletSummary[] = [walletSummary()],
  over: Partial<WalletList> = {}
): WalletList => ({
  currency: 'NGN',
  items,
  total: items.length,
  totals: {
    walletCount: items.length,
    balanceMinor: items.reduce((sum, item) => sum + item.balanceMinor, 0),
    setAsideMinor: items.reduce((sum, item) => sum + item.setAsideMinor, 0),
    freeMinor: items.reduce((sum, item) => sum + item.freeMinor, 0),
  },
  ...over,
});

export const movement = (
  over: Partial<WalletMovement> = {}
): WalletMovement => ({
  lineId: LINE_A,
  entryId: ENTRY_A,
  effectiveOn: '2026-10-07',
  postedAt: '2026-10-07T09:00:00.000Z',
  kind: 'wallet_topup',
  reference: 'CSH-20261007-K3Q7ZA',
  studentId: null,
  studentName: null,
  amountMinor: 5_000_000,
  source: {
    type: 'topup',
    id: TOP_UP_ID,
    method: 'cash',
    depositorName: 'Uncle Bode',
    proofFileId: RECEIPT_FILE_ID,
  },
  madeBy: 'Chika Eze',
  ...over,
});

export const spendMovement = (): WalletMovement =>
  movement({
    lineId: LINE_B,
    entryId: ENTRY_B,
    effectiveOn: '2026-10-09',
    kind: 'wallet_spend',
    reference: 'WSP-20261009-A1B2C3',
    studentId: ADA,
    studentName: 'Ada Okeke',
    amountMinor: -1_500_000,
    source: { type: 'spend', id: SPEND_ID },
    madeBy: 'Ngozi Okeke',
  });

export const movementList = (
  items: WalletMovement[] = [movement()],
  over: Partial<WalletMovementList> = {}
): WalletMovementList => ({
  currency: 'NGN',
  items,
  total: items.length,
  ...over,
});

export const topUpOptions = (
  over: Partial<TopUpOptions> = {}
): TopUpOptions => ({
  currency: 'NGN',
  today: '2026-10-07',
  accounts: [
    { id: TILL, label: 'Lekki cash till', kind: 'cash' },
    { id: BANK, label: 'GTBank current · ending 4417', kind: 'bank' },
  ],
  methods: { cash: true, transfer: true, pos: true },
  ...over,
});

export const toppedUp = (
  over: Partial<ToppedUpWallet> = {}
): ToppedUpWallet => ({
  id: TOP_UP_ID,
  reference: 'CSH-20261007-K3Q7ZA',
  amountMinor: 5_000_000,
  method: 'cash',
  receivedOn: '2026-10-07',
  replayed: false,
  wallet: wallet(),
  ...over,
});

interface RenderOptions {
  access?: MePermissions;
  path?: string;
}

export function renderWallets(
  page: ReactElement,
  api: Partial<Record<keyof Api, unknown>>,
  { access = ownerAccess(), path = '/finance/wallets' }: RenderOptions = {}
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
    ['/finance/wallets', parseWalletsSearch],
    ['/finance/wallets/$walletId', parseWalletSearch],
    ['/finance/accounts', parseAccountsSearch],
    ['/finance/accounts/$studentId', parseStatementSearch],
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
