import {
  ADJUSTMENT_ACCOUNT_REQUIRED_MESSAGE,
  ADJUSTMENT_REASON_MESSAGE,
  ADJUSTMENT_STUDENT_AMOUNT_MESSAGE,
  type AdjustmentKind,
  type CreateAdjustmentInput,
} from '@eduvault/api-contract';
import { nairaInputText, parseNaira } from '@eduvault/shared';

export interface RequestState {
  kind: AdjustmentKind;
  studentId: string;
  amount: string;
  reason: string;
  invoiceId: string;
  ledgerAccountId: string;
  moneyAccountId: string;
}

export interface RequestPrefill {
  kind?: AdjustmentKind;
  studentId?: string;
  amountMinor?: number;
}

export type RequestField = 'student' | 'amount' | 'reason' | 'account';
export type RequestErrors = Partial<Record<RequestField, string>>;

export function initialRequest(
  prefill: RequestPrefill,
  firstAccountId: string
): RequestState {
  return {
    kind: prefill.kind ?? 'credit_note',
    studentId: prefill.studentId ?? '',
    amount:
      prefill.amountMinor === undefined
        ? ''
        : nairaInputText(prefill.amountMinor),
    reason: '',
    invoiceId: '',
    ledgerAccountId: '',
    moneyAccountId: firstAccountId,
  };
}

export function validateRequest(state: RequestState): RequestErrors {
  const errors: RequestErrors = {};
  const amount = parseNaira(state.amount);
  if (state.studentId === '' || amount === undefined || amount <= 0) {
    errors.student = ADJUSTMENT_STUDENT_AMOUNT_MESSAGE;
  }
  if (state.reason.trim() === '') {
    errors.reason = ADJUSTMENT_REASON_MESSAGE;
  }
  if (state.kind === 'refund' && state.moneyAccountId === '') {
    errors.account = ADJUSTMENT_ACCOUNT_REQUIRED_MESSAGE;
  }
  return errors;
}

export function toRequestBody(state: RequestState): CreateAdjustmentInput {
  const base = {
    kind: state.kind,
    studentId: state.studentId,
    amountMinor: parseNaira(state.amount) ?? 0,
    reason: state.reason.trim(),
  };
  if (state.kind === 'refund') {
    return { ...base, moneyAccountId: state.moneyAccountId };
  }
  if (state.kind === 'credit_note') {
    return {
      ...base,
      ...(state.ledgerAccountId === ''
        ? {}
        : { ledgerAccountId: state.ledgerAccountId }),
      ...(state.invoiceId === '' ? {} : { invoiceId: state.invoiceId }),
    };
  }
  return base;
}

export function withAccount(
  state: RequestState,
  accounts: readonly { id: string }[]
): RequestState {
  return state.moneyAccountId === ''
    ? { ...state, moneyAccountId: accounts[0]?.id ?? '' }
    : state;
}
