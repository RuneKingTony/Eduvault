import type {
  BillingRun,
  BillingRunListQuery,
  BillingRunSummary,
} from '@eduvault/api-contract';
import type {
  ChargeableFeeLine,
  DiscountFacts,
  TermPosition,
} from '../../common/fees';
import type { RoundFilter } from './billing-round';
import type { PlannedCharge, RoundCandidate } from './round-plan';
import type { OrgScope } from '../../common/scope';

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

export type RunHeader = Omit<BillingRun, 'charges' | 'currency'>;

export interface RunPage {
  items: BillingRunSummary[];
  total: number;
}

export interface NewRound {
  organizationId: string;
  userId: string;
  termId: string;
  filter: RoundFilter;
  year: number;
  charges: readonly PlannedCharge[];
}

export interface CreatedRound {
  runId: string | null;
  number: string | null;
  created: number;
}

export interface RunAction {
  scope: OrgScope;
  runId: string;
  userId: string;
  userName: string;
}

export interface IssueRound extends RunAction {
  today: string;
  year: number;
}

export type RunOutcome =
  | { status: 'done' }
  | { status: 'not_found' }
  | { status: 'out_of_scope' }
  | { status: 'refused'; current: BillingRun['status'] };

export abstract class BillingRepository {
  abstract currency(organizationId: string): Promise<string>;

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
    scope: OrgScope,
    term: TermInfo,
    options: RoundCandidateOptions
  ): Promise<RoundCandidates>;

  abstract chargeSummary(
    scope: OrgScope,
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

  abstract createRound(input: NewRound): Promise<CreatedRound>;

  abstract listRuns(
    scope: OrgScope,
    query: BillingRunListQuery
  ): Promise<RunPage>;

  abstract findRun(scope: OrgScope, id: string): Promise<RunHeader | undefined>;

  abstract issue(input: IssueRound): Promise<RunOutcome>;

  abstract cancel(input: RunAction): Promise<RunOutcome>;
}
