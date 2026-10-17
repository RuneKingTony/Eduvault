import type { ElectiveStudent } from '@eduvault/api-contract';

export const NO_CLASS_LABEL = 'No class';

export interface StudentGroup {
  label: string;
  students: ElectiveStudent[];
}

export function matchesSearch(
  student: ElectiveStudent,
  search: string
): boolean {
  const needle = search.trim().toLowerCase();
  return (
    needle === '' ||
    student.name.toLowerCase().includes(needle) ||
    student.admissionNumber.toLowerCase().includes(needle)
  );
}

export function groupStudents(
  students: readonly ElectiveStudent[],
  electiveLevelIds: ReadonlySet<string>,
  search: string
): StudentGroup[] {
  const groups = new Map<string, ElectiveStudent[]>();
  for (const student of students) {
    if (
      electiveLevelIds.has(student.classLevelId) &&
      matchesSearch(student, search)
    ) {
      const label = student.className ?? NO_CLASS_LABEL;
      const group = groups.get(label);
      if (group === undefined) {
        groups.set(label, [student]);
      } else {
        group.push(student);
      }
    }
  }
  return [...groups.entries()]
    .map(([label, members]) => ({ label, students: members }))
    .toSorted(
      (a, b) =>
        Number(a.label === NO_CLASS_LABEL) -
          Number(b.label === NO_CLASS_LABEL) || a.label.localeCompare(b.label)
    );
}
