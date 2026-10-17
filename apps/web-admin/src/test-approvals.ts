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
} from '@eduvault/api-contract';

const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

export const VOID_ID = id(701);
export const ADJUSTMENT_ID = id(702);
export const DISCOUNT_ID = id(703);
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
): ApprovalSummary => {
  const preview = [voidApproval(), approvalItem()];
  return {
    currency: 'NGN',
    waitingForMe: preview.length,
    byNav: { approvals: preview.length, payments: preview.length },
    preview,
    ...over,
  };
};

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

const voidRow = (over: Partial<PaymentVoidItem> = {}): PaymentVoidItem => ({
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

export const discountRow = (
  over: Partial<StudentDiscount> = {}
): StudentDiscount => ({
  id: DISCOUNT_ID,
  student: { id: HALIMA, name: 'Halima Bello', admissionNumber: 'GF-0158' },
  kind: 'percent',
  value: 50,
  feeType: { id: id(721), name: 'Tuition' },
  reason: 'Academic scholarship',
  fromTerm: { id: id(731), name: 'Second term, 2026/2027' },
  toTerm: { id: id(732), name: 'Third term, 2026/2027' },
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
