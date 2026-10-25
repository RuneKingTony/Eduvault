import type { ReactElement } from 'react';

import type {
  MePermissions,
  RefundOptions,
  RequestedWalletCancellation,
  RequestedWalletRefund,
  ToppedUpWallet,
  TopUpOptions,
  Wallet,
  WalletCancellationRequest,
  WalletChild,
  WalletList,
  WalletMovement,
  WalletMovementList,
  WalletRefundRequest,
  WalletRequestList,
  WalletSummary,
} from '@eduvault/api-contract';
import { parseAccountsSearch, parseStatementSearch } from './accounts-search';
import type { Api } from './api';
import { testId } from './test-api';
import { parseWalletSearch, parseWalletsSearch } from './wallets-search';
import { ownerAccess, renderRoutes } from './test-utils';

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
const ENTRY_C = testId(0x1_70_73);
const LINE_C = testId(0x1_70_63);
const GATEWAY_TOP_UP_ID = testId(0x1_70_43);
const REFUND_ID = testId(0x1_70_81);
const CANCELLATION_ID = testId(0x1_70_82);
const REFUND_FILE_ID = testId(0x1_70_52);
const LINE_D = testId(0x1_70_64);
const ENTRY_D = testId(0x1_70_74);
export const TOP_UP_MOVEMENT_ID = TOP_UP_ID;

export const walletChild = (over: Partial<WalletChild> = {}): WalletChild => ({
  studentId: ADA,
  name: 'Ada Okeke',
  admissionNumber: 'GF-0001',
  inScope: true,
  owedMinor: 18_000_000,
  earmarkMinor: 0,
  spendableMinor: 5_000_000,
  oldestUnpaidOn: '2026-09-01',
  ...over,
});

export const wallet = (over: Partial<Wallet> = {}): Wallet => ({
  currency: 'NGN',
  id: WALLET_ID,
  guardian: { id: GUARDIAN_ID, name: 'Ngozi Okeke', phone: '08012345678' },
  reservedAccount: null,
  gatewayConnected: false,
  autoPay: false,
  balanceMinor: 5_000_000,
  setAsideMinor: 1_000_000,
  heldMinor: 0,
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
  heldMinor: 0,
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
    heldMinor: items.reduce((sum, item) => sum + item.heldMinor, 0),
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
    cancellation: null,
  },
  madeBy: 'Chika Eze',
  ...over,
});

export const monnifyMovement = (
  over: Partial<WalletMovement> = {}
): WalletMovement =>
  movement({
    lineId: LINE_C,
    entryId: ENTRY_C,
    effectiveOn: '2026-10-24',
    reference: 'MNFY|20|20261024120000|000001',
    amountMinor: 4_950_000,
    source: {
      type: 'monnify',
      id: GATEWAY_TOP_UP_ID,
      transactionReference: 'MNFY|20|20261024120000|000001',
      paymentReference: 'pay-1',
      signatureVerified: true,
      paidAt: '2026-10-24T11:15:29.000Z',
      confirmedAt: '2026-10-24T11:15:31.000Z',
      grossMinor: 5_000_000,
      feeMinor: 50_000,
      netMinor: 4_950_000,
    },
    madeBy: null,
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

export const refundMovement = (): WalletMovement =>
  movement({
    lineId: LINE_D,
    entryId: ENTRY_D,
    effectiveOn: '2026-10-26',
    kind: 'wallet_refund',
    reference: 'WRF-WRQ-20261026-A1B2C3',
    amountMinor: -1_500_000,
    source: { type: 'refund', id: REFUND_ID, payoutReference: 'NIP-8841' },
    madeBy: 'Adaeze Obi',
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

export const refundOptions = (
  over: Partial<RefundOptions> = {}
): RefundOptions => ({
  currency: 'NGN',
  accounts: [{ id: BANK, label: 'GTBank current · ending 4417', kind: 'bank' }],
  ...over,
});

export const refundRequest = (
  over: Partial<WalletRefundRequest> = {}
): WalletRefundRequest => ({
  kind: 'wallet_refund',
  id: REFUND_ID,
  status: 'submitted',
  reference: 'WRQ-20261026-A1B2C3',
  reason: 'Paid twice by mistake',
  amountMinor: 1_500_000,
  wallet: { id: WALLET_ID, guardianName: 'Ngozi Okeke' },
  createdBy: 'Chika Eze',
  createdAt: '2026-10-26T08:00:00.000Z',
  decidedBy: null,
  decidedAt: null,
  rejectionReason: null,
  parentEmail: 'ngozi@example.com',
  moneyAccountName: 'GTBank current',
  payoutReference: null,
  proofFileId: REFUND_FILE_ID,
  ...over,
});

export const cancellationRequest = (
  over: Partial<WalletCancellationRequest> = {}
): WalletCancellationRequest => ({
  kind: 'wallet_topup_cancellation',
  id: CANCELLATION_ID,
  status: 'submitted',
  reference: 'WTQ-20261026-D4E5F6',
  reason: 'Keyed against the wrong family',
  amountMinor: 5_000_000,
  wallet: { id: WALLET_ID, guardianName: 'Ngozi Okeke' },
  createdBy: 'Chika Eze',
  createdAt: '2026-10-26T09:00:00.000Z',
  decidedBy: null,
  decidedAt: null,
  rejectionReason: null,
  topUp: { id: TOP_UP_ID, reference: 'CSH-20261007-K3Q7ZA' },
  ...over,
});

export const requestList = (
  items: WalletRequestList['items'] = [cancellationRequest(), refundRequest()],
  over: Partial<WalletRequestList> = {}
): WalletRequestList => ({
  currency: 'NGN',
  items,
  total: items.length,
  waitingCount: items.filter((row) => row.status === 'submitted').length,
  ...over,
});

export const requestedRefund = (
  over: Partial<RequestedWalletRefund> = {}
): RequestedWalletRefund => ({
  request: refundRequest(),
  replayed: false,
  wallet: wallet({ heldMinor: 1_500_000, freeMinor: 2_500_000 }),
  ...over,
});

export const requestedCancellation = (
  over: Partial<RequestedWalletCancellation> = {}
): RequestedWalletCancellation => ({
  request: cancellationRequest(),
  replayed: false,
  wallet: wallet({ heldMinor: 5_000_000, freeMinor: -1_000_000 }),
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
  const routes = [
    ['/finance/wallets', parseWalletsSearch],
    ['/finance/wallets/$walletId', parseWalletSearch],
    ['/finance/accounts', parseAccountsSearch],
    ['/finance/accounts/$studentId', parseStatementSearch],
    ['/approvals', undefined],
  ] as const;
  return renderRoutes(page, api, { routes, access, path });
}
