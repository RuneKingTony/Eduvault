import type {
  ChargeableFeeLine,
  DiscountFacts,
  TermPosition,
} from '../../common/fees';
import type { RoundFilter } from './billing-round';
import type { BillingScope } from './billing-scope';
import type { RoundCandidate } from './round-plan';

export interface TermInfo {
  id: string;
  name: string;
  schoolYearName: string;
  sessionId: string;
  isCurrent: boolean;
  position: TermPosition;
}

export interface LevelRef {
  id: string;
  name: string;
}

export interface ChargeSummary {
  created: number;
  skipped: number;
  levelIds: string[];
  sample: { id: string; name: string }[];
}

export interface ChargeSummaryOptions {
  today: string;
  sampleSize: number;
}

export interface RoundCandidates {
  candidates: RoundCandidate[];
  skipped: number;
}

export interface RoundCandidateOptions {
  filter: RoundFilter;
  today: string;
}

export abstract class BillingPlanRepository {
  abstract termsToCharge(organizationId: string): Promise<TermInfo[]>;

  abstract findTerm(
    organizationId: string,
    termId: string
  ): Promise<TermInfo | undefined>;

  abstract findLevel(
    organizationId: string,
    id: string
  ): Promise<LevelRef | undefined>;

  abstract roundCandidates(
    scope: BillingScope,
    term: TermInfo,
    options: RoundCandidateOptions
  ): Promise<RoundCandidates>;

  abstract chargeSummary(
    scope: BillingScope,
    term: TermInfo,
    options: ChargeSummaryOptions
  ): Promise<ChargeSummary>;

  abstract feeLines(
    organizationId: string,
    termId: string
  ): Promise<ChargeableFeeLine[]>;

  abstract optedIn(
    organizationId: string,
    enrollmentIds: readonly string[]
  ): Promise<Map<string, Set<string>>>;

  abstract discounts(
    organizationId: string,
    studentIds: readonly string[]
  ): Promise<Map<string, DiscountFacts[]>>;

  abstract discountsAccountId(organizationId: string): Promise<string>;
}
