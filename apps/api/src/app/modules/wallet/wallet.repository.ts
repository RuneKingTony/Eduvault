import type {
  ApprovalStatus,
  PaymentMethod,
  PaymentMethods,
  PortalWalletMovement,
  Wallet,
  WalletApprovalKind,
  WalletListQuery,
  WalletListTotals,
  WalletMovement,
  WalletRequest,
  WalletRequestListQuery,
  WalletSummary,
} from '@eduvault/api-contract';
import type { WaitingApproval } from '../../common/approvals';
import type { UsableMoneyAccount } from '../../common/money-accounts';
import type { ProofState } from '../../common/payments';
import type { OrgScope } from '../../common/scope';
import type { CreditMigrationView } from './credit-migration-plan';
import type {
  ExistingEntry,
  NewSpend,
  SpendOutcome,
} from '../../common/wallet';

export type {
  ExistingEntry,
  NewSpend,
  SpendOutcome,
} from '../../common/wallet';

export type WalletView = Omit<Wallet, 'currency'>;

export interface WalletPage {
  items: WalletSummary[];
  total: number;
  totals: WalletListTotals;
}

export interface MovementPage {
  items: WalletMovement[];
  total: number;
}

export interface PortalMovementPage {
  items: PortalWalletMovement[];
  total: number;
}

interface Actor {
  organizationId: string;
  userId: string;
  userName: string;
}

export interface NewTopUp extends Actor {
  walletId: string;
  reference: string;
  requestHash: string;
  moneyAccountId: string;
  ledgerAccountId: string;
  accountCampusId: string | null;
  method: PaymentMethod;
  amountMinor: number;
  receivedOn: string;
  depositorName: string | null;
  proofFileId: string;
}

export type TopUpOutcome =
  | { status: 'recorded'; id: string }
  | { status: 'replayed'; id: string }
  | { status: 'reference_used' }
  | { status: 'proof_taken' };

export interface NewEarmark extends Actor {
  walletId: string;
  kind: 'set' | 'release';
  reference: string;
  studentId: string;
  amountMinor: number;
}

export type EarmarkOutcome =
  | { status: 'applied' }
  | { status: 'replayed' }
  | { status: 'reference_used' }
  | { status: 'over'; limitMinor: number };

export interface NewAutoPay {
  organizationId: string;
  userId: string;
  walletId: string;
  enabled: boolean;
  reference: string;
}

export type AutoPayOutcome =
  { status: 'applied' } | { status: 'replayed' } | { status: 'reference_used' };

export interface RequestPage {
  items: WalletRequest[];
  total: number;
  waitingCount: number;
}

export interface NewRefundRequest extends Actor {
  walletId: string;
  reference: string;
  requestHash: string;
  moneyAccountId: string;
  amountMinor: number;
  parentEmail: string;
  reason: string;
  proofFileId: string;
}

export type RefundRequestOutcome =
  | { status: 'requested'; id: string }
  | { status: 'replayed'; id: string }
  | { status: 'reference_used' }
  | { status: 'proof_taken' }
  | { status: 'over'; limitMinor: number };

export interface NewCancellationRequest extends Actor {
  walletId: string;
  topUpId: string;
  reference: string;
  requestHash: string;
  reason: string;
}

export type CancellationRequestOutcome =
  | { status: 'requested'; id: string }
  | { status: 'replayed'; id: string }
  | { status: 'reference_used' }
  | { status: 'exists' }
  | { status: 'over'; topUpMinor: number; freeMinor: number };

export type TopUpToCancel =
  | { kind: 'staff'; id: string; reference: string; amountMinor: number }
  | { kind: 'online' };

export interface RequestRecord {
  status: ApprovalStatus;
  createdBy: string | null;
}

export interface Decision extends Actor {
  id: string;
  decidedOn: string;
  ownRequest: boolean;
}

export interface RefundApproval extends Decision {
  payoutReference: string;
}

export type ApprovalOutcome =
  | { status: 'approved' }
  | { status: 'decided' }
  | { status: 'money_gone' }
  | { status: 'account_unusable' }
  | { status: 'payout_reference_used' };

export interface Declining extends Actor {
  id: string;
  reason: string;
}

export type DeclineOutcome = { status: 'declined' } | { status: 'decided' };

export interface NewCreditMigration extends Actor {
  expectedFamilies: number;
  expectedTotalMinor: number;
  today: string;
}

export type CreditMigrationOutcome =
  | {
      status: 'moved';
      familyCount: number;
      childCount: number;
      movedMinor: number;
    }
  | { status: 'replayed' }
  | { status: 'changed'; report: CreditMigrationView };

export abstract class WalletRepository {
  abstract currency(organizationId: string): Promise<string>;

  abstract creditMigration(
    organizationId: string
  ): Promise<CreditMigrationView>;

  abstract migrateCredit(
    input: NewCreditMigration
  ): Promise<CreditMigrationOutcome>;

  abstract list(scope: OrgScope, query: WalletListQuery): Promise<WalletPage>;

  abstract findWallet(
    scope: OrgScope,
    walletId: string
  ): Promise<WalletView | undefined>;

  abstract findOwnWallet(
    organizationId: string,
    userId: string
  ): Promise<WalletView | undefined>;

  abstract movements(
    scope: OrgScope,
    walletId: string,
    paging: { page: number; pageSize: number }
  ): Promise<MovementPage>;

  abstract ownMovements(
    organizationId: string,
    userId: string,
    paging: { page: number; pageSize: number }
  ): Promise<PortalMovementPage | undefined>;

  abstract guardianPays(
    organizationId: string,
    walletId: string
  ): Promise<boolean>;

  abstract paymentMethods(organizationId: string): Promise<PaymentMethods>;

  abstract recordingAccount(
    scope: OrgScope,
    moneyAccountId: string
  ): Promise<UsableMoneyAccount>;

  abstract proof(
    organizationId: string,
    userId: string,
    fileId: string
  ): Promise<ProofState>;

  abstract findTopUp(
    organizationId: string,
    reference: string
  ): Promise<ExistingEntry | undefined>;

  abstract findSpend(
    organizationId: string,
    reference: string
  ): Promise<ExistingEntry | undefined>;

  abstract insertTopUp(input: NewTopUp): Promise<TopUpOutcome>;

  abstract spend(input: NewSpend): Promise<SpendOutcome>;

  abstract earmark(input: NewEarmark): Promise<EarmarkOutcome>;

  abstract setAutoPay(input: NewAutoPay): Promise<AutoPayOutcome>;

  abstract refundProof(
    organizationId: string,
    userId: string,
    fileId: string
  ): Promise<ProofState>;

  abstract findRefundRequest(
    organizationId: string,
    reference: string
  ): Promise<ExistingEntry | undefined>;

  abstract findCancellationRequest(
    organizationId: string,
    reference: string
  ): Promise<ExistingEntry | undefined>;

  abstract findTopUpToCancel(
    scope: OrgScope,
    walletId: string,
    topUpId: string
  ): Promise<TopUpToCancel | undefined>;

  abstract requestRefund(
    input: NewRefundRequest
  ): Promise<RefundRequestOutcome>;

  abstract requestCancellation(
    input: NewCancellationRequest
  ): Promise<CancellationRequestOutcome>;

  abstract findRequest(
    scope: OrgScope,
    kind: WalletApprovalKind,
    id: string
  ): Promise<WalletRequest | undefined>;

  abstract requestRecord(
    scope: OrgScope,
    kind: WalletApprovalKind,
    id: string
  ): Promise<RequestRecord | undefined>;

  abstract listRequests(
    scope: OrgScope,
    query: WalletRequestListQuery
  ): Promise<RequestPage>;

  abstract approveRefund(input: RefundApproval): Promise<ApprovalOutcome>;

  abstract approveCancellation(input: Decision): Promise<ApprovalOutcome>;

  abstract declineRequest(
    kind: WalletApprovalKind,
    input: Declining
  ): Promise<DeclineOutcome>;

  abstract waiting(scope: OrgScope): Promise<WaitingApproval[]>;
}
