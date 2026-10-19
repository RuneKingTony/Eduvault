import type {
  BalanceListQuery,
  StatementFamily,
  StudentLife,
  OwedByLife,
} from '@eduvault/api-contract';
import type { KindMovement } from '../../common/ledger';
import type { MovementRecord } from './statement-assembly';
import type { OrgScope } from '../../common/scope';

export interface AccountScope extends OrgScope {
  today: string;
}

export interface BalanceRowRecord {
  studentId: string;
  name: string;
  admissionNumber: string;
  lifecycle: StudentLife;
  className: string | null;
  guardian: { id: string; name: string; phone: string } | null;
  balanceMinor: number;
  kindMovements: KindMovement[];
}

export interface BalancePageRecord {
  items: BalanceRowRecord[];
  total: number;
}

export interface BalanceCounts {
  totalOwedMinor: number;
  studentsOwing: number;
  studentsInScope: number;
}

export interface StudentHeader {
  id: string;
  name: string;
  admissionNumber: string;
  className: string | null;
  campusName: string;
  archived: boolean;
}

export interface GuardianChildren {
  guardian: { id: string; name: string };
  studentIds: string[];
}

export interface TermStart {
  id: string;
  label: string;
  sinceDay: string;
}

export abstract class StudentAccountRepository {
  abstract currency(organizationId: string): Promise<string>;

  abstract balancePage(
    scope: AccountScope,
    query: BalanceListQuery
  ): Promise<BalancePageRecord>;

  abstract balanceCounts(scope: AccountScope): Promise<BalanceCounts>;

  abstract owedByLife(scope: AccountScope): Promise<OwedByLife>;

  abstract hasCurrentTerm(organizationId: string): Promise<boolean>;

  abstract receivedThisTerm(
    scope: AccountScope
  ): Promise<{ minor: number; count: number }>;

  abstract campusNames(scope: AccountScope): Promise<string[]>;

  abstract studentHeader(
    scope: AccountScope,
    studentId: string
  ): Promise<StudentHeader | undefined>;

  abstract movements(
    organizationId: string,
    studentId: string
  ): Promise<MovementRecord[]>;

  abstract termWindows(organizationId: string): Promise<TermStart[]>;

  abstract family(
    scope: AccountScope,
    studentId: string
  ): Promise<StatementFamily>;

  abstract guardianChildren(
    scope: AccountScope,
    guardianId: string
  ): Promise<GuardianChildren | undefined>;
}
