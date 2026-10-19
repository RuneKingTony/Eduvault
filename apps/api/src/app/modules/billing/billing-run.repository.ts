import type {
  BillingRun,
  BillingRunListQuery,
  BillingRunSummary,
} from '@eduvault/api-contract';
import type { RoundFilter } from './billing-round';
import type { BillingScope } from './billing-scope';
import type { PlannedCharge } from './round-plan';

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
  scope: BillingScope;
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

export abstract class BillingRunRepository {
  abstract currency(organizationId: string): Promise<string>;

  abstract listRuns(
    scope: BillingScope,
    query: BillingRunListQuery
  ): Promise<RunPage>;

  abstract findRun(
    scope: BillingScope,
    id: string
  ): Promise<RunHeader | undefined>;

  abstract createRound(input: NewRound): Promise<CreatedRound>;

  abstract issue(input: IssueRound): Promise<RunOutcome>;

  abstract cancel(input: RunAction): Promise<RunOutcome>;
}
