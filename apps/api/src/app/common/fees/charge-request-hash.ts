import type { CreateOneOffCharge } from '@eduvault/api-contract';
import { hashCanonical } from '../references/request-hash';

/** Line order is kept because the order is shown on the charge. */
export function chargeRequestHash(
  input: Pick<CreateOneOffCharge, 'studentId' | 'lines'>
): string {
  const canonical = {
    studentId: input.studentId,
    lines: input.lines.map((line) => ({
      feeTypeId: line.feeTypeId,
      description: line.description,
      amountMinor: line.amountMinor,
    })),
  };
  return hashCanonical(canonical);
}
