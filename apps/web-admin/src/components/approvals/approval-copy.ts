import {
  CalendarDaysIcon,
  PackageIcon,
  WalletIcon,
  type LucideIcon,
} from 'lucide-react';
import type { ApprovalItem, ApprovalKind } from '@eduvault/api-contract';
import { money } from '@eduvault/shared';
import type { AdjustmentsTab } from '../../adjustments-search';

type ToastDestination =
  | '/finance/accounts'
  | '/finance/payments'
  | '/finance/store'
  | '/finance/wallets';

interface ApprovedToast {
  message: string;
  action: { label: string; to: ToastDestination } | null;
}

type KindTab = AdjustmentsTab | 'counts' | 'requests';

interface KindUi {
  resource:
    | 'paymentVoids'
    | 'adjustments'
    | 'studentDiscounts'
    | 'leave'
    | 'stockCounts'
    | 'walletRefunds'
    | 'walletTopUpCancellations';
  tab: KindTab | 'leave';
  icon: LucideIcon;
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
    icon: WalletIcon,
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
    icon: WalletIcon,
    approveEffect:
      'Reduces what the family owes. The original charge is untouched.',
    declineEffect:
      'The fee stays as charged and what the family owes is unchanged.',
    approvedToast: FEES_UPDATED,
  },
  write_off: {
    resource: 'adjustments',
    tab: 'corrections',
    icon: WalletIcon,
    approveEffect:
      'Cancels what the family still owes, because it will not be paid. The original charge is untouched.',
    declineEffect: 'The balance stays owed and nothing is cancelled.',
    approvedToast: FEES_UPDATED,
  },
  refund: {
    resource: 'adjustments',
    tab: 'corrections',
    icon: WalletIcon,
    approveEffect:
      'Posts the refund from the money account and reduces the credit held for the student.',
    declineEffect:
      'No money is paid back and the credit stays with the student.',
    approvedToast: FEES_UPDATED,
  },
  discount: {
    resource: 'studentDiscounts',
    tab: 'discounts',
    icon: WalletIcon,
    approveEffect:
      'Applies the discount to the student from the next round of charges.',
    declineEffect:
      'The discount is not applied and later charges stay as they are.',
    approvedToast: { message: 'Discount approved.', action: null },
  },
  leave: {
    resource: 'leave',
    tab: 'leave',
    icon: CalendarDaysIcon,
    approveEffect:
      'The staff member is marked on leave for those school days and sees your decision on their Approvals page.',
    declineEffect: 'Nothing is changed.',
    approvedToast: { message: 'Leave approved for {name}.', action: null },
  },
  store_write_off: {
    resource: 'stockCounts',
    tab: 'counts',
    icon: PackageIcon,
    approveEffect:
      'Brings store stock in line with the count and records the missing items as a loss at their average cost.',
    declineEffect: 'Stock stays as it is.',
    approvedToast: {
      message: 'Approved. Stock now matches the count.',
      action: { label: 'Store', to: '/finance/store' },
    },
  },
  wallet_refund: {
    resource: 'walletRefunds',
    tab: 'requests',
    icon: WalletIcon,
    approveEffect:
      'Pays the money back: it leaves the family’s wallet and the bank account. Enter the bank’s own reference for the payout.',
    declineEffect:
      'No money is paid back and the held money goes back to the family’s wallet.',
    approvedToast: {
      message: 'Approved. The refund is recorded and the wallet is reduced.',
      action: { label: 'Wallets', to: '/finance/wallets' },
    },
  },
  wallet_topup_cancellation: {
    resource: 'walletTopUpCancellations',
    tab: 'requests',
    icon: WalletIcon,
    approveEffect:
      'Takes the top-up back out of the wallet with a new entry. The original top-up stays on record.',
    declineEffect:
      'The top-up stays in the wallet and the held money is released.',
    approvedToast: {
      message: 'Approved. The top-up is cancelled and the wallet is reduced.',
      action: { label: 'Wallets', to: '/finance/wallets' },
    },
  },
};

export const approvedMessage = (item: ApprovalItem): string =>
  APPROVAL_KIND_UI[item.kind].approvedToast.message.replace(
    '{name}',
    item.createdBy.name
  );

export const ALREADY_DECIDED_TOAST =
  'Someone has already decided this request.';

const OWN_TIP: Partial<Record<ApprovalKind, string>> = {
  leave: 'You asked for this. Someone else must decide.',
};
const WALLET_OTHER_TIP = 'Needs someone who can approve wallet refunds';
const OTHER_TIP: Partial<Record<ApprovalKind, string>> = {
  leave: 'Someone with leave approval decides.',
  wallet_refund: WALLET_OTHER_TIP,
  wallet_topup_cancellation: WALLET_OTHER_TIP,
};
const MONEY_OTHER_TIP = 'Needs someone who can approve money changes';

export const ownTip = (kind: ApprovalKind, fallback: string): string =>
  OWN_TIP[kind] ?? fallback;

export const otherTip = (kind: ApprovalKind): string =>
  OTHER_TIP[kind] ?? MONEY_OTHER_TIP;

export const DECLINED_TOAST = 'Declined. The request is kept with your reason.';

export const amountOf = (item: ApprovalItem, currency: string): string =>
  item.amountMinor === null
    ? (item.amountText ?? '')
    : money(item.amountMinor, currency);
