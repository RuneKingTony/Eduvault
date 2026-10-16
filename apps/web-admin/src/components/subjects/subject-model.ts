import {
  createSubjectSchema,
  type SubjectTeacherArm,
  type TeacherCandidate,
} from '@eduvault/api-contract';
import { countOf } from '@eduvault/shared';

const TAUGHT_AT_LIMIT = 4;

export function validateSubject(
  code: string,
  name: string
): { error: string } | { code: string; name: string } {
  const parsed = createSubjectSchema.safeParse({ code, name });
  return parsed.success
    ? parsed.data
    : { error: parsed.error.issues[0]?.message ?? 'Check the subject.' };
}

interface TaughtAt {
  shown: string[];
  more: string[];
}

export const taughtAt = (levelCodes: readonly string[]): TaughtAt => ({
  shown: levelCodes.slice(0, TAUGHT_AT_LIMIT),
  more: levelCodes.slice(TAUGHT_AT_LIMIT),
});

export function armCountLabel(arm: SubjectTeacherArm): string {
  const unassigned = arm.subjects.filter((row) => row.teacher === null).length;
  return unassigned > 0
    ? `${unassigned} unassigned`
    : countOf(arm.subjects.length, 'subject', 'subjects');
}

export function defaultTeacher(
  current: string | undefined,
  candidates: readonly TeacherCandidate[]
): string {
  const kept = candidates.find((candidate) => candidate.userId === current);
  return kept?.userId ?? candidates[0]?.userId ?? '';
}

export const teachesIn = (
  arm: SubjectTeacherArm,
  userId: string | undefined
): boolean =>
  userId !== undefined &&
  arm.subjects.some((row) => row.teacher?.userId === userId);

export const copiedMessage = (
  copied: number,
  skipped: number,
  term: string
): string =>
  `${countOf(copied, 'subject teacher', 'subject teachers')} copied from ${term}.${
    skipped > 0 ? ` ${skipped} skipped.` : ''
  }`;
