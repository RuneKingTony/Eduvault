import {
  INVOICE_CHARGE_AMOUNT_MAX_MINOR,
  INVOICE_CHARGE_AMOUNT_MESSAGE,
  INVOICE_CHARGE_DESCRIPTION_MAX,
  INVOICE_CHARGE_DESCRIPTION_MAX_MESSAGE,
  INVOICE_CHARGE_DESCRIPTION_REQUIRED_MESSAGE,
  INVOICE_CHARGE_LINES_MAX,
  type CreateOneOffCharge,
} from '@eduvault/api-contract';
import { parseFeeAmount } from '../../fee-amount';

export const CHOOSE_STUDENT_MESSAGE = 'Choose a student.';
export const CHOOSE_FEE_TYPE_MESSAGE = 'Choose a fee type.';

export interface ChargeLineState {
  key: number;
  feeTypeId: string;
  description: string;
  amount: string;
}

export interface NewChargeState {
  reference: string;
  studentId: string;
  lines: readonly ChargeLineState[];
  nextKey: number;
}

export interface LineErrors {
  feeType?: string;
  description?: string;
  amount?: string;
}

export interface ChargeErrors {
  student?: string;
  lines: Readonly<Record<number, LineErrors>>;
}

const blankLine = (key: number): ChargeLineState => ({
  key,
  feeTypeId: '',
  description: '',
  amount: '',
});

export const initialCharge = (reference: string): NewChargeState => ({
  reference,
  studentId: '',
  lines: [blankLine(0)],
  nextKey: 1,
});

export const withStudent = (
  state: NewChargeState,
  studentId: string
): NewChargeState => ({ ...state, studentId });

export const withLine = (
  state: NewChargeState,
  key: number,
  change: Partial<Omit<ChargeLineState, 'key'>>
): NewChargeState => ({
  ...state,
  lines: state.lines.map((line) =>
    line.key === key ? { ...line, ...change } : line
  ),
});

export const canAddLine = (state: NewChargeState): boolean =>
  state.lines.length < INVOICE_CHARGE_LINES_MAX;

export const canRemoveLine = (state: NewChargeState): boolean =>
  state.lines.length > 1;

export const addLine = (state: NewChargeState): NewChargeState =>
  canAddLine(state)
    ? {
        ...state,
        lines: [...state.lines, blankLine(state.nextKey)],
        nextKey: state.nextKey + 1,
      }
    : state;

export const removeLine = (
  state: NewChargeState,
  key: number
): NewChargeState =>
  canRemoveLine(state)
    ? { ...state, lines: state.lines.filter((line) => line.key !== key) }
    : state;

const amountOf = (line: ChargeLineState): number | undefined => {
  const minor = parseFeeAmount(line.amount);
  return minor !== undefined && minor <= INVOICE_CHARGE_AMOUNT_MAX_MINOR
    ? minor
    : undefined;
};

export const chargeTotalMinor = (state: NewChargeState): number =>
  state.lines.reduce((sum, line) => sum + (amountOf(line) ?? 0), 0);

function lineErrors(line: ChargeLineState): LineErrors {
  const description = line.description.trim();
  return {
    ...(line.feeTypeId === '' ? { feeType: CHOOSE_FEE_TYPE_MESSAGE } : {}),
    ...(description === ''
      ? { description: INVOICE_CHARGE_DESCRIPTION_REQUIRED_MESSAGE }
      : {}),
    ...(description.length > INVOICE_CHARGE_DESCRIPTION_MAX
      ? { description: INVOICE_CHARGE_DESCRIPTION_MAX_MESSAGE }
      : {}),
    ...(amountOf(line) === undefined
      ? { amount: INVOICE_CHARGE_AMOUNT_MESSAGE }
      : {}),
  };
}

export function validateCharge(state: NewChargeState): ChargeErrors {
  const lines: Record<number, LineErrors> = {};
  for (const line of state.lines) {
    const found = lineErrors(line);
    if (Object.keys(found).length > 0) {
      lines[line.key] = found;
    }
  }
  return {
    ...(state.studentId === '' ? { student: CHOOSE_STUDENT_MESSAGE } : {}),
    lines,
  };
}

export const hasErrors = (errors: ChargeErrors): boolean =>
  errors.student !== undefined || Object.keys(errors.lines).length > 0;

export const chargeBody = (state: NewChargeState): CreateOneOffCharge => ({
  studentId: state.studentId,
  reference: state.reference,
  lines: state.lines.map((line) => ({
    feeTypeId: line.feeTypeId,
    description: line.description.trim(),
    amountMinor: amountOf(line) ?? 0,
  })),
});

export const chargeAddedMessage = (number: string | null): string =>
  number === null ? 'Charge added' : `Charge ${number} added`;
