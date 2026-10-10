import type { Campus, CampusSummary } from '@eduvault/api-contract';
import { isPortalOnly } from '@eduvault/policy';
import type { CampusMemberRecord } from './campus.repository';

/** Classes and Students stay 0 until classes and placements exist. */
export function summariseCampus(
  campus: Campus,
  members: readonly CampusMemberRecord[]
): CampusSummary {
  const onCampus = members.filter((member) => member.campusId === campus.id);
  return {
    ...campus,
    principals: onCampus
      .filter((member) => member.roles.includes('principal'))
      .map(({ userId, name }) => ({ userId, name })),
    counts: {
      classes: 0,
      students: 0,
      staff: onCampus.filter((member) => !isPortalOnly(member.roles)).length,
    },
  };
}
