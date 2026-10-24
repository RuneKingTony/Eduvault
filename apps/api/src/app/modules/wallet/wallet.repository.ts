import type {
  PaymentMethod,
  PaymentMethods,
  SpendLine,
  Wallet,
  WalletListQuery,
  WalletListTotals,
  WalletMovement,
  WalletSummary,
} from '@eduvault/api-contract';
import type { UsableMoneyAccount } from '../../common/money-accounts';
import type { ProofState } from '../../common/payments';
import type { OrgScope } from '../../common/scope';

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

interface Actor {
  organizationId: string;
  userId: string;
  userName: string;
}

export interface ExistingEntry {
  id: string;
  walletId: string;
  requestHash: string;
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

export interface NewSpend extends Actor {
  walletId: string;
  reference: string;
  requestHash: string;
  lines: readonly SpendLine[];
  spentOn: string;
}

export type SpendOutcome =
  | { status: 'spent'; id: string }
  | { status: 'replayed'; id: string }
  | { status: 'reference_used' }
  | { status: 'over'; studentId: string; spendableMinor: number };

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

export abstract class WalletRepository {
  abstract currency(organizationId: string): Promise<string>;

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
}
