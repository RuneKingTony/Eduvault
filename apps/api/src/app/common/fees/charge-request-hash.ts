import { createHash } from 'node:crypto';
import type { CreateOneOffCharge } from '@eduvault/api-contract';

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
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}
