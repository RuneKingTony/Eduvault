import { randomUUID } from 'node:crypto';
import { sql, type Kysely } from 'kysely';
import { STUDENT_WALLETS_SYSTEM_KEY } from '@eduvault/api-contract';
import { walletFigures } from '@eduvault/shared';
import type { DB } from '../../../db/db-types';
import {
  ActivityWriter,
  financeActor,
  walletToppedUpActivity,
} from '../../common/activity';
import {
  LedgerPoster,
  schoolCurrency,
  systemAccountId,
} from '../../common/ledger';
import { claimReference } from '../../common/references/apply-once';
import { currentCampusSql } from '../../common/students';
import {
  earmarksByChild,
  findReferenceRow,
  journalReferenceTaken,
  lockWallet,
  topUpPostingLines,
  walletBalance,
  WalletAutoPayService,
  type LockedWallet,
  type WalletWriteDeps,
} from '../../common/wallet';
import type {
  AutoPayOutcome,
  EarmarkOutcome,
  NewAutoPay,
  NewEarmark,
  NewTopUp,
  TopUpOutcome,
} from './wallet.repository';

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

async function claimTopUp(
  trx: Kysely<DB>,
  input: NewTopUp
): Promise<TopUpOutcome | undefined> {
  const { organizationId } = input;
  const claim = await claimReference(trx, {
    lockKey: `wallet-topup:${organizationId}:${input.reference}`,
    requestHash: input.requestHash,
    find: () =>
      findReferenceRow('wallet_topup', trx, {
        organizationId,
        reference: input.reference,
      }),
  });
  if (claim.status === 'replayed') {
    return { status: 'replayed', id: claim.existing.id };
  }
  const taken =
    claim.status === 'clash' ||
    (await journalReferenceTaken(trx, organizationId, input.reference));
  return taken ? { status: 'reference_used' } : undefined;
}

interface TopUpWrite {
  input: NewTopUp;
  wallet: LockedWallet;
  topUpId: string;
}

async function postTopUp(
  trx: Kysely<DB>,
  poster: LedgerPoster,
  { input, wallet, topUpId }: TopUpWrite
): Promise<string> {
  const { organizationId } = input;
  const entry = await poster.postOnce(trx, {
    organizationId,
    reference: input.reference,
    kind: 'wallet_topup',
    effectiveOn: input.receivedOn,
    memo: `Wallet top-up · ${input.depositorName ?? wallet.guardianName}`,
    postedBy: input.userId,
    sourceId: topUpId,
    lines: topUpPostingLines({
      moneyLedgerAccountId: input.ledgerAccountId,
      moneyCampusId: input.accountCampusId,
      walletsAccountId: await systemAccountId(
        trx,
        organizationId,
        STUDENT_WALLETS_SYSTEM_KEY
      ),
      familyId: wallet.guardianId,
      amountMinor: input.amountMinor,
    }),
  });
  return entry.id;
}

async function recordTopUpActivity(
  trx: Kysely<DB>,
  activity: ActivityWriter,
  { input, wallet, topUpId }: TopUpWrite
): Promise<void> {
  const { organizationId } = input;
  const [currency, campusIds] = await Promise.all([
    schoolCurrency(trx, organizationId),
    familyCampuses(trx, { organizationId, guardianId: wallet.guardianId }),
  ]);
  await activity.within(trx).recordMany(
    walletToppedUpActivity(
      financeActor(
        { organizationId, userId: input.userId, name: input.userName },
        currency
      ),
      {
        id: topUpId,
        walletId: input.walletId,
        guardianName: wallet.guardianName,
        amountMinor: input.amountMinor,
        campusIds,
      }
    )
  );
}

export async function writeTopUp(
  trx: Kysely<DB>,
  deps: WalletWriteDeps & { autoPay: WalletAutoPayService },
  input: NewTopUp
): Promise<TopUpOutcome> {
  const refused = await claimTopUp(trx, input);
  if (refused !== undefined) {
    return refused;
  }
  const write = {
    input,
    wallet: await lockWallet(trx, input),
    topUpId: randomUUID(),
  };
  const entryId = await postTopUp(trx, deps.poster, write);
  await trx
    .insertInto('wallet_topup')
    .values({
      id: write.topUpId,
      organization_id: input.organizationId,
      wallet_id: input.walletId,
      reference: input.reference,
      money_account_id: input.moneyAccountId,
      method: input.method,
      amount_minor: input.amountMinor,
      received_on: input.receivedOn,
      depositor_name: input.depositorName,
      proof_file_id: input.proofFileId,
      request_hash: input.requestHash,
      journal_entry_id: entryId,
      created_by: input.userId,
    })
    .execute();
  await recordTopUpActivity(trx, deps.activity, write);
  await deps.autoPay.applyAfterCredit(trx, {
    organizationId: input.organizationId,
    guardianId: write.wallet.guardianId,
    reference: input.reference,
  });
  return { status: 'recorded', id: write.topUpId };
}

const earmarkRequestHash = (earmark: {
  walletId: string;
  studentId: string;
  kind: string;
  amountMinor: number;
}): string =>
  [earmark.walletId, earmark.studentId, earmark.kind, earmark.amountMinor].join(
    '|'
  );

async function findEarmarkRow(
  trx: Kysely<DB>,
  organizationId: string,
  reference: string
) {
  const row = await trx
    .selectFrom('wallet_earmark')
    .select(['id', 'wallet_id', 'student_id', 'kind', 'delta_minor'])
    .where('organization_id', '=', organizationId)
    .where('reference', '=', reference)
    .executeTakeFirst();
  return (
    row && {
      id: row.id,
      requestHash: earmarkRequestHash({
        walletId: row.wallet_id,
        studentId: row.student_id,
        kind: row.kind,
        amountMinor: Math.abs(Number(row.delta_minor)),
      }),
    }
  );
}

export async function writeEarmark(
  trx: Kysely<DB>,
  input: NewEarmark
): Promise<EarmarkOutcome> {
  const { organizationId } = input;
  const claim = await claimReference(trx, {
    lockKey: `wallet-earmark:${organizationId}:${input.reference}`,
    requestHash: earmarkRequestHash(input),
    find: () => findEarmarkRow(trx, organizationId, input.reference),
  });
  if (claim.status === 'replayed') {
    return { status: 'replayed' };
  }
  if (claim.status === 'clash') {
    return { status: 'reference_used' };
  }
  const wallet = await lockWallet(trx, input);
  const [balance, marked] = await Promise.all([
    walletBalance(trx, { organizationId, guardianId: wallet.guardianId }),
    earmarksByChild(trx, { organizationId, walletId: input.walletId }),
  ]);
  const { freeMinor } = walletFigures(balance, [...marked.values()]);
  const held = marked.get(input.studentId) ?? 0;
  const limitMinor = input.kind === 'set' ? Math.max(0, freeMinor) : held;
  if (input.amountMinor > limitMinor) {
    return { status: 'over', limitMinor };
  }
  await trx
    .insertInto('wallet_earmark')
    .values({
      organization_id: organizationId,
      wallet_id: input.walletId,
      student_id: input.studentId,
      kind: input.kind,
      delta_minor:
        input.kind === 'set' ? input.amountMinor : -input.amountMinor,
      reference: input.reference,
      created_by: input.userId,
    })
    .execute();
  return { status: 'applied' };
}

export async function writeAutoPay(
  trx: Kysely<DB>,
  input: NewAutoPay
): Promise<AutoPayOutcome> {
  const { organizationId, reference } = input;
  const wallet = await trx
    .selectFrom('wallet')
    .select('guardian_id')
    .where('organization_id', '=', organizationId)
    .where('id', '=', input.walletId)
    .executeTakeFirstOrThrow();
  const requestHash = `${wallet.guardian_id}|${input.enabled}`;
  const claim = await claimReference(trx, {
    lockKey: `wallet-auto-pay:${organizationId}:${reference}`,
    requestHash,
    find: async () => {
      const row = await trx
        .selectFrom('wallet_auto_pay_setting')
        .select(['id', 'guardian_id', 'enabled'])
        .where('organization_id', '=', organizationId)
        .where('reference', '=', reference)
        .executeTakeFirst();
      return (
        row && {
          id: row.id,
          requestHash: `${row.guardian_id}|${row.enabled}`,
        }
      );
    },
  });
  if (claim.status === 'replayed') {
    return { status: 'replayed' };
  }
  if (claim.status === 'clash') {
    return { status: 'reference_used' };
  }
  await trx
    .insertInto('wallet_auto_pay_setting')
    .values({
      organization_id: organizationId,
      guardian_id: wallet.guardian_id,
      enabled: input.enabled,
      reference,
      created_by: input.userId,
    })
    .execute();
  return { status: 'applied' };
}
