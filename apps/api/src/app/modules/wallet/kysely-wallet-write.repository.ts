import { randomUUID } from 'node:crypto';
import { sql, type Kysely } from 'kysely';
import {
  FEES_RECEIVABLE_SYSTEM_KEY,
  STUDENT_WALLETS_SYSTEM_KEY,
} from '@eduvault/api-contract';
import {
  allocateSpend,
  walletFigures,
  type SpendSplit,
} from '@eduvault/shared';
import type { DB } from '../../../db/db-types';
import {
  ActivityWriter,
  financeActor,
  walletSpentActivity,
  walletToppedUpActivity,
} from '../../common/activity';
import {
  LedgerPoster,
  receivableBalanceSql,
  schoolCurrency,
  systemAccountId,
} from '../../common/ledger';
import { campusesOf } from '../../common/payments';
import { claimReference } from '../../common/references/apply-once';
import { currentCampusSql } from '../../common/students';
import {
  earmarksByChild,
  walletBalance,
} from './kysely-wallet-read.repository';
import { spendPostingLines, topUpPostingLines } from './wallet-posting';
import type {
  EarmarkOutcome,
  ExistingEntry,
  NewEarmark,
  NewSpend,
  NewTopUp,
  SpendOutcome,
  TopUpOutcome,
} from './wallet.repository';

interface WalletWriteDeps {
  poster: LedgerPoster;
  activity: ActivityWriter;
}

interface LockedWallet {
  guardianId: string;
  guardianName: string;
}

export async function findTopUpRow(
  db: Kysely<DB>,
  organizationId: string,
  reference: string
): Promise<ExistingEntry | undefined> {
  const row = await db
    .selectFrom('wallet_topup')
    .select(['id', 'wallet_id', 'request_hash'])
    .where('organization_id', '=', organizationId)
    .where('reference', '=', reference)
    .executeTakeFirst();
  return (
    row && {
      id: row.id,
      walletId: row.wallet_id,
      requestHash: row.request_hash,
    }
  );
}

export async function findSpendRow(
  db: Kysely<DB>,
  organizationId: string,
  reference: string
): Promise<ExistingEntry | undefined> {
  const row = await db
    .selectFrom('wallet_spend')
    .select(['id', 'wallet_id', 'request_hash'])
    .where('organization_id', '=', organizationId)
    .where('reference', '=', reference)
    .executeTakeFirst();
  return (
    row && {
      id: row.id,
      walletId: row.wallet_id,
      requestHash: row.request_hash,
    }
  );
}

async function journalReferenceTaken(
  trx: Kysely<DB>,
  organizationId: string,
  reference: string
): Promise<boolean> {
  const clash = await trx
    .selectFrom('journal_entry')
    .select('id')
    .where('organization_id', '=', organizationId)
    .where('reference', '=', reference)
    .executeTakeFirst();
  return clash !== undefined;
}

async function lockWallet(
  trx: Kysely<DB>,
  wallet: { organizationId: string; walletId: string }
): Promise<LockedWallet> {
  const { rows } = await sql<{ guardian_id: string; full_name: string }>`
    SELECT w.guardian_id, g.full_name
    FROM wallet w
    JOIN guardian g ON g.id = w.guardian_id AND g.organization_id = w.organization_id
    WHERE w.organization_id = ${wallet.organizationId} AND w.id = ${wallet.walletId}
    FOR UPDATE OF w`.execute(trx);
  const [row] = rows;
  if (row === undefined) {
    throw new Error(`No wallet ${wallet.walletId}`);
  }
  return { guardianId: row.guardian_id, guardianName: row.full_name };
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

async function claimTopUp(
  trx: Kysely<DB>,
  input: NewTopUp
): Promise<TopUpOutcome | undefined> {
  const { organizationId } = input;
  const claim = await claimReference(trx, {
    lockKey: `wallet-topup:${organizationId}:${input.reference}`,
    requestHash: input.requestHash,
    find: () => findTopUpRow(trx, organizationId, input.reference),
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
  deps: WalletWriteDeps,
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
  return { status: 'recorded', id: write.topUpId };
}

async function owedByChild(
  trx: Kysely<DB>,
  family: { organizationId: string; studentIds: readonly string[] }
): Promise<Map<string, number>> {
  const { rows } = await sql<{ id: string; owed: string }>`
    SELECT st.id, (${receivableBalanceSql('st')})::text AS owed
    FROM student st
    WHERE st.organization_id = ${family.organizationId}
      AND st.id IN (${sql.join(family.studentIds)})`.execute(trx);
  return new Map(rows.map((row) => [row.id, Number(row.owed)]));
}

async function appendEarmarkSpends(
  trx: Kysely<DB>,
  input: NewSpend,
  spend: { entryId: string; split: readonly SpendSplit[] }
): Promise<void> {
  const used = spend.split.filter((line) => line.fromEarmarkMinor > 0);
  if (used.length === 0) {
    return;
  }
  await trx
    .insertInto('wallet_earmark')
    .values(
      used.map((line) => ({
        organization_id: input.organizationId,
        wallet_id: input.walletId,
        student_id: line.studentId,
        kind: 'spend',
        delta_minor: -line.fromEarmarkMinor,
        reference: `${input.reference}:earmark:${line.studentId}`,
        journal_entry_id: spend.entryId,
        created_by: input.userId,
      }))
    )
    .execute();
}

export async function writeSpend(
  trx: Kysely<DB>,
  deps: WalletWriteDeps,
  input: NewSpend
): Promise<SpendOutcome> {
  const { organizationId } = input;
  const claim = await claimReference(trx, {
    lockKey: `wallet-spend:${organizationId}:${input.reference}`,
    requestHash: input.requestHash,
    find: () => findSpendRow(trx, organizationId, input.reference),
  });
  if (claim.status === 'replayed') {
    return { status: 'replayed', id: claim.existing.id };
  }
  if (
    claim.status === 'clash' ||
    (await journalReferenceTaken(trx, organizationId, input.reference))
  ) {
    return { status: 'reference_used' };
  }
  const wallet = await lockWallet(trx, input);
  const studentIds = input.lines.map((line) => line.studentId);
  const [balance, marked, owed] = await Promise.all([
    walletBalance(trx, { organizationId, guardianId: wallet.guardianId }),
    earmarksByChild(trx, { organizationId, walletId: input.walletId }),
    owedByChild(trx, { organizationId, studentIds }),
  ]);
  const { freeMinor } = walletFigures(balance, [...marked.values()]);
  const allocation = allocateSpend(
    input.lines,
    studentIds.map((studentId) => ({
      studentId,
      owedMinor: owed.get(studentId) ?? 0,
      earmarkMinor: marked.get(studentId) ?? 0,
    })),
    freeMinor
  );
  if (!allocation.ok) {
    return {
      status: 'over',
      studentId: allocation.studentId,
      spendableMinor: allocation.spendableMinor,
    };
  }
  return recordSpend(trx, deps, {
    input,
    wallet,
    split: allocation.lines,
  });
}

interface SpendWrite {
  input: NewSpend;
  wallet: LockedWallet;
  split: readonly SpendSplit[];
  spendId: string;
  campusOf: ReadonlyMap<string, string>;
}

async function recordSpendActivity(
  trx: Kysely<DB>,
  activity: ActivityWriter,
  { input, wallet, split, spendId, campusOf }: SpendWrite
): Promise<void> {
  const { organizationId } = input;
  const currency = await schoolCurrency(trx, organizationId);
  await activity.within(trx).recordMany(
    walletSpentActivity(
      financeActor(
        { organizationId, userId: input.userId, name: input.userName },
        currency
      ),
      {
        id: spendId,
        walletId: input.walletId,
        guardianName: wallet.guardianName,
      },
      split.flatMap((line) => {
        const campusId = campusOf.get(line.studentId);
        return campusId === undefined
          ? []
          : [{ campusId, amountMinor: line.amountMinor }];
      })
    )
  );
}

async function postSpend(
  trx: Kysely<DB>,
  poster: LedgerPoster,
  { input, wallet, split, spendId, campusOf }: SpendWrite
): Promise<string> {
  const { organizationId } = input;
  const [receivableId, walletsAccountId] = await Promise.all([
    systemAccountId(trx, organizationId, FEES_RECEIVABLE_SYSTEM_KEY),
    systemAccountId(trx, organizationId, STUDENT_WALLETS_SYSTEM_KEY),
  ]);
  const entry = await poster.postOnce(trx, {
    organizationId,
    reference: input.reference,
    kind: 'wallet_spend',
    effectiveOn: input.spentOn,
    memo: `Paid from wallet · ${wallet.guardianName}`,
    postedBy: input.userId,
    sourceId: spendId,
    lines: spendPostingLines({
      walletsAccountId,
      receivableId,
      familyId: wallet.guardianId,
      lines: split,
      campusOf,
    }),
  });
  return entry.id;
}

async function recordSpend(
  trx: Kysely<DB>,
  deps: WalletWriteDeps,
  spend: {
    input: NewSpend;
    wallet: LockedWallet;
    split: readonly SpendSplit[];
  }
): Promise<SpendOutcome> {
  const { input, split } = spend;
  const write: SpendWrite = {
    ...spend,
    spendId: randomUUID(),
    campusOf: await campusesOf(
      trx,
      input.organizationId,
      split.map((line) => line.studentId)
    ),
  };
  const entryId = await postSpend(trx, deps.poster, write);
  await trx
    .insertInto('wallet_spend')
    .values({
      id: write.spendId,
      organization_id: input.organizationId,
      wallet_id: input.walletId,
      reference: input.reference,
      request_hash: input.requestHash,
      journal_entry_id: entryId,
      created_by: input.userId,
    })
    .execute();
  await appendEarmarkSpends(trx, input, { entryId, split });
  await recordSpendActivity(trx, deps.activity, write);
  return { status: 'spent', id: write.spendId };
}

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
      requestHash: [
        row.wallet_id,
        row.student_id,
        row.kind,
        Math.abs(Number(row.delta_minor)),
      ].join('|'),
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
    requestHash: [
      input.walletId,
      input.studentId,
      input.kind,
      input.amountMinor,
    ].join('|'),
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
