import type { ApprovalStatus, StudentDiscount } from '@eduvault/api-contract';
import { money } from '@eduvault/shared';

export const STATUS_LABELS: Record<ApprovalStatus, string> = {
  submitted: 'Waiting',
  approved: 'Approved',
  rejected: 'Declined',
};

export const STATUS_VARIANTS = {
  submitted: 'warning',
  approved: 'success',
  rejected: 'destructive',
} as const satisfies Record<ApprovalStatus, string>;

export const approvedTip = (approvedBy: string | null): string | undefined =>
  approvedBy === null ? undefined : `Approved by ${approvedBy}`;

export const isEnded = (discount: StudentDiscount): boolean =>
  discount.status === 'approved' && discount.endedAt !== null;

export const discountStatus = (discount: StudentDiscount): string =>
  isEnded(discount) ? 'Ended' : STATUS_LABELS[discount.status];

export function discountBadge(
  discount: StudentDiscount,
  currency: string
): string {
  if (discount.kind === 'fixed') {
    return `${money(discount.value, currency)} off`;
  }
  const target =
    discount.feeType === null ? 'charge' : discount.feeType.name.toLowerCase();
  return `${discount.value}% ${target}`;
}

export const discountTerms = (discount: StudentDiscount): string =>
  discount.toTerm === null
    ? `${discount.fromTerm.name} onward`
    : `${discount.fromTerm.name} to ${discount.toTerm.name}`;
