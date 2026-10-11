import type {
  ClassDetail,
  ClassLevel,
  ClassSummary,
  ClassTeacher,
  ClassTeacherRole,
} from '@eduvault/api-contract';
import { can, resolvePermissions, type PermissionMap } from '@eduvault/policy';
import type {
  ClassRecord,
  LevelRecord,
  SchoolMemberRecord,
} from './class.repository';

const TEACHER_ORDER: Record<ClassTeacherRole, number> = {
  lead: 0,
  assistant: 1,
  uniform: 2,
};

export const classDisplayName = (levelName: string, name: string): string =>
  `${levelName} ${name}`;

export const toClassLevel = (level: LevelRecord): ClassLevel => ({
  id: level.id,
  code: level.code,
  name: level.name,
  sequence: level.sequence,
  nextLevelId: level.nextLevelId,
  isFinalYear: level.nextLevelId === null,
});

export const orderTeachers = (
  teachers: readonly ClassTeacher[]
): ClassTeacher[] =>
  teachers
    .map(({ userId, name, role }) => ({ userId, name, role }))
    .toSorted(
      (a, b) =>
        TEACHER_ORDER[a.role] - TEACHER_ORDER[b.role] ||
        a.name.localeCompare(b.name) ||
        a.userId.localeCompare(b.userId)
    );

export const toClassSummary = (
  record: ClassRecord,
  teachers: readonly ClassTeacher[],
  studentCount = 0
): ClassSummary => ({
  id: record.id,
  name: record.name,
  displayName: classDisplayName(record.levelName, record.name),
  level: { id: record.levelId, code: record.levelCode, name: record.levelName },
  campus: { id: record.campusId, name: record.campusName },
  classTeachers: orderTeachers(teachers),
  studentCount,
  retiredAt: record.retiredAt,
});

export const toClassDetail = (
  record: ClassRecord,
  teachers: readonly ClassTeacher[],
  roster: ClassDetail['roster']
): ClassDetail => ({
  ...toClassSummary(record, teachers, roster?.length ?? 0),
  isFinalYear: record.levelNextLevelId === null,
  roster,
});

export function reorderLevelIds(
  orderedIds: readonly string[],
  id: string,
  position: number
): string[] {
  const rest = orderedIds.filter((candidate) => candidate !== id);
  const index = Math.min(Math.max(position, 1), orderedIds.length) - 1;
  return [...rest.slice(0, index), id, ...rest.slice(index)];
}

export function teacherCandidates(
  members: readonly SchoolMemberRecord[],
  customRoles: Readonly<Record<string, PermissionMap>>,
  alreadyTeaching: ReadonlySet<string>
): SchoolMemberRecord[] {
  return members
    .filter((member) => !alreadyTeaching.has(member.userId))
    .filter((member) => {
      const permissions = resolvePermissions(member.roles, customRoles);
      return (
        can(permissions, 'class', 'read') &&
        (member.onCampus || can(permissions, 'campus', 'readAll'))
      );
    })
    .toSorted(
      (a, b) => a.name.localeCompare(b.name) || a.userId.localeCompare(b.userId)
    );
}
