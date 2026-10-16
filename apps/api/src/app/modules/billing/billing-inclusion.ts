import type { BillingScope, StudentLife } from '@eduvault/api-contract';
import { canSeeCampus, type CampusScope } from '../../common/campus-scope';

export type RoundFilter =
  | { scope: 'school' }
  | { scope: 'campus'; campusId: string }
  | { scope: 'level'; classLevelId: string };

export interface InclusionFacts {
  enrollmentStatus: 'active' | 'withdrawn' | 'completed' | null;
  life: StudentLife;
  currentCampusId: string;
  termPlacementCampusId: string | null;
  latestPlacementCampusId: string | null;
  homeCampusId: string;
  classLevelId: string;
}

export type ChargeOutcome = 'create' | 'skipped' | 'none';

export interface OutcomeCounts {
  created: number;
  skipped: number;
  none: number;
}

type ChargedState = 'all' | 'partly' | 'none';

export const campusForTerm = (
  facts: Pick<
    InclusionFacts,
    'termPlacementCampusId' | 'latestPlacementCampusId' | 'homeCampusId'
  >
): string =>
  facts.termPlacementCampusId ??
  facts.latestPlacementCampusId ??
  facts.homeCampusId;

function matchesFilter(facts: InclusionFacts, filter: RoundFilter): boolean {
  switch (filter.scope) {
    case 'school': {
      return true;
    }
    case 'campus': {
      return campusForTerm(facts) === filter.campusId;
    }
    case 'level': {
      return facts.classLevelId === filter.classLevelId;
    }
  }
}

export const isIncluded = (
  facts: InclusionFacts,
  filter: RoundFilter,
  campusScope: CampusScope
): boolean =>
  facts.enrollmentStatus === 'active' &&
  facts.life === 'active' &&
  canSeeCampus(campusScope, facts.currentCampusId) &&
  matchesFilter(facts, filter);

/** Already charged wins over having no fees, so a retired fee never hides a charge. */
export const outcomeOf = (facts: {
  alreadyCharged: boolean;
  lineCount: number;
}): ChargeOutcome => {
  if (facts.alreadyCharged) {
    return 'skipped';
  }
  return facts.lineCount === 0 ? 'none' : 'create';
};

export function tallyOutcomes(
  outcomes: readonly ChargeOutcome[]
): OutcomeCounts {
  const counts: OutcomeCounts = { created: 0, skipped: 0, none: 0 };
  for (const outcome of outcomes) {
    if (outcome === 'create') {
      counts.created++;
    } else {
      counts[outcome]++;
    }
  }
  return counts;
}

/** A concurrent prepare that won a student turns that student from created into skipped. */
export const settleCounts = (
  counts: OutcomeCounts,
  inserted: number
): OutcomeCounts => ({
  created: inserted,
  skipped: counts.skipped + (counts.created - inserted),
  none: counts.none,
});

export function chargedState(
  counts: Pick<OutcomeCounts, 'created' | 'skipped'>
): ChargedState {
  if (counts.skipped === 0) {
    return 'none';
  }
  return counts.created === 0 ? 'all' : 'partly';
}

export const defaultTermId = (
  terms: readonly { termId: string; charged: ChargedState }[]
): string | undefined =>
  (terms.find((term) => term.charged !== 'all') ?? terms[0])?.termId;

export function scopeLabel(scope: BillingScope, name: string | null): string {
  switch (scope) {
    case 'school': {
      return 'Whole school';
    }
    case 'campus': {
      return `Campus: ${name ?? ''}`;
    }
    case 'level': {
      return `Level: ${name ?? ''}`;
    }
  }
}
