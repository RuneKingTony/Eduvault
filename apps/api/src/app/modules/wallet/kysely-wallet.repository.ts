import { Inject, Injectable } from '@nestjs/common';
import type {
  PaymentMethods,
  WalletApprovalKind,
  WalletListQuery,
  WalletRequest,
  WalletRequestListQuery,
} from '@eduvault/api-contract';
import type { WaitingApproval } from '../../common/approvals';
import { KYSELY_TOKEN, type Database } from '../../common/db/tokens';
import { uniqueViolation } from '../../common/db/unique-violation';
import { schoolCurrency } from '../../common/ledger';
import {
  usableMoneyAccount,
  type UsableMoneyAccount,
} from '../../common/money-accounts';
import type { ProofState } from '../../common/payments';
import { readPaymentMethods } from '../../common/school-setting/payment-methods';
import type { OrgScope } from '../../common/scope';
import {
  WalletWriters,
  findReferenceRow,
  writeSpend,
} from '../../common/wallet';
import type { CreditMigrationView } from './credit-migration-plan';
import {
  readCreditMigration,
  writeCreditMigration,
} from './kysely-credit-migration.repository';
import {
  findOwnWallet,
  findTopUpToCancel,
  findWallet,
  listWallets,
  walletInScope,
  ownMovements,
  refundProofState,
  walletMovements,
  walletProofState,
} from './kysely-wallet-read.repository';
import {
  findRequest,
  listRequests,
  requestRecord,
  waitingRequests,
} from './kysely-wallet-request-read.repository';
import {
  findRequestRow,
  writeCancellationApproval,
  writeCancellationRequest,
  writeDecline,
  writeRefundApproval,
  writeRefundRequest,
} from './kysely-wallet-request-write.repository';
import {
  writeAutoPay,
  writeEarmark,
  writeTopUp,
} from './kysely-wallet-write.repository';
import {
  WalletRepository,
  type ApprovalOutcome,
  type AutoPayOutcome,
  type CancellationRequestOutcome,
  type CreditMigrationOutcome,
  type Declining,
  type DeclineOutcome,
  type Decision,
  type EarmarkOutcome,
  type ExistingEntry,
  type MovementPage,
  type NewAutoPay,
  type NewCancellationRequest,
  type NewCreditMigration,
  type NewEarmark,
  type NewRefundRequest,
  type NewSpend,
  type NewTopUp,
  type PortalMovementPage,
  type RefundApproval,
  type RefundRequestOutcome,
  type RequestPage,
  type RequestRecord,
  type SpendOutcome,
  type TopUpOutcome,
  type TopUpToCancel,
  type WalletPage,
  type WalletView,
} from './wallet.repository';

const PROOF_FILE_KEY = 'wallet_topup_proof_file_id_key';
const REFUND_PROOF_FILE_KEY = 'wallet_refund_proof_file_id_key';
const PAYOUT_REFERENCE_KEY = 'wallet_refund_payout_reference_key';

@Injectable()
export class KyselyWalletRepository extends WalletRepository {
  constructor(
    @Inject(KYSELY_TOKEN) private readonly db: Database,
    private readonly writers: WalletWriters
  ) {
    super();
  }

  currency(organizationId: string): Promise<string> {
    return schoolCurrency(this.db, organizationId);
  }

  creditMigration(organizationId: string): Promise<CreditMigrationView> {
    return readCreditMigration(this.db, organizationId);
  }

  migrateCredit(input: NewCreditMigration): Promise<CreditMigrationOutcome> {
    return this.db
      .transaction()
      .execute((trx) => writeCreditMigration(trx, this.writers, input));
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

  walletInScope(scope: OrgScope, walletId: string): Promise<boolean> {
    return walletInScope(this.db, scope, walletId);
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

  ownMovements(
    organizationId: string,
    userId: string,
    paging: { page: number; pageSize: number }
  ): Promise<PortalMovementPage | undefined> {
    return ownMovements(this.db, { organizationId, userId }, paging);
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
        .execute((trx) => writeTopUp(trx, this.writers, input));
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
      .execute((trx) => writeSpend(trx, this.writers, input));
  }

  earmark(input: NewEarmark): Promise<EarmarkOutcome> {
    return this.db.transaction().execute((trx) => writeEarmark(trx, input));
  }

  setAutoPay(input: NewAutoPay): Promise<AutoPayOutcome> {
    return this.db.transaction().execute((trx) => writeAutoPay(trx, input));
  }

  refundProof(
    organizationId: string,
    userId: string,
    fileId: string
  ): Promise<ProofState> {
    return refundProofState(this.db, { organizationId, userId, fileId });
  }

  findRefundRequest(
    organizationId: string,
    reference: string
  ): Promise<ExistingEntry | undefined> {
    return findRequestRow(this.db, 'wallet_refund', {
      organizationId,
      reference,
    });
  }

  findCancellationRequest(
    organizationId: string,
    reference: string
  ): Promise<ExistingEntry | undefined> {
    return findRequestRow(this.db, 'wallet_topup_cancellation', {
      organizationId,
      reference,
    });
  }

  findTopUpToCancel(
    scope: OrgScope,
    walletId: string,
    topUpId: string
  ): Promise<TopUpToCancel | undefined> {
    return findTopUpToCancel(this.db, scope, { walletId, topUpId });
  }

  async requestRefund(input: NewRefundRequest): Promise<RefundRequestOutcome> {
    try {
      return await this.db
        .transaction()
        .execute((trx) => writeRefundRequest(trx, this.writers, input));
    } catch (error) {
      if (uniqueViolation(error) === REFUND_PROOF_FILE_KEY) {
        return { status: 'proof_taken' };
      }
      throw error;
    }
  }

  requestCancellation(
    input: NewCancellationRequest
  ): Promise<CancellationRequestOutcome> {
    return this.db
      .transaction()
      .execute((trx) => writeCancellationRequest(trx, this.writers, input));
  }

  findRequest(
    scope: OrgScope,
    kind: WalletApprovalKind,
    id: string
  ): Promise<WalletRequest | undefined> {
    return findRequest(this.db, scope, { kind, id });
  }

  requestRecord(
    scope: OrgScope,
    kind: WalletApprovalKind,
    id: string
  ): Promise<RequestRecord | undefined> {
    return requestRecord(this.db, scope, { kind, id });
  }

  listRequests(
    scope: OrgScope,
    query: WalletRequestListQuery
  ): Promise<RequestPage> {
    return listRequests(this.db, scope, query);
  }

  async approveRefund(input: RefundApproval): Promise<ApprovalOutcome> {
    try {
      return await this.db
        .transaction()
        .execute((trx) => writeRefundApproval(trx, this.writers, input));
    } catch (error) {
      if (uniqueViolation(error) === PAYOUT_REFERENCE_KEY) {
        return { status: 'payout_reference_used' };
      }
      throw error;
    }
  }

  approveCancellation(input: Decision): Promise<ApprovalOutcome> {
    return this.db
      .transaction()
      .execute((trx) => writeCancellationApproval(trx, this.writers, input));
  }

  declineRequest(
    kind: WalletApprovalKind,
    input: Declining
  ): Promise<DeclineOutcome> {
    return this.db
      .transaction()
      .execute((trx) => writeDecline(trx, this.writers, { kind, input }));
  }

  waiting(scope: OrgScope): Promise<WaitingApproval[]> {
    return waitingRequests(this.db, scope);
  }
}
