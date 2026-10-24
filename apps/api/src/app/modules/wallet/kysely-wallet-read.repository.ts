import { sql, type Kysely, type RawBuilder } from 'kysely';
import {
  STUDENT_WALLETS_SYSTEM_KEY,
  journalKindSchema,
  paymentMethodSchema,
  type WalletChild,
  type WalletListQuery,
  type WalletMovement,
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
  anyChildInScopeSql,
  currentCampusSql,
  inScope,
} from '../../common/students';
import type { MovementPage, WalletPage, WalletView } from './wallet.repository';

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

const walletsAccountIdSql = (
  organizationId: string | RawBuilder<unknown>
): RawBuilder<string> => sql<string>`(
  select la.id from ledger_account la
  where la.organization_id = ${organizationId}
    and la.system_key = ${STUDENT_WALLETS_SYSTEM_KEY}
)`;

export async function walletBalance(
  db: Kysely<DB>,
  family: { organizationId: string; guardianId: string }
): Promise<number> {
  const { rows } = await sql<{ balance: string }>`
    SELECT COALESCE(SUM(jl.credit_minor - jl.debit_minor), 0)::text AS balance
    FROM journal_line jl
    WHERE jl.organization_id = ${family.organizationId}
      AND jl.family_id = ${family.guardianId}
      AND jl.ledger_account_id = ${walletsAccountIdSql(family.organizationId)}`.execute(
    db
  );
  return Number(rows[0]?.balance ?? 0);
}

export async function earmarksByChild(
  db: Kysely<DB>,
  wallet: { organizationId: string; walletId: string }
): Promise<Map<string, number>> {
  const { rows } = await sql<{ student_id: string; earmark: string }>`
    SELECT e.student_id, SUM(e.delta_minor)::text AS earmark
    FROM wallet_earmark e
    WHERE e.organization_id = ${wallet.organizationId}
      AND e.wallet_id = ${wallet.walletId}
    GROUP BY e.student_id`.execute(db);
  return new Map(rows.map((row) => [row.student_id, Number(row.earmark)]));
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

async function viewOf(
  db: Kysely<DB>,
  wallet: WalletRow & { organization_id: string },
  scope: OrgScope['campusScope']
): Promise<WalletView> {
  const [rows, balanceMinor, marked] = await Promise.all([
    childRows(db, wallet, scope),
    walletBalance(db, {
      organizationId: wallet.organization_id,
      guardianId: wallet.guardian_id,
    }),
    earmarksByChild(db, {
      organizationId: wallet.organization_id,
      walletId: wallet.id,
    }),
  ]);
  const figures = walletFigures(balanceMinor, [...marked.values()]);
  const children = rows
    .filter(
      (row) =>
        !row.archived || Number(row.owed) !== 0 || Number(row.earmark) !== 0
    )
    .map((row): WalletChild => ({
      studentId: row.student_id,
      name: `${row.first_name} ${row.last_name}`,
      admissionNumber: row.admission_number,
      inScope: row.in_scope,
      owedMinor: Number(row.owed),
      earmarkMinor: Number(row.earmark),
      spendableMinor: childSpendable(
        { owedMinor: Number(row.owed), earmarkMinor: Number(row.earmark) },
        figures.freeMinor
      ),
    }));
  return {
    id: wallet.id,
    guardian: {
      id: wallet.guardian_id,
      name: wallet.full_name,
      phone: wallet.phone,
    },
    ...figures,
    children,
  };
}

const WALLET_COLUMNS = sql`w.id, w.organization_id, w.guardian_id, g.full_name, g.phone`;

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
  return row === undefined ? undefined : viewOf(db, row, scope.campusScope);
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
  return row === undefined ? undefined : viewOf(db, row, 'all');
}

interface SummaryRow {
  id: string;
  guardian_id: string;
  full_name: string;
  phone: string;
  child_count: string;
  balance: string;
  set_aside: string;
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
      ), 0) AS set_aside
    FROM wallet w
    JOIN guardian g ON g.id = w.guardian_id AND g.organization_id = w.organization_id
    WHERE w.organization_id = ${scope.organizationId}
      AND ${anyChildInScopeSql('w', scope.campusScope)}
      AND ${searchSql(query.q)}`;
}

const toSummary = (row: SummaryRow): WalletSummary => {
  const figures = walletFigures(Number(row.balance), [Number(row.set_aside)]);
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
      SELECT id, guardian_id, full_name, phone, child_count::text, balance::text, set_aside::text
      FROM visible
      ORDER BY lower(full_name), id
      LIMIT ${query.pageSize} OFFSET ${offset}`.execute(db),
    sql<{ count: string; balance: string; set_aside: string }>`
      WITH visible AS (${visible})
      SELECT count(*)::text AS count,
        COALESCE(SUM(balance), 0)::text AS balance,
        COALESCE(SUM(set_aside), 0)::text AS set_aside
      FROM visible`.execute(db),
  ]);
  const sums = totals.rows[0];
  const count = Number(sums?.count ?? 0);
  const figures = walletFigures(Number(sums?.balance ?? 0), [
    Number(sums?.set_aside ?? 0),
  ]);
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
  made_by: string | null;
}

function sourceOf(row: MovementRow): WalletMovementSource | null {
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
    };
  }
  return row.spend_id === null ? null : { type: 'spend', id: row.spend_id };
}

const toMovement = (row: MovementRow): WalletMovement => ({
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

export async function walletMovements(
  db: Kysely<DB>,
  wallet: { organizationId: string; guardianId: string },
  paging: { page: number; pageSize: number }
): Promise<MovementPage> {
  const { organizationId, guardianId } = wallet;
  const offset = (paging.page - 1) * paging.pageSize;
  const mine = sql`
    jl.organization_id = ${organizationId}
    AND jl.family_id = ${guardianId}
    AND jl.ledger_account_id = ${walletsAccountIdSql(organizationId)}`;
  const [page, count] = await Promise.all([
    sql<MovementRow>`
      SELECT jl.id AS line_id, e.id AS entry_id,
        to_char(e.effective_on, 'YYYY-MM-DD') AS effective_on,
        e.posted_at, e.kind, e.reference, jl.student_id,
        st.first_name, st.last_name,
        (jl.credit_minor - jl.debit_minor)::text AS amount,
        t.id AS topup_id, t.method, t.depositor_name, t.proof_file_id,
        s.id AS spend_id,
        u.name AS made_by
      FROM journal_line jl
      JOIN journal_entry e ON e.id = jl.entry_id AND e.organization_id = jl.organization_id
      LEFT JOIN student st ON st.id = jl.student_id AND st.organization_id = jl.organization_id
      LEFT JOIN wallet_topup t ON t.journal_entry_id = e.id AND t.organization_id = e.organization_id
      LEFT JOIN wallet_spend s ON s.journal_entry_id = e.id AND s.organization_id = e.organization_id
      LEFT JOIN "user" u ON u.id = COALESCE(t.created_by, s.created_by)
      WHERE ${mine}
      ORDER BY e.sequence DESC, lower(st.first_name), jl.id
      LIMIT ${paging.pageSize} OFFSET ${offset}`.execute(db),
    sql<{ count: string }>`
      SELECT count(*)::text AS count FROM journal_line jl WHERE ${mine}`.execute(
      db
    ),
  ]);
  return {
    items: page.rows.map((row) => toMovement(row)),
    total: Number(count.rows[0]?.count ?? 0),
  };
}

export const walletProofState = (
  db: Kysely<DB>,
  proof: { organizationId: string; userId: string; fileId: string }
): Promise<ProofState> =>
  fileProofState(db, proof, { kind: 'wallet_proof', table: 'wallet_topup' });
