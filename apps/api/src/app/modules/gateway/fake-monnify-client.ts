import {
  MonnifyClient,
  MonnifyError,
  type MonnifyAccount,
  type MonnifyCredentials,
  type MonnifyTransaction,
  type NewReservedAccount,
} from './monnify-client';

interface ScriptedTransaction extends MonnifyTransaction {
  credentials?: Pick<MonnifyCredentials, 'apiKey' | 'secretKey'>;
}

/** A scripted Monnify for unit and integration tests: nothing leaves the process. */
export class FakeMonnifyClient extends MonnifyClient {
  readonly created: NewReservedAccount[] = [];
  readonly logins: MonnifyCredentials[] = [];
  readonly lookups: string[] = [];
  readonly transactions = new Map<string, ScriptedTransaction>();
  readonly accounts = new Map<string, MonnifyAccount>();
  rejectKeys = false;
  down = false;
  private issued = 0;

  reset(): void {
    this.created.length = 0;
    this.logins.length = 0;
    this.lookups.length = 0;
    this.transactions.clear();
    this.accounts.clear();
    this.rejectKeys = false;
    this.down = false;
    this.issued = 0;
  }

  async verifyCredentials(credentials: MonnifyCredentials): Promise<void> {
    await Promise.resolve();
    this.logins.push(credentials);
    this.guard(credentials);
  }

  async findReservedAccount(
    credentials: MonnifyCredentials,
    accountReference: string
  ): Promise<MonnifyAccount | undefined> {
    await this.verifyCredentials(credentials);
    return this.accounts.get(accountReference);
  }

  async createReservedAccount(
    credentials: MonnifyCredentials,
    account: NewReservedAccount
  ): Promise<MonnifyAccount> {
    await this.verifyCredentials(credentials);
    this.created.push(account);
    this.issued += 1;
    const made: MonnifyAccount = {
      accountNumber: String(5_000_000_000 + this.issued),
      bankName: 'Wema Bank',
      accountName: account.accountName,
    };
    this.accounts.set(account.accountReference, made);
    return made;
  }

  async getTransaction(
    credentials: MonnifyCredentials,
    transactionReference: string
  ): Promise<MonnifyTransaction | undefined> {
    await this.verifyCredentials(credentials);
    this.lookups.push(transactionReference);
    const found = this.transactions.get(transactionReference);
    if (
      found?.credentials !== undefined &&
      (found.credentials.apiKey !== credentials.apiKey ||
        found.credentials.secretKey !== credentials.secretKey)
    ) {
      return undefined;
    }
    return found;
  }

  private guard(credentials: MonnifyCredentials): void {
    if (this.down) {
      throw new MonnifyError('unavailable', 'Monnify did not answer');
    }
    if (this.rejectKeys || credentials.apiKey === '') {
      throw new MonnifyError('rejected', 'Invalid credentials');
    }
  }
}
