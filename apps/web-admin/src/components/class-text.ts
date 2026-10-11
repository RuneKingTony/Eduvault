import type { ClassTeacher, ClassTeacherRole } from '@eduvault/api-contract';

export const ROLE_LABELS: Record<ClassTeacherRole, string> = {
  lead: 'Lead',
  assistant: 'Assistant',
  uniform: 'Uniform',
};

export const teachersTooltip = (teachers: readonly ClassTeacher[]): string =>
  teachers
    .map((teacher) => `${teacher.name} (${ROLE_LABELS[teacher.role]})`)
    .join(', ');
