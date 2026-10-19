import type {
  CashBookItem,
  MoneyAccount,
  MoneyAccountList,
} from '@eduvault/api-contract';
import { canSeeCampus } from '../../common/campus-scope';
import {
  MoneyAccountRepository,
  type MoneyAccountChange,
  type MoneyAccountOutcome,
  type NewMoneyAccount,
  type RecordingOption,
} from './money-account.repository';
import type { OrgScope } from '../../common/scope';

export class FakeMoneyAccountRepository extends MoneyAccountRepository {
  rows: MoneyAccount[] = [];
  organizationOf = new Map<string, string>();
  created: NewMoneyAccount[] = [];
  changes: MoneyAccountChange[] = [];
  nameTaken = false;

  seed(organizationId: string, row: MoneyAccount): void {
    this.rows.push(row);
    this.organizationOf.set(row.id, organizationId);
  }

  private visible(scope: OrgScope): MoneyAccount[] {
    return this.rows.filter(
      (row) =>
        this.organizationOf.get(row.id) === scope.organizationId &&
        (row.campusId === null
          ? scope.campusScope === 'all'
          : canSeeCampus(scope.campusScope, row.campusId))
    );
  }

  list(scope: OrgScope): Promise<MoneyAccountList> {
    const hidden = this.rows.filter(
      (row) =>
        this.organizationOf.get(row.id) === scope.organizationId &&
        row.campusId === null &&
        row.retiredAt === null &&
        scope.campusScope !== 'all'
    );
    return Promise.resolve({
      currency: 'NGN',
      items: this.visible(scope),
      hiddenSchoolWideCount: hidden.length,
    });
  }

  findById(scope: OrgScope, id: string): Promise<MoneyAccount | undefined> {
    return Promise.resolve(this.visible(scope).find((row) => row.id === id));
  }

  cashBook(): Promise<{
    items: CashBookItem[];
    total: number;
    currency: string;
  }> {
    return Promise.resolve({ items: [], total: 0, currency: 'NGN' });
  }

  create(input: NewMoneyAccount): Promise<MoneyAccountOutcome> {
    if (this.nameTaken) {
      return Promise.resolve({ status: 'name_taken' });
    }
    this.created.push(input);
    const account: MoneyAccount = {
      id: `new-${this.created.length}`,
      name: input.name,
      kind: input.kind,
      campusId: input.campusId,
      campusName: null,
      bankName: input.bankName,
      last4: input.last4,
      ledgerAccountId: `ledger-${this.created.length}`,
      ledgerCode: 1200 + this.created.length * 10,
      balanceMinor: 0,
      retiredAt: null,
    };
    this.seed(input.organizationId, account);
    return Promise.resolve({ status: 'saved', account });
  }

  update(
    scope: OrgScope,
    id: string,
    change: MoneyAccountChange
  ): Promise<MoneyAccountOutcome | undefined> {
    const current = this.visible(scope).find((row) => row.id === id);
    if (current === undefined) {
      return Promise.resolve(undefined);
    }
    this.changes.push(change);
    const account: MoneyAccount = {
      ...current,
      name: change.name ?? current.name,
      bankName: change.bankName ?? current.bankName,
      last4: change.last4 === undefined ? current.last4 : change.last4,
      retiredAt:
        change.retire === true
          ? (current.retiredAt ?? '2026-10-12T09:00:00.000Z')
          : current.retiredAt,
    };
    this.rows = this.rows.map((row) => (row.id === id ? account : row));
    return Promise.resolve({ status: 'saved', account });
  }

  recordingOptions(scope: OrgScope): Promise<RecordingOption[]> {
    return Promise.resolve(
      this.rows
        .filter(
          (row) =>
            this.organizationOf.get(row.id) === scope.organizationId &&
            row.kind !== 'gateway' &&
            row.retiredAt === null &&
            (row.campusId === null ||
              canSeeCampus(scope.campusScope, row.campusId))
        )
        .map((row) => ({ id: row.id, label: row.name }))
    );
  }
}
