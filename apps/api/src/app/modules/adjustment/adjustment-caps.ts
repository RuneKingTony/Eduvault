import {
  adjustmentRefundCapMessage,
  adjustmentRefundNowCapMessage,
  adjustmentWriteOffCapMessage,
  adjustmentWriteOffNowCapMessage,
  type AdjustmentKind,
} from '@eduvault/api-contract';
import type { StudentFacts } from './adjustment.repository';

export interface CapProblem {
  message: string;
  creditMinor?: number;
}

interface CapCheck {
  kind: AdjustmentKind;
  amountMinor: number;
  student: Pick<StudentFacts, 'name' | 'balanceMinor'>;
  moment: 'ask' | 'approve';
}

/** A fee reduction may exceed what is owed; the excess becomes credit to refund. */
export function capProblem(check: CapCheck): CapProblem | undefined {
  const { kind, amountMinor, student, moment } = check;
  const owedMinor = Math.max(0, student.balanceMinor);
  const creditMinor = Math.max(0, -student.balanceMinor);
  if (kind === 'refund' && amountMinor > creditMinor) {
    return {
      creditMinor,
      message:
        moment === 'ask'
          ? adjustmentRefundCapMessage(student.name, creditMinor)
          : adjustmentRefundNowCapMessage(student.name, creditMinor),
    };
  }
  if (kind === 'write_off' && amountMinor > owedMinor) {
    return {
      message:
        moment === 'ask'
          ? adjustmentWriteOffCapMessage(student.name, owedMinor)
          : adjustmentWriteOffNowCapMessage(student.name, owedMinor),
    };
  }
  return undefined;
}
