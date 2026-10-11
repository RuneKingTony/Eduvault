import type { Campus, CampusSummary } from '@eduvault/api-contract';
import { isPortalOnly } from '@eduvault/policy';
import type { CampusMemberRecord } from './campus.repository';

export function summariseCampus(
  campus: Campus,
  members: readonly CampusMemberRecord[],
  classCounts: Readonly<Record<string, number>>
): CampusSummary {
  const onCampus = members.filter((member) => member.campusId === campus.id);
  return {
    ...campus,
    principals: onCampus
      .filter((member) => member.roles.includes('principal'))
      .map(({ userId, name }) => ({ userId, name })),
    counts: {
      classes: classCounts[campus.id] ?? 0,
      students: 0,
      staff: onCampus.filter((member) => !isPortalOnly(member.roles)).length,
    },
  };
}
