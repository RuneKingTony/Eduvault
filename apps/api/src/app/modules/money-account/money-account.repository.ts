import type {
  CashBookItem,
  MoneyAccount,
  MoneyAccountList,
} from '@eduvault/api-contract';
import type { OrgScope } from '../../common/scope';

export interface NewMoneyAccount {
  organizationId: string;
  userId: string;
  name: string;
  kind: 'bank' | 'pos' | 'cash';
  bankName: string | null;
  last4: string | null;
  campusId: string | null;
}

export interface MoneyAccountChange {
  name?: string;
  bankName?: string;
  last4?: string | null;
  retire?: boolean;
}

export type MoneyAccountOutcome =
  | { status: 'saved'; account: MoneyAccount }
  | { status: 'name_taken' }
  | { status: 'code_taken' };

export interface RecordingOption {
  id: string;
  label: string;
}

export abstract class MoneyAccountRepository {
  abstract list(scope: OrgScope): Promise<MoneyAccountList>;

  abstract findById(
    scope: OrgScope,
    id: string
  ): Promise<MoneyAccount | undefined>;

  abstract cashBook(
    scope: OrgScope,
    account: MoneyAccount,
    paging: { page: number; pageSize: number }
  ): Promise<{ items: CashBookItem[]; total: number; currency: string }>;

  abstract create(input: NewMoneyAccount): Promise<MoneyAccountOutcome>;

  abstract update(
    scope: OrgScope,
    id: string,
    change: MoneyAccountChange
  ): Promise<MoneyAccountOutcome | undefined>;

  abstract recordingOptions(scope: OrgScope): Promise<RecordingOption[]>;
}
