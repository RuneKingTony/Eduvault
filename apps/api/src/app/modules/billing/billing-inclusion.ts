import type { BillingScope } from '@eduvault/api-contract';

export type RoundFilter =
  | { scope: 'school' }
  | { scope: 'campus'; campusId: string }
  | { scope: 'level'; classLevelId: string };

export interface InclusionFacts {
  termPlacementCampusId: string | null;
  latestPlacementCampusId: string | null;
  homeCampusId: string;
}

export interface OutcomeCounts {
  created: number;
  skipped: number;
  none: number;
}

type ChargedState = 'all' | 'partly' | 'none';

export const campusForTerm = (facts: InclusionFacts): string =>
  facts.termPlacementCampusId ??
  facts.latestPlacementCampusId ??
  facts.homeCampusId;

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
