import type { ApprovalItem, ApprovalKind } from '@eduvault/api-contract';
import { money } from '@eduvault/shared';
import type { AdjustmentsTab } from '../../adjustments-search';

type ToastDestination =
  '/finance/accounts' | '/finance/payments' | '/finance/store';

interface ApprovedToast {
  message: string;
  action: { label: string; to: ToastDestination } | null;
}

type KindTab = AdjustmentsTab | 'counts';

interface KindUi {
  resource: 'paymentVoids' | 'adjustments' | 'studentDiscounts' | 'stockCounts';
  tab: KindTab;
  approveEffect: string;
  declineEffect: string;
  approvedToast: ApprovedToast;
}

const FEES_UPDATED: ApprovedToast = {
  message: 'Approved. The student’s fees have been updated.',
  action: { label: 'Who owes', to: '/finance/accounts' },
};

export const APPROVAL_KIND_UI: Record<ApprovalKind, KindUi> = {
  payment_void: {
    resource: 'paymentVoids',
    tab: 'voids',
    approveEffect:
      'The receipt is kept but marked cancelled, and the family owes that money again.',
    declineEffect:
      'The payment stays recorded and nothing is cancelled. A new cancellation can be asked for.',
    approvedToast: {
      message: 'Approved. The payment is cancelled and the receipt is kept.',
      action: { label: 'Payments', to: '/finance/payments' },
    },
  },
  credit_note: {
    resource: 'adjustments',
    tab: 'corrections',
    approveEffect:
      'Reduces what the family owes. The original charge is untouched.',
    declineEffect:
      'The fee stays as charged and what the family owes is unchanged.',
    approvedToast: FEES_UPDATED,
  },
  write_off: {
    resource: 'adjustments',
    tab: 'corrections',
    approveEffect:
      'Cancels what the family still owes, because it will not be paid. The original charge is untouched.',
    declineEffect: 'The balance stays owed and nothing is cancelled.',
    approvedToast: FEES_UPDATED,
  },
  refund: {
    resource: 'adjustments',
    tab: 'corrections',
    approveEffect:
      'Posts the refund from the money account and reduces the credit held for the student.',
    declineEffect:
      'No money is paid back and the credit stays with the student.',
    approvedToast: FEES_UPDATED,
  },
  discount: {
    resource: 'studentDiscounts',
    tab: 'discounts',
    approveEffect:
      'Applies the discount to the student from the next round of charges.',
    declineEffect:
      'The discount is not applied and later charges stay as they are.',
    approvedToast: { message: 'Discount approved.', action: null },
  },
  store_write_off: {
    resource: 'stockCounts',
    tab: 'counts',
    approveEffect:
      'Brings store stock in line with the count and records the missing items as a loss at their average cost.',
    declineEffect: 'Stock stays as it is.',
    approvedToast: {
      message: 'Approved. Stock now matches the count.',
      action: { label: 'Store', to: '/finance/store' },
    },
  },
};

export const DECLINED_TOAST = 'Declined. The request is kept with your reason.';

export const amountOf = (item: ApprovalItem, currency: string): string =>
  item.amountMinor === null
    ? (item.amountText ?? '')
    : money(item.amountMinor, currency);
