import { sql, type Kysely, type RawBuilder } from 'kysely';
import { z } from 'zod';
import {
  approvalStatusSchema,
  earmarkMovementKindSchema,
  journalKindSchema,
  paymentMethodSchema,
  type WalletChild,
  type WalletListQuery,
  type WalletEarmarkMovement,
  type WalletJournalMovement,
  type WalletMovement,
  type ReservedAccount,
  type WalletMovementSource,
  type WalletSummary,
} from '@eduvault/api-contract';
import { childSpendable, walletFigures } from '@eduvault/shared';
import type { DB } from '../../../db/db-types';
import { iso } from '../../common/db/rows';
import { fileProofState, type ProofState } from '../../common/payments';
import { receivableBalanceSql } from '../../common/ledger';
import type { OrgScope } from '../../common/scope';
import {
  earmarkTotal,
  heldMoney,
  heldMoneySql,
  latestAutoPay,
  oldestUnpaidByChild,
  walletBalance,
  walletsAccountIdSql,
} from '../../common/wallet';
import {
  anyChildInScopeSql,
  currentCampusSql,
  inScope,
} from '../../common/students';
import { portalMovementOf } from './wallet-portal-movement';
import type {
  MovementPage,
  PortalMovementPage,
  TopUpToCancel,
  WalletPage,
  WalletView,
} from './wallet.repository';

interface WalletRow {
  id: string;
  guardian_id: string;
  full_name: string;
  phone: string;
}

interface ChildRow {
  student_id: string;
  first_name: string;
  last_name: string;
  admission_number: string;
  archived: boolean;
  in_scope: boolean;
  owed: string;
  earmark: string;
}

async function childRows(
  db: Kysely<DB>,
  wallet: WalletRow & { organization_id: string },
  scope: OrgScope['campusScope']
): Promise<ChildRow[]> {
  const { rows } = await sql<ChildRow>`
    SELECT st.id AS student_id, st.first_name, st.last_name, st.admission_number,
      (st.archived_at IS NOT NULL) AS archived,
      ${inScope(currentCampusSql('st'), scope)} AS in_scope,
      (${receivableBalanceSql('st')})::text AS owed,
      COALESCE((
        SELECT SUM(e.delta_minor) FROM wallet_earmark e
        WHERE e.organization_id = st.organization_id
          AND e.wallet_id = ${wallet.id} AND e.student_id = st.id
      ), 0)::text AS earmark
    FROM guardian_student gs
    JOIN student st ON st.id = gs.student_id AND st.organization_id = gs.organization_id
    WHERE gs.organization_id = ${wallet.organization_id}
      AND gs.guardian_id = ${wallet.guardian_id}
    ORDER BY st.first_name, st.last_name, st.id`.execute(db);
  return rows;
}

async function reservedAccountOf(
  db: Kysely<DB>,
  wallet: { organization_id: string; id: string }
): Promise<ReservedAccount | null> {
  const row = await db
    .selectFrom('wallet_reserved_account')
    .select(['account_number', 'bank_name', 'account_name'])
    .where('organization_id', '=', wallet.organization_id)
    .where('wallet_id', '=', wallet.id)
    .executeTakeFirst();
  return row === undefined
    ? null
    : {
        accountNumber: row.account_number,
        bankName: row.bank_name,
        accountName: row.account_name,
      };
}

async function gatewayConnected(
  db: Kysely<DB>,
  organizationId: string
): Promise<boolean> {
  const row = await db
    .selectFrom('gateway_connection')
    .select('id')
    .where('organization_id', '=', organizationId)
    .executeTakeFirst();
  return row !== undefined;
}

function toChild(
  row: ChildRow,
  context: { freeMinor: number; oldest: ReadonlyMap<string, string> }
): WalletChild {
  const owedMinor = Number(row.owed);
  const earmarkMinor = Number(row.earmark);
  return {
    studentId: row.student_id,
    name: `${row.first_name} ${row.last_name}`,
    admissionNumber: row.admission_number,
    inScope: row.in_scope,
    owedMinor,
    earmarkMinor,
    spendableMinor: childSpendable(
      { owedMinor, earmarkMinor },
      context.freeMinor
    ),
    oldestUnpaidOn: context.oldest.get(row.student_id) ?? null,
  };
}

async function oldestFor(
  db: Kysely<DB>,
  organizationId: string,
  from: { rows: readonly ChildRow[]; withOldestUnpaid: boolean }
): Promise<ReadonlyMap<string, string>> {
  if (!from.withOldestUnpaid) {
    return new Map();
  }
  return oldestUnpaidByChild(db, {
    organizationId,
    studentIds: from.rows
      .filter((row) => Number(row.owed) > 0)
      .map((row) => row.student_id),
  });
}

// Only the guardian's pay table orders by oldest unpaid charge; staff reads skip the query.
async function viewOf(
  db: Kysely<DB>,
  wallet: WalletRow & { organization_id: string },
  view: { scope: OrgScope['campusScope']; withOldestUnpaid: boolean }
): Promise<WalletView> {
  const family = {
    organizationId: wallet.organization_id,
    guardianId: wallet.guardian_id,
  };
  const [
    rows,
    balanceMinor,
    setAsideMinor,
    held,
    reservedAccount,
    connected,
    autoPay,
  ] = await Promise.all([
    childRows(db, wallet, view.scope),
    walletBalance(db, family),
    earmarkTotal(db, {
      organizationId: wallet.organization_id,
      walletId: wallet.id,
    }),
    heldMoney(db, {
      organizationId: wallet.organization_id,
      walletId: wallet.id,
    }),
    reservedAccountOf(db, wallet),
    gatewayConnected(db, wallet.organization_id),
    latestAutoPay(db, family),
  ]);
  const oldest = await oldestFor(db, wallet.organization_id, {
    rows,
    withOldestUnpaid: view.withOldestUnpaid,
  });
  const figures = walletFigures(balanceMinor, [setAsideMinor], held);
  const context = { freeMinor: figures.freeMinor, oldest };
  return {
    id: wallet.id,
    guardian: {
      id: wallet.guardian_id,
      name: wallet.full_name,
      phone: wallet.phone,
    },
    reservedAccount,
    gatewayConnected: connected,
    autoPay: autoPay?.enabled ?? false,
    ...figures,
    children: rows
      .filter(
        (row) =>
          !row.archived || Number(row.owed) !== 0 || Number(row.earmark) !== 0
      )
      .map((row) => toChild(row, context)),
  };
}

const WALLET_COLUMNS = sql`w.id, w.organization_id, w.guardian_id, g.full_name, g.phone`;

export async function walletInScope(
  db: Kysely<DB>,
  scope: OrgScope,
  walletId: string
): Promise<boolean> {
  const { rows } = await sql<{ id: string }>`
    SELECT w.id FROM wallet w
    WHERE w.organization_id = ${scope.organizationId}
      AND w.id = ${walletId}
      AND ${anyChildInScopeSql('w', scope.campusScope)}`.execute(db);
  return rows.length > 0;
}

export async function findWallet(
  db: Kysely<DB>,
  scope: OrgScope,
  walletId: string
): Promise<WalletView | undefined> {
  const { rows } = await sql<WalletRow & { organization_id: string }>`
    SELECT ${WALLET_COLUMNS}
    FROM wallet w
    JOIN guardian g ON g.id = w.guardian_id AND g.organization_id = w.organization_id
    WHERE w.organization_id = ${scope.organizationId}
      AND w.id = ${walletId}
      AND ${anyChildInScopeSql('w', scope.campusScope)}`.execute(db);
  const [row] = rows;
  return row === undefined
    ? undefined
    : viewOf(db, row, { scope: scope.campusScope, withOldestUnpaid: false });
}

export async function findOwnWallet(
  db: Kysely<DB>,
  organizationId: string,
  userId: string
): Promise<WalletView | undefined> {
  const { rows } = await sql<WalletRow & { organization_id: string }>`
    SELECT ${WALLET_COLUMNS}
    FROM wallet w
    JOIN guardian g ON g.id = w.guardian_id AND g.organization_id = w.organization_id
    WHERE w.organization_id = ${organizationId} AND g.user_id = ${userId}`.execute(
    db
  );
  const [row] = rows;
  return row === undefined
    ? undefined
    : viewOf(db, row, { scope: 'all', withOldestUnpaid: true });
}

interface SummaryRow {
  id: string;
  guardian_id: string;
  full_name: string;
  phone: string;
  child_count: string;
  balance: string;
  set_aside: string;
  held: string;
}

const searchSql = (query: string | undefined): RawBuilder<boolean> => {
  if (query === undefined || query === '') {
    return sql<boolean>`TRUE`;
  }
  return sql<boolean>`(
    position(lower(${query}) in lower(g.full_name)) > 0
    OR position(${query} in g.phone) > 0)`;
};

function visibleWallets(scope: OrgScope, query: WalletListQuery) {
  return sql`
    SELECT w.id, w.guardian_id, g.full_name, g.phone,
      (
        SELECT count(*) FROM guardian_student gs
        WHERE gs.organization_id = w.organization_id AND gs.guardian_id = w.guardian_id
      ) AS child_count,
      COALESCE((
        SELECT SUM(jl.credit_minor - jl.debit_minor) FROM journal_line jl
        WHERE jl.organization_id = w.organization_id
          AND jl.family_id = w.guardian_id
          AND jl.ledger_account_id = ${walletsAccountIdSql(sql.ref('w.organization_id'))}
      ), 0) AS balance,
      COALESCE((
        SELECT SUM(e.delta_minor) FROM wallet_earmark e
        WHERE e.organization_id = w.organization_id AND e.wallet_id = w.id
      ), 0) AS set_aside,
      ${heldMoneySql(sql.ref('w.organization_id'), sql.ref('w.id'))} AS held
    FROM wallet w
    JOIN guardian g ON g.id = w.guardian_id AND g.organization_id = w.organization_id
    WHERE w.organization_id = ${scope.organizationId}
      AND ${anyChildInScopeSql('w', scope.campusScope)}
      AND ${searchSql(query.q)}`;
}

const toSummary = (row: SummaryRow): WalletSummary => {
  const figures = walletFigures(
    Number(row.balance),
    [Number(row.set_aside)],
    Number(row.held)
  );
  return {
    id: row.id,
    guardianId: row.guardian_id,
    guardianName: row.full_name,
    guardianPhone: row.phone,
    childCount: Number(row.child_count),
    ...figures,
  };
};

export async function listWallets(
  db: Kysely<DB>,
  scope: OrgScope,
  query: WalletListQuery
): Promise<WalletPage> {
  const visible = visibleWallets(scope, query);
  const offset = (query.page - 1) * query.pageSize;
  const [page, totals] = await Promise.all([
    sql<SummaryRow>`
      WITH visible AS (${visible})
      SELECT id, guardian_id, full_name, phone, child_count::text, balance::text, set_aside::text,
        held::text
      FROM visible
      ORDER BY lower(full_name), id
      LIMIT ${query.pageSize} OFFSET ${offset}`.execute(db),
    sql<{ count: string; balance: string; set_aside: string; held: string }>`
      WITH visible AS (${visible})
      SELECT count(*)::text AS count,
        COALESCE(SUM(balance), 0)::text AS balance,
        COALESCE(SUM(set_aside), 0)::text AS set_aside,
        COALESCE(SUM(held), 0)::text AS held
      FROM visible`.execute(db),
  ]);
  const sums = totals.rows[0];
  const count = Number(sums?.count ?? 0);
  const figures = walletFigures(
    Number(sums?.balance ?? 0),
    [Number(sums?.set_aside ?? 0)],
    Number(sums?.held ?? 0)
  );
  return {
    items: page.rows.map((row) => toSummary(row)),
    total: count,
    totals: { walletCount: count, ...figures },
  };
}

interface MovementRow {
  line_id: string;
  entry_id: string;
  effective_on: string;
  posted_at: Date;
  kind: string;
  reference: string;
  student_id: string | null;
  first_name: string | null;
  last_name: string | null;
  amount: string;
  topup_id: string | null;
  method: string | null;
  depositor_name: string | null;
  proof_file_id: string | null;
  spend_id: string | null;
  gateway: unknown;
  cancellation: string | null;
  refund_id: string | null;
  payout_reference: string | null;
  cancel_id: string | null;
  cancel_reason: string | null;
  cancelled_reference: string | null;
  migrated_children: number | null;
  made_by: string | null;
}

const gatewayFactsSchema = z
  .object({
    id: z.uuid(),
    transactionReference: z.string(),
    paymentReference: z.string(),
    paidAt: z.string(),
    confirmedAt: z.string(),
    grossMinor: z.number(),
    feeMinor: z.number(),
    netMinor: z.number(),
  })
  .nullable();

const openCancellation = approvalStatusSchema.exclude(['rejected']);

function requestSourceOf(row: MovementRow): WalletMovementSource | null {
  if (row.refund_id !== null && row.payout_reference !== null) {
    return {
      type: 'refund',
      id: row.refund_id,
      payoutReference: row.payout_reference,
    };
  }
  if (
    row.cancel_id !== null &&
    row.cancel_reason !== null &&
    row.cancelled_reference !== null
  ) {
    return {
      type: 'topup_cancellation',
      id: row.cancel_id,
      topUpReference: row.cancelled_reference,
      reason: row.cancel_reason,
    };
  }
  return row.spend_id === null ? null : { type: 'spend', id: row.spend_id };
}

function sourceOf(row: MovementRow): WalletMovementSource | null {
  if (row.migrated_children !== null) {
    return { type: 'credit_migration', childCount: row.migrated_children };
  }
  const gateway = gatewayFactsSchema.parse(row.gateway);
  if (gateway !== null) {
    return {
      type: 'monnify',
      id: gateway.id,
      transactionReference: gateway.transactionReference,
      paymentReference: gateway.paymentReference,
      signatureVerified: true,
      paidAt: new Date(gateway.paidAt).toISOString(),
      confirmedAt: new Date(gateway.confirmedAt).toISOString(),
      grossMinor: gateway.grossMinor,
      feeMinor: gateway.feeMinor,
      netMinor: gateway.netMinor,
    };
  }
  if (
    row.topup_id !== null &&
    row.method !== null &&
    row.proof_file_id !== null
  ) {
    return {
      type: 'topup',
      id: row.topup_id,
      method: paymentMethodSchema.parse(row.method),
      depositorName: row.depositor_name,
      proofFileId: row.proof_file_id,
      cancellation:
        row.cancellation === null
          ? null
          : openCancellation.parse(row.cancellation),
    };
  }
  return requestSourceOf(row);
}

const toMovement = (row: MovementRow): WalletJournalMovement => ({
  type: 'journal',
  lineId: row.line_id,
  entryId: row.entry_id,
  effectiveOn: row.effective_on,
  postedAt: iso(row.posted_at),
  kind: journalKindSchema.parse(row.kind),
  reference: row.reference,
  studentId: row.student_id,
  studentName:
    row.first_name === null
      ? null
      : `${row.first_name} ${row.last_name ?? ''}`.trim(),
  amountMinor: Number(row.amount),
  source: sourceOf(row),
  madeBy: row.made_by,
});

function movementRows(db: Kysely<DB>, where: RawBuilder<unknown>) {
  return sql<MovementRow>`
      SELECT jl.id AS line_id, e.id AS entry_id,
        to_char(e.effective_on, 'YYYY-MM-DD') AS effective_on,
        e.posted_at, e.kind, e.reference, jl.student_id,
        st.first_name, st.last_name,
        (jl.credit_minor - jl.debit_minor)::text AS amount,
        t.id AS topup_id, t.method, t.depositor_name, t.proof_file_id,
        s.id AS spend_id,
        (
          SELECT c.status FROM wallet_topup_cancellation c
          WHERE c.wallet_topup_id = t.id AND c.organization_id = t.organization_id
            AND c.status IN ('submitted', 'approved')
        ) AS cancellation,
        wr.id AS refund_id, wr.payout_reference,
        wc.id AS cancel_id, wc.reason AS cancel_reason,
        ot.reference AS cancelled_reference,
        CASE WHEN e.kind = 'wallet_credit_migration' THEN (
          SELECT count(*)::int FROM journal_line mc
          WHERE mc.entry_id = e.id AND mc.organization_id = e.organization_id
            AND mc.student_id IS NOT NULL
        ) END AS migrated_children,
        CASE WHEN gt.id IS NULL THEN NULL ELSE jsonb_build_object(
          'id', gt.id, 'transactionReference', gt.reference,
          'paymentReference', gt.payment_reference,
          'paidAt', gt.paid_at, 'confirmedAt', gt.confirmed_at,
          'grossMinor', gt.gross_minor, 'feeMinor', gt.fee_minor,
          'netMinor', gt.net_minor) END AS gateway,
        u.name AS made_by
      FROM journal_line jl
      JOIN journal_entry e ON e.id = jl.entry_id AND e.organization_id = jl.organization_id
      LEFT JOIN student st ON st.id = jl.student_id AND st.organization_id = jl.organization_id
      LEFT JOIN wallet_topup t ON t.journal_entry_id = e.id AND t.organization_id = e.organization_id
      LEFT JOIN wallet_spend s ON s.journal_entry_id = e.id AND s.organization_id = e.organization_id
      LEFT JOIN gateway_topup gt ON gt.journal_entry_id = e.id AND gt.organization_id = e.organization_id
      LEFT JOIN wallet_refund wr ON wr.journal_entry_id = e.id AND wr.organization_id = e.organization_id
      LEFT JOIN wallet_topup_cancellation wc ON wc.journal_entry_id = e.id AND wc.organization_id = e.organization_id
      LEFT JOIN wallet_topup ot ON ot.id = wc.wallet_topup_id AND ot.organization_id = wc.organization_id
      LEFT JOIN "user" u ON u.id = COALESCE(
        t.created_by, s.created_by, wr.approved_by, wc.approved_by,
        CASE WHEN e.kind = 'wallet_credit_migration' THEN e.posted_by END)
      WHERE ${where}`.execute(db);
}

interface EarmarkRow {
  id: string;
  kind: string;
  amount: string;
  reference: string;
  created_at: Date;
  effective_on: string;
  student_id: string;
  first_name: string;
  last_name: string;
  made_by: string | null;
}

const toEarmarkMovement = (row: EarmarkRow): WalletEarmarkMovement => ({
  type: 'earmark',
  id: row.id,
  effectiveOn: row.effective_on,
  postedAt: iso(row.created_at),
  kind: earmarkMovementKindSchema.parse(row.kind),
  reference: row.reference,
  studentId: row.student_id,
  studentName: `${row.first_name} ${row.last_name}`.trim(),
  amountMinor: Number(row.amount),
  madeBy: row.made_by,
});

function earmarkRows(
  db: Kysely<DB>,
  wallet: { organizationId: string; ids: readonly string[] }
) {
  return sql<EarmarkRow>`
      SELECT em.id, em.kind, em.delta_minor::text AS amount, em.reference,
        em.created_at,
        to_char(em.created_at AT TIME ZONE 'Africa/Lagos', 'YYYY-MM-DD') AS effective_on,
        em.student_id, st.first_name, st.last_name, u.name AS made_by
      FROM wallet_earmark em
      JOIN student st ON st.id = em.student_id AND st.organization_id = em.organization_id
      LEFT JOIN "user" u ON u.id = em.created_by
      WHERE em.organization_id = ${wallet.organizationId}
        AND em.id = ANY(${[...wallet.ids]}::uuid[])`.execute(db);
}

interface FeedKey {
  type: 'journal' | 'earmark';
  id: string;
}

const SET_OR_RELEASE = sql`em.kind IN ('set', 'release')`;

function feedKeys(
  db: Kysely<DB>,
  feed: {
    organizationId: string;
    mine: RawBuilder<unknown>;
    walletId: RawBuilder<unknown>;
    paging: { page: number; pageSize: number };
  }
) {
  const { organizationId, paging } = feed;
  const offset = (paging.page - 1) * paging.pageSize;
  return sql<FeedKey>`
      SELECT type, id FROM (
        SELECT 'journal' AS type, jl.id::text AS id, e.posted_at AS at,
          e.sequence AS seq, lower(st.first_name) AS name
        FROM journal_line jl
        JOIN journal_entry e ON e.id = jl.entry_id AND e.organization_id = jl.organization_id
        LEFT JOIN student st ON st.id = jl.student_id AND st.organization_id = jl.organization_id
        WHERE ${feed.mine}
        UNION ALL
        SELECT 'earmark', em.id::text, em.created_at, NULL::bigint, NULL
        FROM wallet_earmark em
        WHERE em.organization_id = ${organizationId}
          AND em.wallet_id = ${feed.walletId}
          AND ${SET_OR_RELEASE}
      ) feed
      ORDER BY at DESC, seq DESC NULLS LAST, name, id
      LIMIT ${paging.pageSize} OFFSET ${offset}`.execute(db);
}

export async function walletMovements(
  db: Kysely<DB>,
  wallet: { organizationId: string; guardianId: string },
  paging: { page: number; pageSize: number }
): Promise<MovementPage> {
  const { organizationId, guardianId } = wallet;
  const mine = sql`
    jl.organization_id = ${organizationId}
    AND jl.family_id = ${guardianId}
    AND jl.ledger_account_id = ${walletsAccountIdSql(organizationId)}`;
  const walletId = sql`(
    SELECT w.id FROM wallet w
    WHERE w.organization_id = ${organizationId} AND w.guardian_id = ${guardianId})`;
  const [keys, count] = await Promise.all([
    feedKeys(db, { organizationId, mine, walletId, paging }),
    sql<{ count: string }>`
      SELECT (
        (SELECT count(*) FROM journal_line jl WHERE ${mine})
        + (SELECT count(*) FROM wallet_earmark em
           WHERE em.organization_id = ${organizationId}
             AND em.wallet_id = ${walletId} AND ${SET_OR_RELEASE})
      )::text AS count`.execute(db),
  ]);
  const idsOf = (type: FeedKey['type']) =>
    keys.rows.filter((key) => key.type === type).map((key) => key.id);
  const [journal, earmarks] = await Promise.all([
    movementRows(db, sql`${mine} AND jl.id = ANY(${idsOf('journal')}::uuid[])`),
    earmarkRows(db, { organizationId, ids: idsOf('earmark') }),
  ]);
  const byId = new Map<string, WalletMovement>([
    ...journal.rows.map((row): [string, WalletMovement] => [
      row.line_id,
      toMovement(row),
    ]),
    ...earmarks.rows.map((row): [string, WalletMovement] => [
      row.id,
      toEarmarkMovement(row),
    ]),
  ]);
  return {
    items: keys.rows.flatMap((key) => byId.get(key.id) ?? []),
    total: Number(count.rows[0]?.count ?? 0),
  };
}

export async function ownMovements(
  db: Kysely<DB>,
  guardian: { organizationId: string; userId: string },
  paging: { page: number; pageSize: number }
): Promise<PortalMovementPage | undefined> {
  const { organizationId, userId } = guardian;
  const wallet = await db
    .selectFrom('wallet as w')
    .innerJoin('guardian as g', (join) =>
      join
        .onRef('g.id', '=', 'w.guardian_id')
        .onRef('g.organization_id', '=', 'w.organization_id')
    )
    .select('w.guardian_id')
    .where('w.organization_id', '=', organizationId)
    .where('g.user_id', '=', userId)
    .executeTakeFirst();
  if (wallet === undefined) {
    return undefined;
  }
  const page = await walletMovements(
    db,
    { organizationId, guardianId: wallet.guardian_id },
    paging
  );
  return {
    items: page.items.map((item) => portalMovementOf(item)),
    total: page.total,
  };
}

export const walletProofState = (
  db: Kysely<DB>,
  proof: { organizationId: string; userId: string; fileId: string }
): Promise<ProofState> =>
  fileProofState(db, proof, { kind: 'wallet_proof', table: 'wallet_topup' });

export const refundProofState = (
  db: Kysely<DB>,
  proof: { organizationId: string; userId: string; fileId: string }
): Promise<ProofState> =>
  fileProofState(db, proof, {
    kind: 'wallet_refund_request',
    table: 'wallet_refund',
  });

export async function findTopUpToCancel(
  db: Kysely<DB>,
  scope: OrgScope,
  target: { walletId: string; topUpId: string }
): Promise<TopUpToCancel | undefined> {
  const { rows } = await sql<{
    id: string;
    reference: string;
    amount_minor: string;
    online: boolean;
  }>`
    SELECT t.id, t.reference, t.amount_minor::text AS amount_minor, FALSE AS online
    FROM wallet_topup t
    JOIN wallet w ON w.id = t.wallet_id AND w.organization_id = t.organization_id
    WHERE t.organization_id = ${scope.organizationId}
      AND t.wallet_id = ${target.walletId} AND t.id = ${target.topUpId}
      AND ${anyChildInScopeSql('w', scope.campusScope)}
    UNION ALL
    SELECT gt.id, gt.reference, gt.net_minor::text, TRUE
    FROM gateway_topup gt
    JOIN wallet w ON w.id = gt.wallet_id AND w.organization_id = gt.organization_id
    WHERE gt.organization_id = ${scope.organizationId}
      AND gt.wallet_id = ${target.walletId} AND gt.id = ${target.topUpId}
      AND ${anyChildInScopeSql('w', scope.campusScope)}`.execute(db);
  const [row] = rows;
  if (row === undefined) {
    return undefined;
  }
  return row.online
    ? { kind: 'online' }
    : {
        kind: 'staff',
        id: row.id,
        reference: row.reference,
        amountMinor: Number(row.amount_minor),
      };
}
