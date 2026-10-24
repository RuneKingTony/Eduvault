import type { GatewayMode } from '@eduvault/api-contract';
import type { OrgScope } from '../../common/scope';

export interface SealedSecret {
  enc: string;
  tail: string;
}

export interface StoredConnection {
  mode: GatewayMode;
  contractCode: string;
  apiKey: SealedSecret;
  secretKey: SealedSecret;
  lastTestedAt: Date | null;
  lastTestOk: boolean | null;
  updatedAt: Date;
}

export interface NewConnection {
  organizationId: string;
  userId: string;
  mode: GatewayMode;
  contractCode: string;
  apiKey: SealedSecret;
  secretKey: SealedSecret;
}

export interface FamilyWallet {
  walletId: string;
  guardianId: string;
  guardianName: string;
  guardianEmail: string;
  paying: boolean;
}

export interface StoredReservedAccount {
  id: string;
  walletId: string;
  accountReference: string;
  accountNumber: string;
  bankName: string;
  accountName: string;
}

export interface NewReservedAccountRow {
  organizationId: string;
  walletId: string;
  accountReference: string;
  accountNumber: string;
  bankName: string;
  accountName: string;
}

export interface NewGatewayTopUp {
  organizationId: string;
  reservedAccountId: string;
  walletId: string;
  reference: string;
  paymentReference: string;
  grossMinor: number;
  feeMinor: number;
  netMinor: number;
  paidAt: Date;
  effectiveOn: string;
}

export type GatewayTopUpOutcome =
  | { status: 'posted'; id: string }
  | { status: 'replayed' }
  | { status: 'clash' };

export abstract class GatewayRepository {
  abstract organizationExists(organizationId: string): Promise<boolean>;

  abstract currency(organizationId: string): Promise<string>;

  abstract findConnection(
    organizationId: string
  ): Promise<StoredConnection | undefined>;

  abstract saveConnection(input: NewConnection): Promise<StoredConnection>;

  abstract recordTest(
    organizationId: string,
    result: { ok: boolean; at: Date }
  ): Promise<void>;

  abstract findVisibleWallet(
    scope: OrgScope,
    walletId: string
  ): Promise<FamilyWallet | undefined>;

  abstract findWalletOfGuardian(
    organizationId: string,
    guardianId: string
  ): Promise<FamilyWallet | undefined>;

  abstract findReservedAccount(
    organizationId: string,
    walletId: string
  ): Promise<StoredReservedAccount | undefined>;

  abstract findReservedAccountByReference(
    organizationId: string,
    accountReference: string
  ): Promise<StoredReservedAccount | undefined>;

  /** Keeps the account already stored for the wallet when two requests race. */
  abstract insertReservedAccount(
    input: NewReservedAccountRow
  ): Promise<StoredReservedAccount>;

  abstract postTopUp(input: NewGatewayTopUp): Promise<GatewayTopUpOutcome>;
}
