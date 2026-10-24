import type { GatewayMode } from '@eduvault/api-contract';

export interface MonnifyCredentials {
  mode: GatewayMode;
  apiKey: string;
  secretKey: string;
  contractCode: string;
}

export interface MonnifyAccount {
  accountNumber: string;
  bankName: string;
  accountName: string;
}

export interface NewReservedAccount {
  accountReference: string;
  accountName: string;
  customerName: string;
  customerEmail: string;
}

/** What Monnify says about a transaction, with amounts already in minor units. */
export interface MonnifyTransaction {
  transactionReference: string;
  paymentReference: string;
  paymentStatus: string;
  currency: string;
  amountPaidMinor: number;
  settlementMinor: number;
  paidAt: Date;
  accountReference: string | null;
}

/** `rejected` is Monnify answering no (bad keys, bad request); `unavailable` is not getting an answer. */
export class MonnifyError extends Error {
  constructor(
    readonly kind: 'rejected' | 'unavailable',
    message: string
  ) {
    super(message);
    this.name = 'MonnifyError';
  }
}

export abstract class MonnifyClient {
  abstract verifyCredentials(credentials: MonnifyCredentials): Promise<void>;

  abstract findReservedAccount(
    credentials: MonnifyCredentials,
    accountReference: string
  ): Promise<MonnifyAccount | undefined>;

  abstract createReservedAccount(
    credentials: MonnifyCredentials,
    account: NewReservedAccount
  ): Promise<MonnifyAccount>;

  abstract getTransaction(
    credentials: MonnifyCredentials,
    transactionReference: string
  ): Promise<MonnifyTransaction | undefined>;
}
