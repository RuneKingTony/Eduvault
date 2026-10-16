import type { CopySkipReason, SubjectTeacherArm } from '@eduvault/api-contract';
import type { ClassRef } from '../class/class.service';
import type {
  ArmSubjectRecord,
  LevelSubjectRecord,
  TermAssignment,
} from './subject.repository';

export const toArm = (
  record: ClassRef,
  rows: readonly ArmSubjectRecord[]
): SubjectTeacherArm => ({
  classId: record.id,
  displayName: record.displayName,
  campus: { id: record.campusId, name: record.campusName },
  subjects: rows
    .filter((row) => row.classId === record.id)
    .toSorted((a, b) => a.sequence - b.sequence || a.name.localeCompare(b.name))
    .map(({ subjectId, code, name, kind, teacher }) => ({
      subjectId,
      code,
      name,
      kind,
      teacher,
    })),
});

export const assignmentKey = (row: {
  classId: string;
  subjectId: string;
}): string => `${row.classId}:${row.subjectId}`;

interface CopyContext {
  classes: readonly ClassRef[];
  levelSubjects: readonly LevelSubjectRecord[];
  filled: ReadonlySet<string>;
  candidates: ReadonlyMap<string, ReadonlySet<string>>;
}

interface CopyDecision {
  row: TermAssignment;
  campusId: string;
  reason: CopySkipReason | null;
}

export function planCopy(
  previous: readonly TermAssignment[],
  context: CopyContext
): CopyDecision[] {
  const byId = new Map(context.classes.map((record) => [record.id, record]));
  return previous.flatMap((row) => {
    const record = byId.get(row.classId);
    if (record === undefined || context.filled.has(assignmentKey(row))) {
      return [];
    }
    const onLevel = context.levelSubjects.find(
      (entry) =>
        entry.classLevelId === record.levelId &&
        entry.subjectId === row.subjectId
    );
    const decision = (reason: CopySkipReason | null): CopyDecision => ({
      row,
      campusId: record.campusId,
      reason,
    });
    if (onLevel === undefined) {
      return [decision('subjectNotOnLevel')];
    }
    if (onLevel.subjectRetiredAt !== null) {
      return [decision('subjectRetired')];
    }
    return [
      decision(
        context.candidates.get(record.campusId)?.has(row.userId) === true
          ? null
          : 'notCandidate'
      ),
    ];
  });
}
