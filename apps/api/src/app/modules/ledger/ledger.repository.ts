import type {
  JournalList,
  JournalQuery,
  LedgerAccount,
  LedgerAccountType,
} from '@eduvault/api-contract';
import type { ChartAccount } from '../../common/ledger';
import type { PlannedEntry } from './opening-balances';
import type { OrgScope } from '../../common/scope';

export interface LedgerAccountRef {
  id: string;
  code: number;
  name: string;
  type: LedgerAccountType;
  systemKey: string | null;
}

export type LedgerOutcome =
  | { status: 'saved'; account: LedgerAccount }
  | { status: 'name_taken' }
  | { status: 'code_taken' };

export interface SystemAccounts {
  receivableId: string;
  equityId: string;
}

export interface MoneyAccountRef {
  id: string;
  campusId: string | null;
  ledgerAccountId: string;
}

export interface OpeningPost {
  organizationId: string;
  userId: string;
  entries: PlannedEntry[];
}

export abstract class LedgerRepository {
  abstract chart(scope: OrgScope): Promise<ChartAccount[]>;

  abstract currency(organizationId: string): Promise<string>;

  abstract findAccount(
    organizationId: string,
    id: string
  ): Promise<LedgerAccountRef | undefined>;

  abstract createAccount(input: {
    organizationId: string;
    parentId: string;
    name: string;
  }): Promise<LedgerOutcome>;

  abstract journal(scope: OrgScope, query: JournalQuery): Promise<JournalList>;

  abstract studentCampuses(
    scope: OrgScope,
    options: { studentIds: string[]; today: string }
  ): Promise<Map<string, string>>;

  abstract moneyAccounts(
    scope: OrgScope,
    ids: string[]
  ): Promise<MoneyAccountRef[]>;

  abstract systemAccounts(organizationId: string): Promise<SystemAccounts>;

  abstract postOpening(post: OpeningPost): Promise<boolean[]>;
}
