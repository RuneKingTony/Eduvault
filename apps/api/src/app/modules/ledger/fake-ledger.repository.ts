import type { JournalList, LedgerAccount } from '@eduvault/api-contract';
import type { ActivityInput } from '../../common/activity';
import type { ChartAccount } from '../../common/ledger';
import {
  LedgerRepository,
  type AccountActivity,
  type LedgerAccountRef,
  type LedgerOutcome,
  type MoneyAccountRef,
  type OpeningPost,
  type SystemAccounts,
} from './ledger.repository';
import type { OrgScope } from '../../common/scope';

export class FakeLedgerRepository extends LedgerRepository {
  chartRows: ChartAccount[] = [];
  accounts: LedgerAccountRef[] = [];
  campusOf = new Map<string, string>();
  moneyRows: MoneyAccountRef[] = [];
  posted: OpeningPost[] = [];
  alreadyPosted = new Set<string>();
  outcome: LedgerOutcome | undefined;
  scopes: OrgScope[] = [];
  recorded: ActivityInput[] = [];

  chart(scope: OrgScope): Promise<ChartAccount[]> {
    this.scopes.push(scope);
    return Promise.resolve(this.chartRows);
  }

  currency(): Promise<string> {
    return Promise.resolve('NGN');
  }

  findAccount(
    _organizationId: string,
    id: string
  ): Promise<LedgerAccountRef | undefined> {
    return Promise.resolve(this.accounts.find((row) => row.id === id));
  }

  createAccount(
    input: {
      organizationId: string;
      parentId: string;
      name: string;
    },
    activity: AccountActivity
  ): Promise<LedgerOutcome> {
    const account: LedgerAccount = {
      id: 'new-account',
      code: 4090,
      name: input.name,
      type: 'income',
      parentId: input.parentId,
      systemKey: null,
      balanceMinor: 0,
    };
    const outcome = this.outcome ?? { status: 'saved', account };
    if (outcome.status === 'saved') {
      this.recorded.push(...activity(outcome.account));
    }
    return Promise.resolve(outcome);
  }

  journal(): Promise<JournalList> {
    return Promise.resolve({ currency: 'NGN', items: [], total: 0 });
  }

  studentCampuses(): Promise<Map<string, string>> {
    return Promise.resolve(this.campusOf);
  }

  moneyAccounts(): Promise<MoneyAccountRef[]> {
    return Promise.resolve(this.moneyRows);
  }

  systemAccounts(): Promise<SystemAccounts> {
    return Promise.resolve({ receivableId: 'acc-1100', equityId: 'acc-3000' });
  }

  postOpening(post: OpeningPost): Promise<boolean[]> {
    const replays = post.entries.map((entry) =>
      this.alreadyPosted.has(entry.reference)
    );
    this.posted.push({
      ...post,
      entries: post.entries.filter((_, index) => replays[index] !== true),
    });
    return Promise.resolve(replays);
  }
}
