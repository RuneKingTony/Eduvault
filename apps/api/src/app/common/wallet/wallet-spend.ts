import { randomUUID } from 'node:crypto';
import { sql, type Kysely } from 'kysely';
import {
  FEES_RECEIVABLE_SYSTEM_KEY,
  STUDENT_WALLETS_SYSTEM_KEY,
} from '@eduvault/api-contract';
import {
  allocateSpend,
  walletFigures,
  type SpendRequestLine,
  type SpendSplit,
} from '@eduvault/shared';
import type { DB } from '../../../db/db-types';
import { ActivityWriter, financeActor, walletSpentActivity } from '../activity';
import {
  LedgerPoster,
  receivableBalanceSql,
  schoolCurrency,
  systemAccountId,
} from '../ledger';
import { campusesOf } from '../payments';
import { claimReference } from '../references/apply-once';
import { earmarksByChild, walletBalance } from './wallet-balance';
import { spendPostingLines } from './wallet-posting';

export interface WalletWriteDeps {
  poster: LedgerPoster;
  activity: ActivityWriter;
}

export interface ExistingEntry {
  id: string;
  walletId: string;
  requestHash: string;
}

export interface NewSpend {
  organizationId: string;
  userId: string;
  userName: string;
  walletId: string;
  reference: string;
  requestHash: string;
  lines: readonly SpendRequestLine[];
  spentOn: string;
}

export type SpendOutcome =
  | { status: 'spent'; id: string }
  | { status: 'replayed'; id: string }
  | { status: 'reference_used' }
  | { status: 'over'; studentId: string; spendableMinor: number };

export interface LockedWallet {
  guardianId: string;
  guardianName: string;
}

export async function findReferenceRow(
  table: 'wallet_topup' | 'wallet_spend',
  db: Kysely<DB>,
  key: { organizationId: string; reference: string }
): Promise<ExistingEntry | undefined> {
  const row = await db
    .selectFrom(table)
    .select(['id', 'wallet_id', 'request_hash'])
    .where('organization_id', '=', key.organizationId)
    .where('reference', '=', key.reference)
    .executeTakeFirst();
  return (
    row && {
      id: row.id,
      walletId: row.wallet_id,
      requestHash: row.request_hash,
    }
  );
}

export async function journalReferenceTaken(
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

export async function lockWallet(
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
    find: () =>
      findReferenceRow('wallet_spend', trx, {
        organizationId,
        reference: input.reference,
      }),
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
