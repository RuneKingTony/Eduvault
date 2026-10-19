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
import type { CampusScope } from '../../common/campus-scope';
import type {
  ExistingPayment,
  InsertOutcome,
  NewPayment,
  ProofState,
} from '../../common/payments';

export type { ExistingPayment, InsertOutcome } from '../../common/payments';

export interface NewRecordedPayment extends NewPayment {
  userName: string;
}

export interface PaymentScope {
  organizationId: string;
  campusScope: CampusScope;
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

  abstract list(
    scope: PaymentScope,
    query: PaymentListQuery
  ): Promise<PaymentPage>;

  abstract find(
    scope: PaymentScope,
    id: string
  ): Promise<Omit<Payment, 'currency'> | undefined>;

  abstract findByReference(
    organizationId: string,
    reference: string
  ): Promise<ExistingPayment | undefined>;

  abstract paymentMethods(organizationId: string): Promise<PaymentMethods>;

  abstract recordingAccount(
    scope: PaymentScope,
    moneyAccountId: string
  ): Promise<RecordingAccount>;

  abstract guardianName(
    scope: PaymentScope,
    guardianId: string
  ): Promise<string | undefined>;

  abstract studentsInScope(
    scope: PaymentScope,
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

  abstract recordingPeople(scope: PaymentScope): Promise<RecordingPeople>;
}
