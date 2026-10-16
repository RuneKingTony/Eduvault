import {
  applicableLines,
  type FeeLineFacts,
  type StudentFeeFacts,
} from './applicable-lines';
import {
  discountLines,
  type DiscountFacts,
  type TermPosition,
} from './discount-caps';

export interface ChargeableFeeLine extends FeeLineFacts {
  id: string;
  feeTypeCode: number;
  name: string;
  amountMinor: number;
}

export interface ChargeLine {
  feeLineId: string | null;
  studentDiscountId: string | null;
  ledgerAccountId: string;
  description: string;
  amountMinor: number;
}

interface ChargeLineInput {
  feeLines: readonly ChargeableFeeLine[];
  student: StudentFeeFacts;
  discounts: readonly DiscountFacts[];
  term: TermPosition;
  discountsAccountId: string;
}

export const chargeTotal = (
  lines: readonly Pick<ChargeLine, 'amountMinor'>[]
) => lines.reduce((sum, line) => sum + line.amountMinor, 0);

export function chargeLines(input: ChargeLineInput): ChargeLine[] {
  const fees = applicableLines(input.feeLines, input.student).toSorted(
    (a, b) => a.feeTypeCode - b.feeTypeCode || a.name.localeCompare(b.name)
  );
  const discounts = discountLines(
    fees.map((fee) => ({
      feeTypeId: fee.feeTypeId,
      feeTypeCode: fee.feeTypeCode,
      amountMinor: fee.amountMinor,
    })),
    input.discounts,
    input.term
  );
  return [
    ...fees.map((fee) => ({
      feeLineId: fee.id,
      studentDiscountId: null,
      ledgerAccountId: fee.feeTypeId,
      description: fee.name,
      amountMinor: fee.amountMinor,
    })),
    ...discounts.map((discount) => ({
      feeLineId: null,
      studentDiscountId: discount.studentDiscountId,
      ledgerAccountId: input.discountsAccountId,
      description: discount.description,
      amountMinor: discount.amountMinor,
    })),
  ];
}
