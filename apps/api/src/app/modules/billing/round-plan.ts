import type { CampusScope } from '../../common/campus-scope';
import {
  chargeLines,
  type ChargeLine,
  type ChargeableFeeLine,
  type DiscountFacts,
  type TermPosition,
} from '../../common/fees';
import {
  campusForTerm,
  isIncluded,
  outcomeOf,
  tallyOutcomes,
  type ChargeOutcome,
  type InclusionFacts,
  type OutcomeCounts,
  type RoundFilter,
} from './billing-inclusion';

export interface RoundCandidate extends InclusionFacts {
  studentId: string;
  enrollmentId: string;
  firstName: string;
  lastName: string;
  admissionNumber: string;
  isNew: boolean;
  chargedInvoiceId: string | null;
}

export interface PlannedCharge {
  studentId: string;
  name: string;
  campusId: string;
  lines: ChargeLine[];
}

export interface RoundPlan {
  charges: PlannedCharge[];
  counts: OutcomeCounts;
}

export interface RoundPlanInput {
  termId: string;
  term: TermPosition;
  feeLines: readonly ChargeableFeeLine[];
  optedIn: ReadonlyMap<string, ReadonlySet<string>>;
  discounts: ReadonlyMap<string, readonly DiscountFacts[]>;
  discountsAccountId: string;
}

export const includedCandidates = (
  candidates: readonly RoundCandidate[],
  filter: RoundFilter,
  campusScope: CampusScope
): RoundCandidate[] =>
  candidates.filter((candidate) => isIncluded(candidate, filter, campusScope));

const NO_FEE_TYPES: ReadonlySet<string> = new Set();

function planStudent(
  candidate: RoundCandidate,
  input: RoundPlanInput
): { outcome: ChargeOutcome; charge: PlannedCharge } {
  const campusId = campusForTerm(candidate);
  const lines = chargeLines({
    feeLines: input.feeLines,
    student: {
      termId: input.termId,
      classLevelId: candidate.classLevelId,
      campusId,
      isNew: candidate.isNew,
      optedInFeeTypeIds:
        input.optedIn.get(candidate.enrollmentId) ?? NO_FEE_TYPES,
    },
    discounts: input.discounts.get(candidate.studentId) ?? [],
    term: input.term,
    discountsAccountId: input.discountsAccountId,
  });
  return {
    outcome: outcomeOf({
      alreadyCharged: candidate.chargedInvoiceId !== null,
      lineCount: lines.length,
    }),
    charge: {
      studentId: candidate.studentId,
      name: `${candidate.firstName} ${candidate.lastName}`,
      campusId,
      lines,
    },
  };
}

export function planRound(
  included: readonly RoundCandidate[],
  input: RoundPlanInput
): RoundPlan {
  const planned = included.map((candidate) => planStudent(candidate, input));
  return {
    charges: planned
      .filter((entry) => entry.outcome === 'create')
      .map((entry) => entry.charge),
    counts: tallyOutcomes(planned.map((entry) => entry.outcome)),
  };
}
