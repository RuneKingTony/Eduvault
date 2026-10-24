import { Inject, Injectable } from '@nestjs/common';
import type { PaymentMethods, WalletListQuery } from '@eduvault/api-contract';
import { ActivityWriter } from '../../common/activity';
import { KYSELY_TOKEN, type Database } from '../../common/db/tokens';
import { uniqueViolation } from '../../common/db/unique-violation';
import { LedgerPoster, schoolCurrency } from '../../common/ledger';
import {
  usableMoneyAccount,
  type UsableMoneyAccount,
} from '../../common/money-accounts';
import type { ProofState } from '../../common/payments';
import { readPaymentMethods } from '../../common/school-setting/payment-methods';
import type { OrgScope } from '../../common/scope';
import {
  findOwnWallet,
  findWallet,
  listWallets,
  walletMovements,
  walletProofState,
} from './kysely-wallet-read.repository';
import {
  findReferenceRow,
  writeEarmark,
  writeSpend,
  writeTopUp,
} from './kysely-wallet-write.repository';
import {
  WalletRepository,
  type EarmarkOutcome,
  type ExistingEntry,
  type MovementPage,
  type NewEarmark,
  type NewSpend,
  type NewTopUp,
  type SpendOutcome,
  type TopUpOutcome,
  type WalletPage,
  type WalletView,
} from './wallet.repository';

const PROOF_FILE_KEY = 'wallet_topup_proof_file_id_key';

@Injectable()
export class KyselyWalletRepository extends WalletRepository {
  constructor(
    @Inject(KYSELY_TOKEN) private readonly db: Database,
    private readonly poster: LedgerPoster,
    private readonly activity: ActivityWriter
  ) {
    super();
  }

  currency(organizationId: string): Promise<string> {
    return schoolCurrency(this.db, organizationId);
  }

  list(scope: OrgScope, query: WalletListQuery): Promise<WalletPage> {
    return listWallets(this.db, scope, query);
  }

  findWallet(
    scope: OrgScope,
    walletId: string
  ): Promise<WalletView | undefined> {
    return findWallet(this.db, scope, walletId);
  }

  findOwnWallet(
    organizationId: string,
    userId: string
  ): Promise<WalletView | undefined> {
    return findOwnWallet(this.db, organizationId, userId);
  }

  async movements(
    scope: OrgScope,
    walletId: string,
    paging: { page: number; pageSize: number }
  ): Promise<MovementPage> {
    const wallet = await this.db
      .selectFrom('wallet')
      .select('guardian_id')
      .where('organization_id', '=', scope.organizationId)
      .where('id', '=', walletId)
      .executeTakeFirst();
    return wallet === undefined
      ? { items: [], total: 0 }
      : walletMovements(
          this.db,
          {
            organizationId: scope.organizationId,
            guardianId: wallet.guardian_id,
          },
          paging
        );
  }

  async guardianPays(
    organizationId: string,
    walletId: string
  ): Promise<boolean> {
    const paying = await this.db
      .selectFrom('wallet as w')
      .innerJoin('guardian_student as gs', (join) =>
        join
          .onRef('gs.guardian_id', '=', 'w.guardian_id')
          .onRef('gs.organization_id', '=', 'w.organization_id')
      )
      .select('gs.id')
      .where('w.organization_id', '=', organizationId)
      .where('w.id', '=', walletId)
      .where('gs.pays_fees', '=', true)
      .limit(1)
      .executeTakeFirst();
    return paying !== undefined;
  }

  paymentMethods(organizationId: string): Promise<PaymentMethods> {
    return readPaymentMethods(this.db, organizationId);
  }

  recordingAccount(
    scope: OrgScope,
    moneyAccountId: string
  ): Promise<UsableMoneyAccount> {
    return usableMoneyAccount(this.db, scope, moneyAccountId);
  }

  proof(
    organizationId: string,
    userId: string,
    fileId: string
  ): Promise<ProofState> {
    return walletProofState(this.db, { organizationId, userId, fileId });
  }

  findTopUp(
    organizationId: string,
    reference: string
  ): Promise<ExistingEntry | undefined> {
    return findReferenceRow('wallet_topup', this.db, {
      organizationId,
      reference,
    });
  }

  findSpend(
    organizationId: string,
    reference: string
  ): Promise<ExistingEntry | undefined> {
    return findReferenceRow('wallet_spend', this.db, {
      organizationId,
      reference,
    });
  }

  async insertTopUp(input: NewTopUp): Promise<TopUpOutcome> {
    try {
      return await this.db
        .transaction()
        .execute((trx) => writeTopUp(trx, this.deps(), input));
    } catch (error) {
      if (uniqueViolation(error) === PROOF_FILE_KEY) {
        return { status: 'proof_taken' };
      }
      throw error;
    }
  }

  spend(input: NewSpend): Promise<SpendOutcome> {
    return this.db
      .transaction()
      .execute((trx) => writeSpend(trx, this.deps(), input));
  }

  earmark(input: NewEarmark): Promise<EarmarkOutcome> {
    return this.db.transaction().execute((trx) => writeEarmark(trx, input));
  }

  private deps() {
    return { poster: this.poster, activity: this.activity };
  }
}
