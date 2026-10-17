import type { StatementFamily, OwedByLife } from '@eduvault/api-contract';
import type { MovementRecord } from './statement-assembly';
import {
  StudentAccountRepository,
  type AccountScope,
  type BalanceCounts,
  type BalancePageRecord,
  type GuardianChildren,
  type StudentHeader,
} from './student-account.repository';

export class FakeStudentAccountRepository extends StudentAccountRepository {
  headers = new Map<string, StudentHeader>();
  history = new Map<string, MovementRecord[]>();
  guardian: GuardianChildren | undefined;
  familyOf: StatementFamily = null;
  page: BalancePageRecord = { items: [], total: 0 };
  counts: BalanceCounts = {
    totalOwedMinor: 0,
    studentsOwing: 0,
    studentsInScope: 0,
  };
  received = { minor: 0, count: 0 };
  owed: OwedByLife = {
    active: 0,
    newIntakes: 0,
    inactive: 0,
    left: 0,
    graduated: 0,
  };
  currentTerm = true;
  names: string[] = [];
  scopes: AccountScope[] = [];
  receivedReads = 0;

  currency(): Promise<string> {
    return Promise.resolve('NGN');
  }

  balancePage(): Promise<BalancePageRecord> {
    return Promise.resolve(this.page);
  }

  balanceCounts(scope: AccountScope): Promise<BalanceCounts> {
    this.scopes.push(scope);
    return Promise.resolve(this.counts);
  }

  owedByLife(scope: AccountScope): Promise<OwedByLife> {
    this.scopes.push(scope);
    return Promise.resolve(this.owed);
  }

  hasCurrentTerm(): Promise<boolean> {
    return Promise.resolve(this.currentTerm);
  }

  receivedThisTerm(
    scope: AccountScope
  ): Promise<{ minor: number; count: number }> {
    this.scopes.push(scope);
    this.receivedReads += 1;
    return Promise.resolve(this.received);
  }

  campusNames(): Promise<string[]> {
    return Promise.resolve(this.names);
  }

  studentHeader(
    _scope: unknown,
    studentId: string
  ): Promise<StudentHeader | undefined> {
    return Promise.resolve(this.headers.get(studentId));
  }

  movements(
    _organizationId: string,
    studentId: string
  ): Promise<MovementRecord[]> {
    return Promise.resolve(this.history.get(studentId) ?? []);
  }

  family(): Promise<StatementFamily> {
    return Promise.resolve(this.familyOf);
  }

  guardianChildren(): Promise<GuardianChildren | undefined> {
    return Promise.resolve(this.guardian);
  }
}
