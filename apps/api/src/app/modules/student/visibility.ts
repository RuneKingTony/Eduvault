import type { CampusClassScope } from '../../common/scope';

export interface PlacementFacts {
  campusId: string;
  armId: string;
}

export interface VisibilityFacts {
  homeCampusId: string;
  /** The placement for the current term; null with no current term too. */
  currentPlacement: PlacementFacts | null;
}

export const effectiveCampusId = (facts: VisibilityFacts): string =>
  facts.currentPlacement?.campusId ?? facts.homeCampusId;

export function isStudentVisible(
  facts: VisibilityFacts,
  scope: CampusClassScope
): boolean {
  const campusOk =
    scope.campusScope === 'all' ||
    scope.campusScope.includes(effectiveCampusId(facts));
  const classOk =
    scope.classScope === 'all' ||
    (facts.currentPlacement !== null &&
      scope.classScope.includes(facts.currentPlacement.armId));
  return campusOk && classOk;
}
