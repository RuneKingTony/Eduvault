import { sql, type RawBuilder } from 'kysely';
import {
  FEES_RECEIVABLE_SYSTEM_KEY,
  STORE_STOCK_SYSTEM_KEY,
} from '@eduvault/api-contract';
import { INACTIVE_AFTER_DAYS } from '@eduvault/shared';
import { shiftDate } from '../date-shift';
import type { Database } from '../../../src/app/common/db/tokens';
import {
  expectedStock,
  expectedStockValueMinor,
  expectedStoreSalesMinor,
} from './check-math';
import {
  exact,
  matcher,
  sameGroups,
  tally,
  type CheckInput,
} from './check-input';
import { DEMO_CAMPUSES } from './config';
import { campusIdOf, dayAt } from './demo-run';
import type { ApprovalState } from './approvals-plan';
import { STORE_ITEMS } from './store-plan';
import { databaseOf } from '../database';

export const isStoreEntry = (
  organizationId: string
): RawBuilder<boolean> => sql`
  (e.kind = 'store' OR e.id IN (
    SELECT p.journal_entry_id FROM payment p
    JOIN store_sale ss ON ss.payment_id = p.id
    WHERE ss.organization_id = ${organizationId}))`;

const database = ({ app }: CheckInput): Database => databaseOf(app);

async function groups(
  input: CheckInput,
  query: RawBuilder<{ key: string; n: number }>
): Promise<Map<string, number>> {
  const { rows } = await query.execute(database(input));
  return new Map(rows.map((row) => [row.key, row.n]));
}

async function scalar(
  input: CheckInput,
  query: RawBuilder<{ n: string }>
): Promise<number> {
  const { rows } = await query.execute(database(input));
  return Number(rows[0]?.n ?? -1);
}

async function storeReceivable(input: CheckInput) {
  const { organizationId } = input;
  const { rows } = await sql<{ debits: string; credits: string }>`
    SELECT COALESCE(SUM(jl.debit_minor), 0)::text AS debits,
           COALESCE(SUM(jl.credit_minor), 0)::text AS credits
    FROM journal_line jl
    JOIN journal_entry e ON e.id = jl.entry_id
    WHERE jl.organization_id = ${organizationId}
      AND jl.ledger_account_id = (
        SELECT la.id FROM ledger_account la
        WHERE la.organization_id = ${organizationId}
          AND la.system_key = ${FEES_RECEIVABLE_SYSTEM_KEY})
      AND ${isStoreEntry(organizationId)}`.execute(database(input));
  return {
    debitsMinor: Number(rows[0]?.debits ?? -1),
    creditsMinor: Number(rows[0]?.credits ?? -1),
  };
}

const campusNames = (input: CheckInput): Map<string, string> =>
  new Map([...input.campusIds].map(([name, id]) => [id, name]));

async function storeStock(input: CheckInput) {
  const { organizationId } = input;
  const [moved, valued] = await Promise.all([
    sql<{ campus_id: string; item_id: string; quantity: number }>`
      SELECT s.campus_id, sm.item_id, SUM(sm.quantity)::int AS quantity
      FROM stock_movement sm JOIN store s ON s.id = sm.store_id
      WHERE sm.organization_id = ${organizationId}
      GROUP BY s.campus_id, sm.item_id`.execute(database(input)),
    sql<{ campus_id: string; value: string }>`
      SELECT jl.campus_id, COALESCE(SUM(jl.debit_minor - jl.credit_minor), 0)::text AS value
      FROM journal_line jl
      WHERE jl.organization_id = ${organizationId}
        AND jl.ledger_account_id = (
          SELECT la.id FROM ledger_account la
          WHERE la.organization_id = ${organizationId}
            AND la.system_key = ${STORE_STOCK_SYSTEM_KEY})
      GROUP BY jl.campus_id`.execute(database(input)),
  ]);
  return { moved: moved.rows, valued: valued.rows };
}

async function stockMatches(input: CheckInput): Promise<string[]> {
  const failures: string[] = [];
  const same = matcher(failures);
  const { moved, valued } = await storeStock(input);
  const names = campusNames(input);
  for (const campus of DEMO_CAMPUSES) {
    const campusId = campusIdOf(input, campus);
    const want = expectedStock(input.plan, campus);
    const got = new Map(
      moved
        .filter((row) => row.campus_id === campusId)
        .map((row) => [row.item_id, row.quantity])
    );
    for (const item of STORE_ITEMS) {
      const quantity = got.get(input.itemIds.get(item.key) ?? '') ?? 0;
      same(`${campus} stock of ${item.key}`, quantity, want.get(item.key) ?? 0);
      if (quantity < 0) {
        failures.push(`${campus} holds negative stock of ${item.key}`);
      }
    }
    same(
      `${campus} stock account`,
      Number(valued.find((row) => row.campus_id === campusId)?.value ?? 0),
      expectedStockValueMinor(input.plan, campus)
    );
  }
  same(
    'stock accounts under unknown campuses',
    valued.filter((row) => !names.has(row.campus_id)).length,
    0
  );
  return failures;
}

async function salesMatch(input: CheckInput): Promise<string[]> {
  const { organizationId, plan } = input;
  const failures: string[] = [];
  const same = matcher(failures);
  const ledger = await storeReceivable(input);
  const want = expectedStoreSalesMinor(plan);
  same('store charges on the receivable', ledger.debitsMinor, want);
  same('store payments on the receivable', ledger.creditsMinor, want);
  same(
    'store sales',
    await scalar(
      input,
      sql`SELECT count(*)::text AS n FROM store_sale WHERE organization_id = ${organizationId}`
    ),
    plan.store.sales.length
  );
  same(
    'store transfers with a proof',
    await scalar(
      input,
      sql`SELECT count(*)::text AS n FROM payment p
          JOIN store_sale ss ON ss.payment_id = p.id
          WHERE ss.organization_id = ${organizationId} AND p.proof_file_id IS NOT NULL`
    ),
    plan.store.sales.filter((sale) => sale.method === 'transfer').length
  );
  return failures;
}

const STATUS_OF: Readonly<Record<ApprovalState, string>> = {
  approved: 'approved',
  pending: 'submitted',
  declined: 'rejected',
};

const statusOf = (row: { state: ApprovalState }): string =>
  STATUS_OF[row.state];

async function groupsMatch(
  input: CheckInput,
  what: string,
  counted: {
    query: RawBuilder<{ key: string; n: number }>;
    want: Map<string, number>;
  }
): Promise<string[]> {
  return sameGroups(what, await groups(input, counted.query), counted.want);
}

async function countsMatch(input: CheckInput): Promise<string[]> {
  const names = campusNames(input);
  const got = await groups(
    input,
    sql`SELECT s.campus_id || '|' || sc.status AS key, count(*)::int AS n
        FROM stock_count sc JOIN store s ON s.id = sc.store_id
        WHERE sc.organization_id = ${input.organizationId}
        GROUP BY 1`
  );
  return sameGroups(
    'stock counts',
    new Map(
      [...got].map(([key, n]) => {
        const [campusId = '', status = ''] = key.split('|');
        return [`${names.get(campusId) ?? campusId}|${status}`, n];
      })
    ),
    tally(
      input.plan.store.counts.map(
        (count) =>
          `${count.campus}|${count.decision === 'waiting' ? 'submitted' : 'approved'}`
      )
    )
  );
}

export async function storeMatches(input: CheckInput): Promise<string[]> {
  return [
    ...(await stockMatches(input)),
    ...(await salesMatch(input)),
    ...(await countsMatch(input)),
  ];
}

export async function approvalsMatch(input: CheckInput): Promise<string[]> {
  const { organizationId, plan } = input;
  const { approvals } = plan;
  return [
    ...(await groupsMatch(input, 'adjustments', {
      query: sql`SELECT kind || '|' || status AS key, count(*)::int AS n
          FROM adjustment WHERE organization_id = ${organizationId} GROUP BY 1`,
      want: tally(
        approvals.adjustments.map((row) => `${row.kind}|${statusOf(row)}`)
      ),
    })),
    ...(await groupsMatch(input, 'discounts', {
      query: sql`SELECT status AS key, count(*)::int AS n
          FROM student_discount WHERE organization_id = ${organizationId} GROUP BY 1`,
      want: tally(approvals.discounts.map((row) => statusOf(row))),
    })),
    ...(await groupsMatch(input, 'payment cancellations', {
      query: sql`SELECT status AS key, count(*)::int AS n
          FROM payment_void WHERE organization_id = ${organizationId} GROUP BY 1`,
      want: tally(approvals.voids.map((row) => statusOf(row))),
    })),
    ...(await groupsMatch(input, 'payments no longer posted', {
      query: sql`SELECT status AS key, count(*)::int AS n FROM payment
          WHERE organization_id = ${organizationId} AND status <> 'posted' GROUP BY 1`,
      want: tally(
        approvals.voids.flatMap((row) =>
          row.state === 'declined'
            ? []
            : [row.state === 'approved' ? 'voided' : 'void_pending']
        )
      ),
    })),
  ];
}

async function announcementsMatch(input: CheckInput): Promise<string[]> {
  const { organizationId, plan } = input;
  return [
    ...(await groupsMatch(input, 'announcements', {
      query: sql`SELECT status AS key, count(*)::int AS n
          FROM announcement WHERE organization_id = ${organizationId} GROUP BY 1`,
      want: tally(plan.announcements.map((row) => row.status)),
    })),
    ...exact(
      'pinned announcements',
      await scalar(
        input,
        sql`SELECT count(*)::text AS n FROM announcement
          WHERE organization_id = ${organizationId} AND pinned AND status = 'published'`
      ),
      plan.announcements.filter((row) => row.pinned).length
    ),
  ];
}

const LEAVE_STATUS: Readonly<Record<string, string>> = {
  approved: 'approved',
  pending: 'submitted',
  declined: 'rejected',
  cancelled: 'cancelled',
  withdrawn: 'withdrawn',
};

const leaveMatches = (input: CheckInput): Promise<string[]> =>
  groupsMatch(input, 'leave requests', {
    query: sql`SELECT CASE WHEN status = 'cancelled' AND cancelled_by IS NULL THEN 'withdrawn' ELSE status END AS key,
                 count(*)::int AS n
          FROM staff_leave WHERE organization_id = ${input.organizationId} GROUP BY 1`,
    want: tally(
      input.plan.leave.map((row) => LEAVE_STATUS[row.outcome] ?? row.outcome)
    ),
  });

async function studentsMatch(input: CheckInput): Promise<string[]> {
  const { organizationId, plan } = input;
  const { studentLife } = plan;
  const cutoff = shiftDate(plan.today, -INACTIVE_AFTER_DAYS);
  const graduatedOn = dayAt(plan, studentLife.graduatedDaysAgo);
  const { rows } = await sql<Record<string, string>>`
    SELECT
      (SELECT count(*) FROM student WHERE organization_id = ${organizationId} AND exit_kind = 'left') AS gone,
      (SELECT count(*) FROM student WHERE organization_id = ${organizationId} AND exit_kind = 'left'
        AND (archived_at AT TIME ZONE 'UTC')::date = last_day) AS gone_on_last_day,
      (SELECT count(*) FROM student WHERE organization_id = ${organizationId} AND exit_kind = 'graduated') AS graduated,
      (SELECT count(*) FROM student WHERE organization_id = ${organizationId} AND exit_kind = 'graduated'
        AND (archived_at AT TIME ZONE 'UTC')::date = ${graduatedOn}::date) AS graduated_on_day,
      (SELECT count(*) FROM student WHERE organization_id = ${organizationId}
        AND exit_kind IS NULL AND not_seen_since IS NOT NULL) AS not_seen,
      (SELECT count(*) FROM student WHERE organization_id = ${organizationId}
        AND exit_kind IS NULL AND not_seen_since <= ${cutoff}::date) AS inactive`.execute(
    database(input)
  );
  const row = rows[0] ?? {};
  const failures: string[] = [];
  const same = matcher(failures);
  const got = (key: string) => Number(row[key] ?? -1);
  same('students who left', got('gone'), studentLife.left.length);
  same(
    'students who left, dated to their last day',
    got('gone_on_last_day'),
    studentLife.left.length
  );
  same('graduated students', got('graduated'), studentLife.graduated.length);
  same(
    'graduated students, dated to the seed day',
    got('graduated_on_day'),
    studentLife.graduated.length
  );
  same(
    'students not seen',
    got('not_seen'),
    studentLife.inactive.length + studentLife.away.length
  );
  same('inactive students', got('inactive'), studentLife.inactive.length);
  return failures;
}

export async function schoolLifeMatches(input: CheckInput): Promise<string[]> {
  return [
    ...(await announcementsMatch(input)),
    ...(await leaveMatches(input)),
    ...(await studentsMatch(input)),
  ];
}
