import type { FeeLineFacts } from './applicable-lines';

interface TypicalTotalLine extends FeeLineFacts {
  amountMinor: number;
}

export function typicalTotal(
  lines: readonly TypicalTotalLine[],
  where: { termId: string; classLevelId: string }
): number {
  return lines
    .filter(
      (line) =>
        line.retiredAt === null &&
        line.campusId === null &&
        !line.isOptional &&
        line.appliesTo !== 'new' &&
        line.termId === where.termId &&
        line.classLevelId === where.classLevelId
    )
    .reduce((sum, line) => sum + line.amountMinor, 0);
}
