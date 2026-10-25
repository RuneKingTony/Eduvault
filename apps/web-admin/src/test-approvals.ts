import type {
  Adjustment,
  AdjustmentList,
  ApprovalItem,
  ApprovalList,
  ApprovalSummary,
  PaymentVoidItem,
  PaymentVoidList,
  StudentDiscount,
  StudentDiscountList,
  TermChoice,
} from '@eduvault/api-contract';
import { approvedLeave, declinedLeave } from './test-leave';
import { stockCount } from './test-store';
import { cancellationRequest, refundRequest } from './test-wallets';

const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

export const approvalIdAt = (n: number) => id(1000 + n);

export const VOID_ID = id(701);
const ADJUSTMENT_ID = id(702);
export const DISCOUNT_ID = id(703);
export const COUNT_APPROVAL_ID = id(704);
export const BOLA = id(711);
const HALIMA = id(712);

export const approvalItem = (
  over: Partial<ApprovalItem> = {}
): ApprovalItem => ({
  kind: 'write_off',
  id: ADJUSTMENT_ID,
  label: 'Cancel a balance',
  details: 'Bola Johnson: Family moved to Abuja',
  amountMinor: 1_200_000,
  amountText: null,
  createdBy: { id: id(801), name: 'Chika Eze' },
  createdAt: '2026-10-16T08:00:00.000Z',
  campusId: null,
  decide: 'yes',
  ...over,
});

export const voidApproval = (over: Partial<ApprovalItem> = {}): ApprovalItem =>
  approvalItem({
    kind: 'payment_void',
    id: VOID_ID,
    label: 'Cancel a payment',
    details: 'RCT-2026-00098 from Mrs Danjuma: Keyed the wrong child',
    amountMinor: 2_000_000,
    createdAt: '2026-10-15T08:00:00.000Z',
    ...over,
  });

export const discountApproval = (
  over: Partial<ApprovalItem> = {}
): ApprovalItem =>
  approvalItem({
    kind: 'discount',
    id: DISCOUNT_ID,
    label: 'Discount',
    details: 'Halima Bello: Scholarship (50%)',
    amountMinor: null,
    amountText: '50% off',
    ...over,
  });

export const leaveApproval = (over: Partial<ApprovalItem> = {}): ApprovalItem =>
  approvalItem({
    kind: 'leave',
    id: id(704),
    label: 'Leave',
    details: 'Ayo Bassey · Sick leave · 12 Oct 2026 – 13 Oct 2026. Malaria',
    amountMinor: null,
    amountText: '2 days',
    createdBy: { id: id(802), name: 'Ayo Bassey' },
    createdAt: '2026-10-14T08:00:00.000Z',
    ...over,
  });

export const approvalList = (
  items: ApprovalItem[] = [voidApproval(), approvalItem()],
  over: Partial<ApprovalList> = {}
): ApprovalList => ({
  currency: 'NGN',
  items,
  total: items.length,
  othersCount: 0,
  pillars: {
    money: items.filter((item) => item.kind !== 'leave').length,
    leave: items.filter((item) => item.kind === 'leave').length,
  },
  ...over,
});

export const approvalSummary = (
  over: Partial<ApprovalSummary> = {}
): ApprovalSummary => ({
  currency: 'NGN',
  waitingForMe: 7,
  byNav: { approvals: 3, payments: 4, store: 0, wallets: 0 },
  preview: [voidApproval(), approvalItem()],
  ...over,
});

export const adjustmentRow = (over: Partial<Adjustment> = {}): Adjustment => ({
  id: ADJUSTMENT_ID,
  number: 'ADJ-2026-0003',
  kind: 'write_off',
  student: { id: BOLA, name: 'Bola Johnson', admissionNumber: 'GF-0087' },
  amountMinor: 1_200_000,
  reason: 'Family moved to Abuja',
  status: 'submitted',
  createdBy: 'Chika Eze',
  createdAt: '2026-10-16T08:00:00.000Z',
  approvedBy: null,
  rejectionReason: null,
  ledgerAccountId: null,
  moneyAccountId: null,
  invoiceId: null,
  journalEntryId: null,
  ...over,
});

const listOf = <T extends { status: string }>(items: T[]) => ({
  currency: 'NGN',
  items,
  total: items.length,
  waitingCount: items.filter((row) => row.status === 'submitted').length,
});

export const adjustmentList = (
  items: Adjustment[] = [adjustmentRow()],
  over: Partial<AdjustmentList> = {}
): AdjustmentList => ({ ...listOf(items), ...over });

export const voidRow = (
  over: Partial<PaymentVoidItem> = {}
): PaymentVoidItem => ({
  id: VOID_ID,
  status: 'submitted',
  reason: 'Keyed the wrong child',
  createdBy: 'Chika Eze',
  approvedBy: null,
  rejectionReason: null,
  createdAt: '2026-10-15T08:00:00.000Z',
  payment: {
    id: '00000000-0000-4000-8000-0000000c0001',
    receiptNumber: 'RCT-2026-00098',
    payerName: 'Mrs Danjuma',
  },
  amountMinor: 2_000_000,
  ...over,
});

export const voidList = (
  items: PaymentVoidItem[] = [voidRow()],
  over: Partial<PaymentVoidList> = {}
): PaymentVoidList => ({ ...listOf(items), ...over });

export const TERM_1 = id(741);
export const TERM_2 = id(742);
export const TERM_3 = id(743);
const TERM_4 = id(744);
const TERM_5 = id(745);
const TERM_6 = id(746);

export const termChoices = (): TermChoice[] => [
  {
    id: TERM_1,
    label: 'First term, 2026/2027',
    startsOn: '2026-09-07',
    isCurrent: true,
  },
  {
    id: TERM_2,
    label: 'Second term, 2026/2027',
    startsOn: '2027-01-04',
    isCurrent: false,
  },
  {
    id: TERM_3,
    label: 'Third term, 2026/2027',
    startsOn: '2027-04-19',
    isCurrent: false,
  },
  {
    id: TERM_4,
    label: 'First term, 2027/2028',
    startsOn: '2027-09-06',
    isCurrent: false,
  },
  {
    id: TERM_5,
    label: 'Second term, 2027/2028',
    startsOn: '2028-01-03',
    isCurrent: false,
  },
  {
    id: TERM_6,
    label: 'Third term, 2027/2028',
    startsOn: '2028-04-24',
    isCurrent: false,
  },
];

export const discountRow = (
  over: Partial<StudentDiscount> = {}
): StudentDiscount => ({
  id: DISCOUNT_ID,
  student: { id: HALIMA, name: 'Halima Bello', admissionNumber: 'GF-0158' },
  kind: 'percent',
  value: 50,
  feeType: { id: id(721), name: 'Tuition' },
  reason: 'Academic scholarship',
  fromTerm: { id: TERM_2, name: 'Second term, 2026/2027' },
  toTerm: { id: TERM_3, name: 'Third term, 2026/2027' },
  status: 'submitted',
  createdBy: 'Chika Eze',
  createdAt: '2026-10-14T08:00:00.000Z',
  approvedBy: null,
  rejectionReason: null,
  endedAt: null,
  ...over,
});

export const discountList = (
  items: StudentDiscount[] = [discountRow()],
  over: Partial<StudentDiscountList> = {}
): StudentDiscountList => ({ ...listOf(items), ...over });

export const storeWriteOffApproval = (
  over: Partial<ApprovalItem> = {}
): ApprovalItem =>
  approvalItem({
    kind: 'store_write_off',
    id: COUNT_APPROVAL_ID,
    label: 'Store write-off',
    details:
      'Lekki stock count: School shirt, Size 14: 2 missing; School tie: 1 missing',
    amountMinor: 820_000,
    campusId: id(901),
    ...over,
  });

export const walletRefundApproval = (
  over: Partial<ApprovalItem> = {}
): ApprovalItem =>
  approvalItem({
    kind: 'wallet_refund',
    id: id(705),
    label: 'Wallet refund',
    details: 'Refund to Ngozi Okeke: Paid twice by mistake',
    amountMinor: 1_500_000,
    createdAt: '2026-10-26T08:00:00.000Z',
    ...over,
  });

export const walletCancellationApproval = (
  over: Partial<ApprovalItem> = {}
): ApprovalItem =>
  approvalItem({
    kind: 'wallet_topup_cancellation',
    id: id(706),
    label: 'Cancel a top-up',
    details:
      'Top-up CSH-20261007-K3Q7ZA of Ngozi Okeke: Keyed against the wrong family',
    amountMinor: 5_000_000,
    createdAt: '2026-10-26T09:00:00.000Z',
    ...over,
  });

export const decisionApi = () => ({
  walletRefunds: {
    approve: vi.fn().mockResolvedValue(refundRequest({ status: 'approved' })),
    decline: vi.fn().mockResolvedValue(refundRequest({ status: 'rejected' })),
  },
  walletTopUpCancellations: {
    approve: vi
      .fn()
      .mockResolvedValue(cancellationRequest({ status: 'approved' })),
    decline: vi
      .fn()
      .mockResolvedValue(cancellationRequest({ status: 'rejected' })),
  },
  paymentVoids: {
    approve: vi.fn().mockResolvedValue(voidRow({ status: 'approved' })),
    decline: vi.fn().mockResolvedValue(voidRow({ status: 'rejected' })),
  },
  adjustments: {
    approve: vi.fn().mockResolvedValue(adjustmentRow({ status: 'approved' })),
    decline: vi.fn().mockResolvedValue(adjustmentRow({ status: 'rejected' })),
  },
  studentDiscounts: {
    approve: vi.fn().mockResolvedValue(discountRow({ status: 'approved' })),
    decline: vi.fn().mockResolvedValue(discountRow({ status: 'rejected' })),
  },
  leave: {
    approve: vi.fn().mockResolvedValue(approvedLeave()),
    decline: vi.fn().mockResolvedValue(declinedLeave()),
  },
  stockCounts: {
    approve: vi.fn().mockResolvedValue(stockCount({ status: 'approved' })),
    decline: vi.fn().mockResolvedValue(stockCount({ status: 'rejected' })),
  },
});
