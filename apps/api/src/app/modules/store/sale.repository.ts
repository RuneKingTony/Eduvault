import type {
  MoneyAccountKind,
  PaymentMethod,
  PaymentMethods,
  PortalPurchases,
  Sale,
  SaleListQuery,
  SaleOptions,
  StoreTermFigures,
  StudentLife,
} from '@eduvault/api-contract';
import type { ProofState } from '../../common/payments';
import type { StoreRef } from './store.repository';
import type { OrgScope } from '../../common/scope';

export interface SaleAccount {
  id: string;
  name: string;
  kind: MoneyAccountKind;
  campusId: string | null;
  ledgerAccountId: string;
  retired: boolean;
}

export interface SaleStudent {
  id: string;
  name: string;
  admissionNumber: string;
  life: StudentLife;
  campusId: string;
  campusName: string;
  className: string | null;
  payer: { guardianId: string; name: string } | null;
}

export interface ExistingSale {
  id: string;
  number: string;
  requestHash: string;
  moneyAccountId: string;
}

export interface SaleLineRequest {
  itemId: string;
  displayName: string;
  quantity: number;
  unitPriceMinor: number;
}

export interface NewSale {
  organizationId: string;
  userId: string;
  userName: string;
  year: number;
  today: string;
  reference: string;
  requestHash: string;
  store: StoreRef;
  student: SaleStudent;
  termId: string;
  method: PaymentMethod;
  account: SaleAccount;
  proofFileId: string | null;
  lines: SaleLineRequest[];
}

export type SaleOutcome =
  | { status: 'recorded'; id: string }
  | { status: 'replayed'; id: string }
  | { status: 'reference_used'; number: string }
  | { status: 'stock_short'; itemName: string; onHand: number }
  | { status: 'posting_clash' }
  | { status: 'proof_taken' }
  | { status: 'student_not_active' }
  | { status: 'no_term' };

export interface SalePageQuery extends Pick<SaleListQuery, 'page'> {
  pageSize: number;
  campusId?: string;
  studentId?: string;
}

export interface SalePage {
  items: Sale[];
  total: number;
}

export interface StudentPlacement {
  levelName: string | null;
  levelId: string | null;
  campusId: string;
}

export type OptionStudents = SaleOptions['students'];

export interface OptionStudentsRequest {
  today: string;
  withBalance: boolean;
  q: string | undefined;
  studentId: string | undefined;
}

export abstract class SaleRepository {
  abstract findByReference(
    organizationId: string,
    reference: string
  ): Promise<ExistingSale | undefined>;

  abstract find(scope: OrgScope, id: string): Promise<Sale | undefined>;

  abstract list(scope: OrgScope, query: SalePageQuery): Promise<SalePage>;

  abstract student(
    scope: OrgScope,
    request: { studentId: string; today: string }
  ): Promise<SaleStudent | undefined>;

  abstract optionStudents(
    scope: OrgScope,
    request: OptionStudentsRequest
  ): Promise<OptionStudents>;

  abstract currentTerm(
    organizationId: string
  ): Promise<{ id: string; name: string } | undefined>;

  abstract paymentMethods(organizationId: string): Promise<PaymentMethods>;

  abstract accounts(scope: OrgScope): Promise<SaleAccount[]>;

  abstract proofState(
    organizationId: string,
    userId: string,
    fileId: string
  ): Promise<ProofState>;

  abstract insert(input: NewSale): Promise<SaleOutcome>;

  abstract termFigures(
    scope: OrgScope,
    campusId?: string
  ): Promise<StoreTermFigures>;

  abstract purchasesOf(
    organizationId: string,
    studentId: string
  ): Promise<PortalPurchases>;

  abstract placementOf(
    organizationId: string,
    studentId: string
  ): Promise<StudentPlacement | undefined>;
}
