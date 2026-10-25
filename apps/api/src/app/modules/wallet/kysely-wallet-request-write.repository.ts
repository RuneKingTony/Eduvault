import { sql, type Kysely } from 'kysely';
import {
  STUDENT_WALLETS_SYSTEM_KEY,
  type WalletApprovalKind,
} from '@eduvault/api-contract';
import type { DB } from '../../../db/db-types';
import {
  financeActor,
  walletRefundDeclinedActivity,
  walletRefundRequestedActivity,
  walletRefundedActivity,
  walletTopUpCancelDeclinedActivity,
  walletTopUpCancelRequestedActivity,
  walletTopUpCancelledActivity,
  type FinanceActor,
  type WalletRequestFacts,
} from '../../common/activity';
import { decisionsFor } from '../../common/approvals';
import {
  LedgerPoster,
  clampMemo,
  entryLines,
  mirrorLines,
  schoolCurrency,
  systemAccountId,
} from '../../common/ledger';
import { usableMoneyAccount } from '../../common/money-accounts';
import { claimReference } from '../../common/references/apply-once';
import {
  lockWallet,
  refundPostingLines,
  walletFreeMoney,
  type ExistingEntry,
  type LockedWallet,
  type WalletWriteDeps,
} from '../../common/wallet';
import { familyCampuses } from './kysely-wallet-write.repository';
import type {
  ApprovalOutcome,
  CancellationRequestOutcome,
  Declining,
  DeclineOutcome,
  Decision,
  NewCancellationRequest,
  NewRefundRequest,
  RefundApproval,
  RefundRequestOutcome,
} from './wallet.repository';

interface Actor {
  organizationId: string;
  userId: string;
  userName: string;
}

export async function findRequestRow(
  db: Kysely<DB>,
  kind: WalletApprovalKind,
  key: { organizationId: string; reference: string }
): Promise<ExistingEntry | undefined> {
  const { rows } = await (
    kind === 'wallet_refund'
      ? sql<{ id: string; wallet_id: string; request_hash: string }>`
        SELECT id, wallet_id, request_hash FROM wallet_refund
        WHERE organization_id = ${key.organizationId} AND reference = ${key.reference}`
      : sql<{ id: string; wallet_id: string; request_hash: string }>`
        SELECT c.id, t.wallet_id, c.request_hash
        FROM wallet_topup_cancellation c
        JOIN wallet_topup t ON t.id = c.wallet_topup_id AND t.organization_id = c.organization_id
        WHERE c.organization_id = ${key.organizationId} AND c.reference = ${key.reference}`
  ).execute(db);
  const [row] = rows;
  return (
    row && {
      id: row.id,
      walletId: row.wallet_id,
      requestHash: row.request_hash,
    }
  );
}

async function actorOf(trx: Kysely<DB>, who: Actor): Promise<FinanceActor> {
  return financeActor(
    {
      organizationId: who.organizationId,
      userId: who.userId,
      name: who.userName,
    },
    await schoolCurrency(trx, who.organizationId)
  );
}

async function factsOf(
  trx: Kysely<DB>,
  request: {
    id: string;
    organizationId: string;
    walletId: string;
    guardianId: string;
    guardianName: string;
    amountMinor: number;
  }
): Promise<WalletRequestFacts> {
  return {
    id: request.id,
    walletId: request.walletId,
    guardianName: request.guardianName,
    amountMinor: request.amountMinor,
    campusIds: await familyCampuses(trx, {
      organizationId: request.organizationId,
      guardianId: request.guardianId,
    }),
  };
}

export async function writeRefundRequest(
  trx: Kysely<DB>,
  deps: Pick<WalletWriteDeps, 'activity'>,
  input: NewRefundRequest
): Promise<RefundRequestOutcome> {
  const { organizationId } = input;
  const claim = await claimReference(trx, {
    lockKey: `wallet-refund:${organizationId}:${input.reference}`,
    requestHash: input.requestHash,
    find: () =>
      findRequestRow(trx, 'wallet_refund', {
        organizationId,
        reference: input.reference,
      }),
  });
  if (claim.status === 'replayed') {
    return { status: 'replayed', id: claim.existing.id };
  }
  if (claim.status === 'clash') {
    return { status: 'reference_used' };
  }
  const wallet = await lockWallet(trx, input);
  const { freeMinor } = await walletFreeMoney(trx, {
    ...input,
    guardianId: wallet.guardianId,
  });
  const limitMinor = Math.max(0, freeMinor);
  if (input.amountMinor > limitMinor) {
    return { status: 'over', limitMinor };
  }
  const row = await trx
    .insertInto('wallet_refund')
    .values({
      organization_id: organizationId,
      wallet_id: input.walletId,
      money_account_id: input.moneyAccountId,
      amount_minor: input.amountMinor,
      parent_email: input.parentEmail,
      reason: input.reason,
      proof_file_id: input.proofFileId,
      reference: input.reference,
      request_hash: input.requestHash,
      created_by: input.userId,
    })
    .returning('id')
    .executeTakeFirstOrThrow();
  await deps.activity.within(trx).recordMany(
    walletRefundRequestedActivity(
      await actorOf(trx, input),
      await factsOf(trx, {
        ...input,
        id: row.id,
        guardianId: wallet.guardianId,
        guardianName: wallet.guardianName,
      })
    )
  );
  return { status: 'requested', id: row.id };
}

type CancellationBlock = Extract<
  CancellationRequestOutcome,
  { status: 'exists' | 'over' }
>;

async function cancellable(
  trx: Kysely<DB>,
  input: NewCancellationRequest,
  guardianId: string
): Promise<CancellationBlock | { status: 'open'; topUpMinor: number }> {
  const { organizationId } = input;
  const open = await trx
    .selectFrom('wallet_topup_cancellation')
    .select('id')
    .where('organization_id', '=', organizationId)
    .where('wallet_topup_id', '=', input.topUpId)
    .where('status', 'in', ['submitted', 'approved'])
    .executeTakeFirst();
  if (open !== undefined) {
    return { status: 'exists' };
  }
  const topUp = await trx
    .selectFrom('wallet_topup')
    .select('amount_minor')
    .where('organization_id', '=', organizationId)
    .where('id', '=', input.topUpId)
    .executeTakeFirstOrThrow();
  const topUpMinor = Number(topUp.amount_minor);
  const { freeMinor } = await walletFreeMoney(trx, { ...input, guardianId });
  return freeMinor < topUpMinor
    ? { status: 'over', topUpMinor, freeMinor: Math.max(0, freeMinor) }
    : { status: 'open', topUpMinor };
}

export async function writeCancellationRequest(
  trx: Kysely<DB>,
  deps: Pick<WalletWriteDeps, 'activity'>,
  input: NewCancellationRequest
): Promise<CancellationRequestOutcome> {
  const { organizationId } = input;
  const claim = await claimReference(trx, {
    lockKey: `wallet-cancel:${organizationId}:${input.reference}`,
    requestHash: input.requestHash,
    find: () =>
      findRequestRow(trx, 'wallet_topup_cancellation', {
        organizationId,
        reference: input.reference,
      }),
  });
  if (claim.status === 'replayed') {
    return { status: 'replayed', id: claim.existing.id };
  }
  if (claim.status === 'clash') {
    return { status: 'reference_used' };
  }
  const wallet = await lockWallet(trx, input);
  const checked = await cancellable(trx, input, wallet.guardianId);
  if (checked.status !== 'open') {
    return checked;
  }
  const { topUpMinor } = checked;
  const row = await trx
    .insertInto('wallet_topup_cancellation')
    .values({
      organization_id: organizationId,
      wallet_topup_id: input.topUpId,
      reason: input.reason,
      reference: input.reference,
      request_hash: input.requestHash,
      created_by: input.userId,
    })
    .returning('id')
    .executeTakeFirstOrThrow();
  await deps.activity.within(trx).recordMany(
    walletTopUpCancelRequestedActivity(
      await actorOf(trx, input),
      await factsOf(trx, {
        ...input,
        id: row.id,
        amountMinor: topUpMinor,
        guardianId: wallet.guardianId,
        guardianName: wallet.guardianName,
      })
    )
  );
  return { status: 'requested', id: row.id };
}

interface LockedRequest {
  id: string;
  status: string;
  reference: string;
  reason: string;
  amountMinor: number;
  walletId: string;
  moneyAccountId: string | null;
  topUp: { reference: string; entryId: string } | null;
}

interface LockedRow {
  id: string;
  status: string;
  reference: string;
  reason: string;
  amount_minor: string;
  wallet_id: string;
  money_account_id: string | null;
  topup_reference: string | null;
  topup_entry_id: string | null;
}

const toLocked = (row: LockedRow): LockedRequest => ({
  id: row.id,
  status: row.status,
  reference: row.reference,
  reason: row.reason,
  amountMinor: Number(row.amount_minor),
  walletId: row.wallet_id,
  moneyAccountId: row.money_account_id,
  topUp:
    row.topup_reference === null || row.topup_entry_id === null
      ? null
      : { reference: row.topup_reference, entryId: row.topup_entry_id },
});

async function lockRequest(
  trx: Kysely<DB>,
  kind: WalletApprovalKind,
  key: { organizationId: string; id: string }
): Promise<LockedRequest | undefined> {
  const { rows } = await (
    kind === 'wallet_refund'
      ? sql<LockedRow>`
        SELECT r.id, r.status, r.reference, r.reason, r.amount_minor::text AS amount_minor,
          r.wallet_id, r.money_account_id, NULL::text AS topup_reference,
          NULL::uuid AS topup_entry_id
        FROM wallet_refund r
        WHERE r.organization_id = ${key.organizationId} AND r.id = ${key.id}
        FOR UPDATE OF r`
      : sql<LockedRow>`
        SELECT c.id, c.status, c.reference, c.reason, t.amount_minor::text AS amount_minor,
          t.wallet_id, NULL::uuid AS money_account_id, t.reference AS topup_reference,
          t.journal_entry_id AS topup_entry_id
        FROM wallet_topup_cancellation c
        JOIN wallet_topup t ON t.id = c.wallet_topup_id AND t.organization_id = c.organization_id
        WHERE c.organization_id = ${key.organizationId} AND c.id = ${key.id}
        FOR UPDATE OF c`
  ).execute(trx);
  return rows[0] && toLocked(rows[0]);
}

interface Settling {
  request: LockedRequest;
  wallet: LockedWallet;
  input: Decision;
}

async function postedFacts(
  trx: Kysely<DB>,
  { request, wallet, input }: Settling
): Promise<WalletRequestFacts> {
  return factsOf(trx, {
    ...request,
    organizationId: input.organizationId,
    guardianId: wallet.guardianId,
    guardianName: wallet.guardianName,
  });
}

interface RefundPosting {
  input: RefundApproval;
  request: LockedRequest;
  wallet: LockedWallet;
  account: { ledgerAccountId: string; campusId: string | null };
}

async function postRefund(
  trx: Kysely<DB>,
  poster: LedgerPoster,
  { input, request, wallet, account }: RefundPosting
): Promise<string> {
  const { organizationId } = input;
  const entry = await poster.postOnce(trx, {
    organizationId,
    reference: `WRF-${request.reference}`,
    kind: 'wallet_refund',
    effectiveOn: input.decidedOn,
    memo: clampMemo(
      `Wallet refund · ${wallet.guardianName} · ${input.payoutReference}`
    ),
    postedBy: input.userId,
    sourceId: request.id,
    lines: refundPostingLines({
      moneyLedgerAccountId: account.ledgerAccountId,
      moneyCampusId: account.campusId,
      walletsAccountId: await systemAccountId(
        trx,
        organizationId,
        STUDENT_WALLETS_SYSTEM_KEY
      ),
      familyId: wallet.guardianId,
      amountMinor: request.amountMinor,
    }),
  });
  return entry.id;
}

export async function writeRefundApproval(
  trx: Kysely<DB>,
  deps: WalletWriteDeps,
  input: RefundApproval
): Promise<ApprovalOutcome> {
  const { organizationId } = input;
  const request = await lockRequest(trx, 'wallet_refund', input);
  if (request?.status !== 'submitted' || request.moneyAccountId === null) {
    return { status: 'decided' };
  }
  const wallet = await lockWallet(trx, {
    organizationId,
    walletId: request.walletId,
  });
  const { freeMinor: free } = await walletFreeMoney(trx, {
    organizationId,
    walletId: request.walletId,
    guardianId: wallet.guardianId,
  });
  if (free < 0) {
    return { status: 'money_gone' };
  }
  const account = await usableMoneyAccount(
    trx,
    { organizationId, campusScope: 'all' },
    request.moneyAccountId
  );
  if (account.status !== 'ok' || account.kind !== 'bank') {
    return { status: 'account_unusable' };
  }
  const entryId = await postRefund(trx, deps.poster, {
    input,
    request,
    wallet,
    account,
  });
  await settle(trx, 'wallet_refund', {
    input,
    entryId,
    payoutReference: input.payoutReference,
  });
  await deps.activity
    .within(trx)
    .recordMany(
      walletRefundedActivity(
        await actorOf(trx, input),
        await postedFacts(trx, { request, wallet, input }),
        { ownRequest: input.ownRequest }
      )
    );
  return { status: 'approved' };
}

export async function writeCancellationApproval(
  trx: Kysely<DB>,
  deps: WalletWriteDeps,
  input: Decision
): Promise<ApprovalOutcome> {
  const { organizationId } = input;
  const request = await lockRequest(trx, 'wallet_topup_cancellation', input);
  if (request?.status !== 'submitted' || request.topUp === null) {
    return { status: 'decided' };
  }
  const wallet = await lockWallet(trx, {
    organizationId,
    walletId: request.walletId,
  });
  const { freeMinor: free } = await walletFreeMoney(trx, {
    organizationId,
    walletId: request.walletId,
    guardianId: wallet.guardianId,
  });
  if (free < 0) {
    return { status: 'money_gone' };
  }
  const entry = await deps.poster.postOnce(trx, {
    organizationId,
    reference: `WTC-${request.reference}`,
    kind: 'wallet_topup_void',
    effectiveOn: input.decidedOn,
    memo: clampMemo(
      `Cancelled top-up ${request.topUp.reference}: ${request.reason}`
    ),
    postedBy: input.userId,
    sourceId: request.id,
    reversesEntryId: request.topUp.entryId,
    lines: mirrorLines(
      await entryLines(trx, {
        organizationId,
        entryId: request.topUp.entryId,
      })
    ),
  });
  await settle(trx, 'wallet_topup_cancellation', {
    input,
    entryId: entry.id,
  });
  await deps.activity
    .within(trx)
    .recordMany(
      walletTopUpCancelledActivity(
        await actorOf(trx, input),
        await postedFacts(trx, { request, wallet, input }),
        { ownRequest: input.ownRequest }
      )
    );
  return { status: 'approved' };
}

/** The request row is locked and still waiting, so a refused update means the books are inconsistent: roll the posting back. */
async function settle(
  trx: Kysely<DB>,
  table: WalletApprovalKind,
  approval: { input: Decision; entryId: string; payoutReference?: string }
): Promise<void> {
  const { input } = approval;
  const approved = await decisionsFor(trx, {
    table,
    organizationId: input.organizationId,
    userId: input.userId,
  }).approve(input.id, approval.entryId, approval.payoutReference);
  if (!approved) {
    throw new Error(`Could not approve ${table} ${input.id}`);
  }
}

export async function writeDecline(
  trx: Kysely<DB>,
  deps: Pick<WalletWriteDeps, 'activity'>,
  decline: { kind: WalletApprovalKind; input: Declining }
): Promise<DeclineOutcome> {
  const { kind, input } = decline;
  const { organizationId } = input;
  const request = await lockRequest(trx, kind, input);
  if (request?.status !== 'submitted') {
    return { status: 'decided' };
  }
  const declined = await decisionsFor(trx, {
    table: kind,
    organizationId,
    userId: input.userId,
  }).reject(input.id, input.reason);
  if (!declined) {
    return { status: 'decided' };
  }
  const wallet = await lockWallet(trx, {
    organizationId,
    walletId: request.walletId,
  });
  const facts = await factsOf(trx, {
    ...request,
    organizationId,
    guardianId: wallet.guardianId,
    guardianName: wallet.guardianName,
  });
  const actor = await actorOf(trx, input);
  await deps.activity.within(trx).recordMany(
    kind === 'wallet_refund'
      ? walletRefundDeclinedActivity(actor, facts, { reason: input.reason })
      : walletTopUpCancelDeclinedActivity(actor, facts, {
          reason: input.reason,
        })
  );
  return { status: 'declined' };
}
