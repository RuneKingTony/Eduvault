import { Injectable, Logger } from '@nestjs/common';
import { sql, type Kysely } from 'kysely';
import type { PayTableChild } from '@eduvault/shared';
import type { DB } from '../../../db/db-types';
import { ActivityWriter } from '../activity';
import { memberHolds } from '../auth/role-permissions';
import { Clock } from '../clock';
import { LedgerPoster, receivableBalanceSql } from '../ledger';
import { autoPayReference, planAutoPay } from './auto-pay-plan';
import { latestAutoPay } from './auto-pay-setting';
import { oldestUnpaidByChild } from './oldest-unpaid';
import { spendRequestHash } from './spend-request-hash';
import { walletFreeMoney } from './wallet-held';
import { writeSpend } from './wallet-spend';

interface AutoPayCredit {
  organizationId: string;
  guardianId: string;
  reference: string;
}

interface FamilyWallet {
  walletId: string;
  userName: string;
}

const SAVEPOINT = 'wallet_auto_pay';

async function lockFamilyWallet(
  trx: Kysely<DB>,
  credit: AutoPayCredit,
  userId: string
): Promise<FamilyWallet | undefined> {
  const { rows } = await sql<{ id: string; name: string }>`
    SELECT w.id, u.name
    FROM wallet w
    JOIN "user" u ON u.id = ${userId}
    WHERE w.organization_id = ${credit.organizationId}
      AND w.guardian_id = ${credit.guardianId}
    FOR UPDATE OF w`.execute(trx);
  const [row] = rows;
  return row && { walletId: row.id, userName: row.name };
}

async function childrenOf(
  trx: Kysely<DB>,
  credit: AutoPayCredit,
  earmarks: ReadonlyMap<string, number>
): Promise<PayTableChild[]> {
  const { rows } = await sql<{ id: string; owed: string }>`
    SELECT st.id, (${receivableBalanceSql('st')})::text AS owed
    FROM guardian_student gs
    JOIN student st ON st.id = gs.student_id AND st.organization_id = gs.organization_id
    WHERE gs.organization_id = ${credit.organizationId}
      AND gs.guardian_id = ${credit.guardianId}
    ORDER BY st.first_name, st.last_name, st.id`.execute(trx);
  const owing = rows.filter((row) => Number(row.owed) > 0);
  const oldest = await oldestUnpaidByChild(trx, {
    organizationId: credit.organizationId,
    studentIds: owing.map((row) => row.id),
  });
  return owing.map((row) => ({
    studentId: row.id,
    owedMinor: Number(row.owed),
    earmarkMinor: earmarks.get(row.id) ?? 0,
    oldestUnpaidOn: oldest.get(row.id) ?? null,
  }));
}

/** Money that lands in a wallet pays the family's oldest charges, when the guardian has switched auto-pay on. */
@Injectable()
export class WalletAutoPayService {
  private readonly logger = new Logger(WalletAutoPayService.name);

  constructor(
    private readonly poster: LedgerPoster,
    private readonly activity: ActivityWriter,
    private readonly clock: Clock
  ) {}

  /**
   * Runs inside the crediting transaction. A failure rolls back to a savepoint and is logged,
   * so the credit is never lost.
   */
  async applyAfterCredit(
    trx: Kysely<DB>,
    credit: AutoPayCredit
  ): Promise<void> {
    await sql.raw(`SAVEPOINT ${SAVEPOINT}`).execute(trx);
    try {
      await this.pay(trx, credit);
      await sql.raw(`RELEASE SAVEPOINT ${SAVEPOINT}`).execute(trx);
    } catch (error) {
      await sql.raw(`ROLLBACK TO SAVEPOINT ${SAVEPOINT}`).execute(trx);
      this.logger.error(
        `Auto-pay after ${credit.reference} failed; the credit stands.`,
        error instanceof Error ? error.stack : String(error)
      );
    }
  }

  private async pay(trx: Kysely<DB>, credit: AutoPayCredit): Promise<void> {
    const { organizationId, guardianId } = credit;
    const setting = await latestAutoPay(trx, { organizationId, guardianId });
    if (setting?.enabled !== true) {
      return;
    }
    if (
      !(await memberHolds(
        trx,
        { organizationId, userId: setting.createdBy },
        'wallet:spend'
      ))
    ) {
      return;
    }
    const wallet = await lockFamilyWallet(trx, credit, setting.createdBy);
    if (wallet === undefined) {
      return;
    }
    const { freeMinor, marked } = await walletFreeMoney(trx, {
      organizationId,
      walletId: wallet.walletId,
      guardianId,
    });
    if (freeMinor <= 0) {
      return;
    }
    const lines = planAutoPay(await childrenOf(trx, credit, marked), freeMinor);
    if (lines.length === 0) {
      return;
    }
    const outcome = await writeSpend(
      trx,
      { poster: this.poster, activity: this.activity },
      {
        organizationId,
        userId: setting.createdBy,
        userName: wallet.userName,
        walletId: wallet.walletId,
        reference: autoPayReference(credit.reference),
        requestHash: spendRequestHash(wallet.walletId, { lines }),
        lines,
        spentOn: this.clock.today(),
      }
    );
    if (outcome.status === 'reference_used' || outcome.status === 'over') {
      throw new Error(`Auto-pay was refused: ${outcome.status}`);
    }
  }
}
