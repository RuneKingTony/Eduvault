export type DiscountKind = 'percent' | 'fixed';
export type DiscountStatus = 'submitted' | 'approved' | 'rejected';

export interface TermPosition {
  sessionStartsOn: string;
  sequence: number;
}

export interface DiscountBaseLine {
  feeTypeId: string;
  feeTypeCode: number;
  amountMinor: number;
}

export interface DiscountFacts {
  id: string;
  status: DiscountStatus;
  kind: DiscountKind;
  value: number;
  feeTypeId: string | null;
  feeTypeName: string | null;
  reason: string;
  approvedAt: string | null;
  from: TermPosition;
  to: TermPosition | null;
}

interface DiscountLine {
  studentDiscountId: string;
  description: string;
  amountMinor: number;
}

export function compareTerms(a: TermPosition, b: TermPosition): number {
  if (a.sessionStartsOn === b.sessionStartsOn) {
    return a.sequence - b.sequence;
  }
  return a.sessionStartsOn < b.sessionStartsOn ? -1 : 1;
}

export const termInRange = (
  term: TermPosition,
  discount: Pick<DiscountFacts, 'from' | 'to'>
): boolean =>
  compareTerms(term, discount.from) >= 0 &&
  (discount.to === null || compareTerms(term, discount.to) <= 0);

export const percentOf = (base: number, percent: number): number =>
  Math.floor((base * percent + 50) / 100);

export function discountDescription(
  discount: Pick<
    DiscountFacts,
    'kind' | 'value' | 'reason' | 'feeTypeId' | 'feeTypeName'
  >
): string {
  if (discount.kind === 'fixed') {
    return discount.reason;
  }
  const target =
    discount.feeTypeId === null
      ? 'the charge'
      : (discount.feeTypeName ?? '').toLowerCase();
  return `${discount.reason} (${discount.value}% of ${target})`;
}

const byApproval = (a: DiscountFacts, b: DiscountFacts): number =>
  (a.approvedAt ?? '').localeCompare(b.approvedAt ?? '') ||
  a.id.localeCompare(b.id);

interface Headroom {
  code: number;
  left: number;
}

function headroomOf(fees: readonly DiscountBaseLine[]): Map<string, Headroom> {
  const headroom = new Map<string, Headroom>();
  for (const fee of fees) {
    const held = headroom.get(fee.feeTypeId);
    if (held === undefined) {
      headroom.set(fee.feeTypeId, {
        code: fee.feeTypeCode,
        left: fee.amountMinor,
      });
    } else {
      held.left += fee.amountMinor;
    }
  }
  return headroom;
}

function takeFrom(
  headroom: Map<string, Headroom>,
  feeTypeId: string | null,
  wanted: number
): number {
  const pools =
    feeTypeId === null
      ? [...headroom.values()].toSorted((a, b) => a.code - b.code)
      : [headroom.get(feeTypeId)].filter((pool) => pool !== undefined);
  let remaining = wanted;
  for (const pool of pools) {
    const taken = Math.min(remaining, pool.left);
    pool.left -= taken;
    remaining -= taken;
  }
  return wanted - remaining;
}

function baseOf(
  fees: readonly DiscountBaseLine[],
  feeTypeId: string | null
): number {
  return fees
    .filter((fee) => feeTypeId === null || fee.feeTypeId === feeTypeId)
    .reduce((sum, fee) => sum + fee.amountMinor, 0);
}

function wantedAmount(discount: DiscountFacts, base: number): number {
  const amount =
    discount.kind === 'percent'
      ? percentOf(base, discount.value)
      : discount.value;
  return Math.min(amount, base);
}

export function discountLines(
  fees: readonly DiscountBaseLine[],
  discounts: readonly DiscountFacts[],
  term: TermPosition
): DiscountLine[] {
  const headroom = headroomOf(fees);
  const lines: DiscountLine[] = [];
  const applying = discounts
    .filter(
      (discount) =>
        discount.status === 'approved' && termInRange(term, discount)
    )
    .toSorted(byApproval);
  for (const discount of applying) {
    const base = baseOf(fees, discount.feeTypeId);
    const taken = takeFrom(
      headroom,
      discount.feeTypeId,
      wantedAmount(discount, base)
    );
    if (taken > 0) {
      lines.push({
        studentDiscountId: discount.id,
        description: discountDescription(discount),
        amountMinor: -taken,
      });
    }
  }
  return lines;
}

export function pendingDiscountReasons(
  discounts: readonly DiscountFacts[],
  term: TermPosition
): string[] {
  return discounts
    .filter(
      (discount) =>
        discount.status === 'submitted' && termInRange(term, discount)
    )
    .map((discount) => discount.reason);
}
