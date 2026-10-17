import type {
  Payment,
  PaymentListQuery,
  PaymentListSummary,
  PaymentMethod,
  PaymentMethods,
  PaymentSummary,
  RecordingChild,
  RecordingPayer,
} from '@eduvault/api-contract';
import type { CampusScope } from '../../common/campus-scope';

export interface PaymentScope {
  organizationId: string;
  campusScope: CampusScope;
}

export interface ExistingPayment {
  id: string;
  receiptNumber: string;
  requestHash: string;
}

export type RecordingAccount =
  | { status: 'missing' }
  | { status: 'retired' }
  | { status: 'gateway' }
  | { status: 'ok'; ledgerAccountId: string; campusId: string | null };

export type ProofCheck = 'missing' | 'taken' | 'free';

export interface NewPayment {
  organizationId: string;
  userId: string;
  year: number;
  reference: string;
  requestHash: string;
  payerGuardianId: string | null;
  payerName: string;
  moneyAccountId: string;
  ledgerAccountId: string;
  accountCampusId: string | null;
  method: PaymentMethod;
  providerReference: string | null;
  proofFileId: string | null;
  amountMinor: number;
  paidOn: string;
  allocations: { studentId: string; amountMinor: number }[];
}

export type InsertOutcome =
  | { status: 'recorded'; id: string }
  | { status: 'replayed'; id: string }
  | { status: 'reference_used' }
  | { status: 'provider_reference_used' }
  | { status: 'proof_taken' };

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
  ): Promise<ProofCheck>;

  abstract findByProviderReference(
    organizationId: string,
    providerReference: string
  ): Promise<ExistingPayment | undefined>;

  abstract insert(input: NewPayment): Promise<InsertOutcome>;

  abstract recordingPeople(scope: PaymentScope): Promise<RecordingPeople>;
}
