import {
  chargeLines,
  type ChargeLine,
  type ChargeableFeeLine,
  type DiscountFacts,
  type TermPosition,
} from '../../common/fees';
import {
  campusForTerm,
  type CampusPlacement,
  type OutcomeCounts,
} from './billing-round';

export interface RoundCandidate extends CampusPlacement {
  studentId: string;
  enrollmentId: string;
  firstName: string;
  lastName: string;
  admissionNumber: string;
  isNew: boolean;
  classLevelId: string;
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

type PlannedRound = Pick<RoundPlan, 'charges'> & Pick<OutcomeCounts, 'none'>;

export interface RoundPlanInput {
  termId: string;
  term: TermPosition;
  feeLines: readonly ChargeableFeeLine[];
  optedIn: ReadonlyMap<string, ReadonlySet<string>>;
  discounts: ReadonlyMap<string, readonly DiscountFacts[]>;
  discountsAccountId: string;
}

const NO_FEE_TYPES: ReadonlySet<string> = new Set();

function planStudent(
  candidate: RoundCandidate,
  input: RoundPlanInput
): PlannedCharge {
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
    studentId: candidate.studentId,
    name: `${candidate.firstName} ${candidate.lastName}`,
    campusId,
    lines,
  };
}

export function planRound(
  candidates: readonly RoundCandidate[],
  input: RoundPlanInput
): PlannedRound {
  const planned = candidates.map((candidate) => planStudent(candidate, input));
  const charges = planned.filter((charge) => charge.lines.length > 0);
  return { charges, none: planned.length - charges.length };
}
