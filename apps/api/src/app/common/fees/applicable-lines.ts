import type { FeeAppliesTo } from '@eduvault/api-contract';

export interface FeeLineFacts {
  feeTypeId: string;
  termId: string;
  classLevelId: string;
  campusId: string | null;
  appliesTo: FeeAppliesTo;
  isOptional: boolean;
  retiredAt: string | null;
}

export interface StudentFeeFacts {
  termId: string;
  classLevelId: string;
  campusId: string;
  isNew: boolean;
  optedInFeeTypeIds: ReadonlySet<string>;
}

const sameTermLevelAndCampus = (
  line: FeeLineFacts,
  student: StudentFeeFacts
): boolean =>
  line.retiredAt === null &&
  line.termId === student.termId &&
  line.classLevelId === student.classLevelId &&
  (line.campusId === null || line.campusId === student.campusId);

const audienceMatches = (appliesTo: FeeAppliesTo, isNew: boolean): boolean =>
  appliesTo === 'all' || (appliesTo === 'new') === isNew;

const eligible = (line: FeeLineFacts, student: StudentFeeFacts): boolean =>
  sameTermLevelAndCampus(line, student) &&
  audienceMatches(line.appliesTo, student.isNew) &&
  (!line.isOptional || student.optedInFeeTypeIds.has(line.feeTypeId));

/** Eligibility runs before the override, so a campus line that does not apply lets the every-campus line through. */
export function applicableLines<T extends FeeLineFacts>(
  lines: readonly T[],
  student: StudentFeeFacts
): T[] {
  const winners = new Map<string, T>();
  for (const line of lines.filter((candidate) =>
    eligible(candidate, student)
  )) {
    const held = winners.get(line.feeTypeId);
    if (
      held === undefined ||
      (held.campusId === null && line.campusId !== null)
    ) {
      winners.set(line.feeTypeId, line);
    }
  }
  return [...winners.values()];
}
