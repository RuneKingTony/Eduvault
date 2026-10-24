import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { sql, type Kysely } from 'kysely';
import {
  STUDENT_WALLETS_SYSTEM_KEY,
  gatewayModeSchema,
} from '@eduvault/api-contract';
import type { DB } from '../../../db/db-types';
import {
  ActivityWriter,
  gatewayActor,
  walletGatewayToppedUpActivity,
} from '../../common/activity';
import { advisoryLock } from '../../common/db/advisory-lock';
import { KYSELY_TOKEN, type Database } from '../../common/db/tokens';
import {
  LedgerPoster,
  schoolCurrency,
  systemAccountId,
} from '../../common/ledger';
import type { OrgScope } from '../../common/scope';
import { anyChildInScopeSql, currentCampusSql } from '../../common/students';
import {
  GatewayRepository,
  type FamilyWallet,
  type GatewayTopUpOutcome,
  type NewConnection,
  type NewGatewayTopUp,
  type NewReservedAccountRow,
  type StoredConnection,
  type StoredReservedAccount,
} from './gateway.repository';

const MONNIFY_COLLECTIONS_SYSTEM_KEY = 'monnify_collections';

interface ConnectionRow {
  mode: string;
  contract_code: string;
  api_key_enc: string;
  api_key_tail: string;
  secret_key_enc: string;
  secret_key_tail: string;
  last_tested_at: Date | null;
  last_test_ok: boolean | null;
  updated_at: Date;
}

const toConnection = (row: ConnectionRow): StoredConnection => ({
  mode: gatewayModeSchema.parse(row.mode),
  contractCode: row.contract_code,
  apiKey: { enc: row.api_key_enc, tail: row.api_key_tail },
  secretKey: { enc: row.secret_key_enc, tail: row.secret_key_tail },
  lastTestedAt: row.last_tested_at,
  lastTestOk: row.last_test_ok,
  updatedAt: row.updated_at,
});

interface AccountRow {
  id: string;
  wallet_id: string;
  account_reference: string;
  account_number: string;
  bank_name: string;
  account_name: string;
}

const toAccount = (row: AccountRow): StoredReservedAccount => ({
  id: row.id,
  walletId: row.wallet_id,
  accountReference: row.account_reference,
  accountNumber: row.account_number,
  bankName: row.bank_name,
  accountName: row.account_name,
});

interface WalletRow {
  wallet_id: string;
  guardian_id: string;
  full_name: string;
  email: string;
  paying: boolean;
}

const toWallet = (row: WalletRow): FamilyWallet => ({
  walletId: row.wallet_id,
  guardianId: row.guardian_id,
  guardianName: row.full_name,
  guardianEmail: row.email,
  paying: row.paying,
});

const WALLET_FACTS = sql`
  w.id AS wallet_id, w.guardian_id, g.full_name, COALESCE(g.email, u.email) AS email,
  EXISTS (
    SELECT 1 FROM guardian_student gs
    WHERE gs.guardian_id = w.guardian_id AND gs.organization_id = w.organization_id
      AND gs.pays_fees
  ) AS paying`;

const WALLET_JOINS = sql`
  FROM wallet w
  JOIN guardian g ON g.id = w.guardian_id AND g.organization_id = w.organization_id
  JOIN "user" u ON u.id = g.user_id`;

@Injectable()
export class KyselyGatewayRepository extends GatewayRepository {
  constructor(
    @Inject(KYSELY_TOKEN) private readonly db: Database,
    private readonly poster: LedgerPoster,
    private readonly activity: ActivityWriter
  ) {
    super();
  }

  async organizationExists(organizationId: string): Promise<boolean> {
    const row = await this.db
      .selectFrom('organization')
      .select('id')
      .where('id', '=', organizationId)
      .executeTakeFirst();
    return row !== undefined;
  }

  currency(organizationId: string): Promise<string> {
    return schoolCurrency(this.db, organizationId);
  }

  async findConnection(
    organizationId: string
  ): Promise<StoredConnection | undefined> {
    const row = await this.db
      .selectFrom('gateway_connection')
      .selectAll()
      .where('organization_id', '=', organizationId)
      .executeTakeFirst();
    return row && toConnection(row);
  }

  async saveConnection(input: NewConnection): Promise<StoredConnection> {
    const values = {
      mode: input.mode,
      contract_code: input.contractCode,
      api_key_enc: input.apiKey.enc,
      api_key_tail: input.apiKey.tail,
      secret_key_enc: input.secretKey.enc,
      secret_key_tail: input.secretKey.tail,
      last_tested_at: null,
      last_test_ok: null,
      updated_by: input.userId,
    };
    const row = await this.db
      .insertInto('gateway_connection')
      .values({ organization_id: input.organizationId, ...values })
      .onConflict((conflict) =>
        conflict
          .column('organization_id')
          .doUpdateSet({ ...values, updated_at: sql`now()` })
      )
      .returningAll()
      .executeTakeFirstOrThrow();
    return toConnection(row);
  }

  async recordTest(
    organizationId: string,
    result: { ok: boolean; at: Date }
  ): Promise<void> {
    await this.db
      .updateTable('gateway_connection')
      .set({ last_tested_at: result.at, last_test_ok: result.ok })
      .where('organization_id', '=', organizationId)
      .execute();
  }

  async findVisibleWallet(
    scope: OrgScope,
    walletId: string
  ): Promise<FamilyWallet | undefined> {
    const { rows } = await sql<WalletRow>`
      SELECT ${WALLET_FACTS} ${WALLET_JOINS}
      WHERE w.organization_id = ${scope.organizationId}
        AND w.id = ${walletId}
        AND ${anyChildInScopeSql('w', scope.campusScope)}`.execute(this.db);
    const [row] = rows;
    return row && toWallet(row);
  }

  async findWalletOfGuardian(
    organizationId: string,
    guardianId: string
  ): Promise<FamilyWallet | undefined> {
    const { rows } = await sql<WalletRow>`
      SELECT ${WALLET_FACTS} ${WALLET_JOINS}
      WHERE w.organization_id = ${organizationId}
        AND w.guardian_id = ${guardianId}`.execute(this.db);
    const [row] = rows;
    return row && toWallet(row);
  }

  async findReservedAccount(
    organizationId: string,
    walletId: string
  ): Promise<StoredReservedAccount | undefined> {
    const row = await this.db
      .selectFrom('wallet_reserved_account')
      .selectAll()
      .where('organization_id', '=', organizationId)
      .where('wallet_id', '=', walletId)
      .executeTakeFirst();
    return row && toAccount(row);
  }

  async findReservedAccountByReference(
    organizationId: string,
    accountReference: string
  ): Promise<StoredReservedAccount | undefined> {
    const row = await this.db
      .selectFrom('wallet_reserved_account')
      .selectAll()
      .where('organization_id', '=', organizationId)
      .where('account_reference', '=', accountReference)
      .executeTakeFirst();
    return row && toAccount(row);
  }

  async insertReservedAccount(
    input: NewReservedAccountRow
  ): Promise<StoredReservedAccount> {
    await this.db
      .insertInto('wallet_reserved_account')
      .values({
        organization_id: input.organizationId,
        wallet_id: input.walletId,
        account_reference: input.accountReference,
        account_number: input.accountNumber,
        bank_name: input.bankName,
        account_name: input.accountName,
      })
      .onConflict((conflict) =>
        conflict.columns(['organization_id', 'wallet_id']).doNothing()
      )
      .execute();
    const stored = await this.findReservedAccount(
      input.organizationId,
      input.walletId
    );
    if (stored === undefined) {
      throw new Error(`No reserved account for wallet ${input.walletId}`);
    }
    return stored;
  }

  postTopUp(input: NewGatewayTopUp): Promise<GatewayTopUpOutcome> {
    return this.db
      .transaction()
      .execute((trx) =>
        writeGatewayTopUp(
          trx,
          { poster: this.poster, activity: this.activity },
          input
        )
      );
  }
}

interface WriteDeps {
  poster: LedgerPoster;
  activity: ActivityWriter;
}

async function familyCampuses(
  trx: Kysely<DB>,
  family: { organizationId: string; guardianId: string }
): Promise<string[]> {
  const { rows } = await sql<{ campus_id: string | null }>`
    SELECT DISTINCT ${currentCampusSql('st')} AS campus_id
    FROM guardian_student gs
    JOIN student st ON st.id = gs.student_id AND st.organization_id = gs.organization_id
    WHERE gs.organization_id = ${family.organizationId}
      AND gs.guardian_id = ${family.guardianId}`.execute(trx);
  return rows.flatMap((row) => (row.campus_id === null ? [] : [row.campus_id]));
}

async function lockFamily(
  trx: Kysely<DB>,
  input: NewGatewayTopUp
): Promise<{ guardianId: string; guardianName: string }> {
  const { rows } = await sql<{ guardian_id: string; full_name: string }>`
    SELECT w.guardian_id, g.full_name
    FROM wallet w
    JOIN guardian g ON g.id = w.guardian_id AND g.organization_id = w.organization_id
    WHERE w.organization_id = ${input.organizationId} AND w.id = ${input.walletId}
    FOR UPDATE OF w`.execute(trx);
  const [row] = rows;
  if (row === undefined) {
    throw new Error(`No wallet ${input.walletId}`);
  }
  return { guardianId: row.guardian_id, guardianName: row.full_name };
}

/** Takes the lock for the Monnify reference, then says whether it was already applied or belongs to another journal entry. */
async function claimReference(
  trx: Kysely<DB>,
  input: NewGatewayTopUp
): Promise<'replayed' | 'clash' | undefined> {
  const { organizationId, reference } = input;
  await advisoryLock(trx, `gateway-topup:${organizationId}:${reference}`);
  const seen = await trx
    .selectFrom('gateway_topup')
    .select('id')
    .where('organization_id', '=', organizationId)
    .where('reference', '=', reference)
    .executeTakeFirst();
  if (seen !== undefined) {
    return 'replayed';
  }
  const taken = await trx
    .selectFrom('journal_entry')
    .select('id')
    .where('organization_id', '=', organizationId)
    .where('reference', '=', reference)
    .executeTakeFirst();
  return taken === undefined ? undefined : 'clash';
}

interface Family {
  guardianId: string;
  guardianName: string;
}

async function postEntry(
  trx: Kysely<DB>,
  poster: LedgerPoster,
  posting: { input: NewGatewayTopUp; family: Family; topUpId: string }
): Promise<string> {
  const { input, family, topUpId } = posting;
  const { organizationId } = input;
  const [collections, wallets] = await Promise.all([
    systemAccountId(trx, organizationId, MONNIFY_COLLECTIONS_SYSTEM_KEY),
    systemAccountId(trx, organizationId, STUDENT_WALLETS_SYSTEM_KEY),
  ]);
  const entry = await poster.postOnce(trx, {
    organizationId,
    reference: input.reference,
    kind: 'wallet_topup',
    effectiveOn: input.effectiveOn,
    memo: `Online top-up · ${family.guardianName}`,
    postedBy: null,
    sourceId: topUpId,
    lines: [
      {
        ledgerAccountId: collections,
        campusId: null,
        debitMinor: input.netMinor,
        creditMinor: 0,
      },
      {
        ledgerAccountId: wallets,
        familyId: family.guardianId,
        debitMinor: 0,
        creditMinor: input.netMinor,
      },
    ],
  });
  return entry.id;
}

async function recordActivity(
  trx: Kysely<DB>,
  activity: ActivityWriter,
  posting: { input: NewGatewayTopUp; family: Family; topUpId: string }
): Promise<void> {
  const { input, family, topUpId } = posting;
  const { organizationId } = input;
  const [currency, campusIds] = await Promise.all([
    schoolCurrency(trx, organizationId),
    familyCampuses(trx, { organizationId, guardianId: family.guardianId }),
  ]);
  await activity.within(trx).recordMany(
    walletGatewayToppedUpActivity(gatewayActor(organizationId, currency), {
      id: topUpId,
      walletId: input.walletId,
      guardianName: family.guardianName,
      amountMinor: input.netMinor,
      grossMinor: input.grossMinor,
      feeMinor: input.feeMinor,
      campusIds,
    })
  );
}

async function writeGatewayTopUp(
  trx: Kysely<DB>,
  deps: WriteDeps,
  input: NewGatewayTopUp
): Promise<GatewayTopUpOutcome> {
  const refused = await claimReference(trx, input);
  if (refused !== undefined) {
    return { status: refused };
  }
  const posting = {
    input,
    family: await lockFamily(trx, input),
    topUpId: randomUUID(),
  };
  const entryId = await postEntry(trx, deps.poster, posting);
  await trx
    .insertInto('gateway_topup')
    .values({
      id: posting.topUpId,
      organization_id: input.organizationId,
      wallet_id: input.walletId,
      reserved_account_id: input.reservedAccountId,
      reference: input.reference,
      payment_reference: input.paymentReference,
      gross_minor: input.grossMinor,
      fee_minor: input.feeMinor,
      net_minor: input.netMinor,
      paid_at: input.paidAt,
      signature_verified: true,
      journal_entry_id: entryId,
    })
    .execute();
  await recordActivity(trx, deps.activity, posting);
  return { status: 'posted', id: posting.topUpId };
}
