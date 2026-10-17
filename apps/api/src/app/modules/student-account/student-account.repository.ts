import type {
  BalanceListQuery,
  StatementFamily,
  StudentLife,
} from '@eduvault/api-contract';
import type { CampusScope } from '../../common/campus-scope';
import type { KindMovement } from '../../common/ledger';
import type { MovementRecord } from './statement-assembly';

export interface AccountScope {
  organizationId: string;
  campusScope: CampusScope;
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

export abstract class StudentAccountRepository {
  abstract currency(organizationId: string): Promise<string>;

  abstract balancePage(
    scope: AccountScope,
    query: BalanceListQuery
  ): Promise<BalancePageRecord>;

  abstract balanceCounts(scope: AccountScope): Promise<BalanceCounts>;

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

  abstract family(
    scope: AccountScope,
    studentId: string
  ): Promise<StatementFamily>;

  abstract guardianChildren(
    scope: AccountScope,
    guardianId: string
  ): Promise<GuardianChildren | undefined>;
}
