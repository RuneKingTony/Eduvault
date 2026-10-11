import type { Campus, CampusSummary } from '@eduvault/api-contract';
import { isPortalOnly } from '@eduvault/policy';
import type { CampusMemberRecord } from './campus.repository';

export function summariseCampus(
  campus: Campus,
  members: readonly CampusMemberRecord[],
  counts: {
    classes: Readonly<Record<string, number>>;
    students: Readonly<Record<string, number>>;
  }
): CampusSummary {
  const onCampus = members.filter((member) => member.campusId === campus.id);
  return {
    ...campus,
    principals: onCampus
      .filter((member) => member.roles.includes('principal'))
      .map(({ userId, name }) => ({ userId, name })),
    counts: {
      classes: counts.classes[campus.id] ?? 0,
      students: counts.students[campus.id] ?? 0,
      staff: onCampus.filter((member) => !isPortalOnly(member.roles)).length,
    },
  };
}
