import type {
  MoneyAccountKind,
  Payment,
  PaymentListQuery,
  PaymentListSummary,
  PaymentMethods,
  PaymentSummary,
  RecordingChild,
  RecordingPayer,
} from '@eduvault/api-contract';
import type {
  ExistingPayment,
  InsertOutcome,
  NewPayment,
  ProofState,
} from '../../common/payments';
import type { OrgScope } from '../../common/scope';

export type { ExistingPayment, InsertOutcome } from '../../common/payments';

export interface NewRecordedPayment extends NewPayment {
  userName: string;
}

export type RecordingAccount =
  | { status: 'missing' }
  | { status: 'retired' }
  | { status: 'gateway' }
  | {
      status: 'ok';
      ledgerAccountId: string;
      campusId: string | null;
      kind: MoneyAccountKind;
    };

export interface PaymentPage {
  items: PaymentSummary[];
  total: number;
  summary: PaymentListSummary;
}

export interface RecordingPeople {
  payers: RecordingPayer[];
  students: RecordingChild[];
}

export abstract class PaymentRepository {
  abstract currency(organizationId: string): Promise<string>;

  abstract list(scope: OrgScope, query: PaymentListQuery): Promise<PaymentPage>;

  abstract find(
    scope: OrgScope,
    id: string
  ): Promise<Omit<Payment, 'currency'> | undefined>;

  abstract findByReference(
    organizationId: string,
    reference: string
  ): Promise<ExistingPayment | undefined>;

  abstract paymentMethods(organizationId: string): Promise<PaymentMethods>;

  abstract recordingAccount(
    scope: OrgScope,
    moneyAccountId: string
  ): Promise<RecordingAccount>;

  abstract guardianName(
    scope: OrgScope,
    guardianId: string
  ): Promise<string | undefined>;

  abstract studentsInScope(
    scope: OrgScope,
    studentIds: readonly string[]
  ): Promise<string[]>;

  abstract proof(
    organizationId: string,
    userId: string,
    fileId: string
  ): Promise<ProofState>;

  abstract findByProviderReference(
    organizationId: string,
    providerReference: string
  ): Promise<ExistingPayment | undefined>;

  abstract insert(input: NewRecordedPayment): Promise<InsertOutcome>;

  abstract recordingPeople(scope: OrgScope): Promise<RecordingPeople>;
}
