import {
  ADJUSTMENT_REASON_MESSAGE,
  DISCOUNT_PERCENT_MESSAGE,
  DISCOUNT_UNTIL_MESSAGE,
  DISCOUNT_VALUE_MESSAGE,
  type CreateStudentDiscountInput,
  type DiscountKind,
} from '@eduvault/api-contract';
import { parseNaira } from '@eduvault/shared';

export const WHOLE_CHARGE = 'whole-charge';

export interface DiscountState {
  studentId: string;
  kind: DiscountKind;
  value: string;
  feeTypeId: string;
  fromTermId: string;
  toTermId: string;
  reason: string;
}

export type DiscountField = 'student' | 'value' | 'until' | 'reason';
export type DiscountErrors = Partial<Record<DiscountField, string>>;

const WHOLE_NUMBER = /^\d{1,3}$/;
const PERCENT_MAX = 100;

export function valueOf(
  state: Pick<DiscountState, 'kind' | 'value'>
): number | undefined {
  if (state.kind === 'percent') {
    const text = state.value.trim();
    return WHOLE_NUMBER.test(text) ? Number(text) : undefined;
  }
  return parseNaira(state.value);
}

export function validateDiscount(
  state: DiscountState,
  untilBeforeFrom: boolean
): DiscountErrors {
  const errors: DiscountErrors = {};
  const value = valueOf(state);
  if (state.studentId === '' || value === undefined || value <= 0) {
    errors.student = DISCOUNT_VALUE_MESSAGE;
  } else if (state.kind === 'percent' && value > PERCENT_MAX) {
    errors.value = DISCOUNT_PERCENT_MESSAGE;
  }
  if (state.toTermId !== '' && untilBeforeFrom) {
    errors.until = DISCOUNT_UNTIL_MESSAGE;
  }
  if (state.reason.trim() === '') {
    errors.reason = ADJUSTMENT_REASON_MESSAGE;
  }
  return errors;
}

export function toDiscountBody(
  state: DiscountState
): CreateStudentDiscountInput {
  return {
    studentId: state.studentId,
    kind: state.kind,
    value: valueOf(state) ?? 0,
    ledgerAccountId: state.feeTypeId === WHOLE_CHARGE ? null : state.feeTypeId,
    fromTermId: state.fromTermId,
    toTermId: state.toTermId === '' ? null : state.toTermId,
    reason: state.reason.trim(),
  };
}
