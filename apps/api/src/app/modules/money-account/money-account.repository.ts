import type {
  CashBookItem,
  MoneyAccount,
  MoneyAccountKind,
  MoneyAccountList,
} from '@eduvault/api-contract';
import type { CampusScope } from '../../common/campus-scope';

export interface MoneyAccountScope {
  organizationId: string;
  campusScope: CampusScope;
}

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
  kind: MoneyAccountKind;
}

export abstract class MoneyAccountRepository {
  abstract list(scope: MoneyAccountScope): Promise<MoneyAccountList>;

  abstract findById(
    scope: MoneyAccountScope,
    id: string
  ): Promise<MoneyAccount | undefined>;

  abstract cashBook(
    scope: MoneyAccountScope,
    account: MoneyAccount,
    paging: { page: number; pageSize: number }
  ): Promise<{ items: CashBookItem[]; total: number; currency: string }>;

  abstract create(input: NewMoneyAccount): Promise<MoneyAccountOutcome>;

  abstract update(
    scope: MoneyAccountScope,
    id: string,
    change: MoneyAccountChange
  ): Promise<MoneyAccountOutcome | undefined>;

  abstract recordingOptions(
    scope: MoneyAccountScope
  ): Promise<RecordingOption[]>;
}
