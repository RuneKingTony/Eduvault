import { Inject, Injectable } from '@nestjs/common';
import { sql, type Kysely, type RawBuilder } from 'kysely';
import {
  LEAVE_UNSEEN_MAX,
  leaveStatusSchema,
  leaveTypeSchema,
  type LeaveListQuery,
} from '@eduvault/api-contract';
import { holds, resolvePermissions, splitRoles } from '@eduvault/policy';
import type { DB } from '../../../db/db-types';
import { ActivityWriter, type ActivityInput } from '../../common/activity';
import { decisionsFor } from '../../common/approvals';
import { schoolRolePermissions } from '../../common/auth';
import { day, iso, isoOrNull } from '../../common/db/rows';
import { KYSELY_TOKEN, type Database } from '../../common/db/tokens';
import { inScope } from '../../common/students';
import {
  LeaveRepository,
  asDecided,
  type LeaveEntry,
  type LeaveTx,
  type LockedLeave,
  type NewLeave,
  type UnseenDecisions,
  type WaitingLeave,
} from './leave.repository';
import type { OrgScope } from '../../common/scope';

interface EntryRow {
  id: string;
  created_by: string;
  requester_name: string;
  type: string;
  starts_on: string;
  ends_on: string;
  reason: string;
  cover: string | null;
  status: string;
  approved_by: string | null;
  approved_at: Date | null;
  rejected_by: string | null;
  rejected_at: Date | null;
  decider_name: string | null;
  rejection_reason: string | null;
  cancelled_by: string | null;
  cancelled_at: Date | null;
  canceller_name: string | null;
  cancellation_reason: string | null;
  created_at: Date;
}

interface UnseenRow extends EntryRow {
  unseen_total: string;
}

interface LockedRow {
  id: string;
  created_by: string;
  requester_name: string;
  type: string;
  starts_on: string;
  ends_on: string;
  status: string;
}

interface WaitingRow {
  id: string;
  created_by: string;
  requester_name: string;
  type: string;
  starts_on: string;
  ends_on: string;
  reason: string;
  created_at: Date;
  campus_id: string | null;
}

const ENTRY_COLUMNS = sql`
  sl.id, sl.created_by, cu.name AS requester_name, sl.type,
  ${day('sl.starts_on')} AS starts_on, ${day('sl.ends_on')} AS ends_on,
  sl.reason, sl.cover, sl.status, sl.approved_by, sl.approved_at,
  sl.rejected_by, sl.rejected_at, du.name AS decider_name,
  sl.rejection_reason, sl.cancelled_by, sl.cancelled_at,
  xu.name AS canceller_name, sl.cancellation_reason, sl.created_at`;

const ENTRY_JOINS = sql`
  FROM staff_leave sl
  JOIN "user" cu ON cu.id = sl.created_by
  LEFT JOIN "user" du ON du.id = COALESCE(sl.approved_by, sl.rejected_by)
  LEFT JOIN "user" xu ON xu.id = sl.cancelled_by`;

const DECIDED_AT = sql`
  CASE sl.status
    WHEN 'approved' THEN sl.approved_at
    WHEN 'rejected' THEN sl.rejected_at
    WHEN 'cancelled' THEN CASE WHEN sl.cancelled_by IS NOT NULL THEN sl.cancelled_at END
  END`;

const LOCKED_COLUMNS = sql`
  sl.id, sl.created_by, cu.name AS requester_name, sl.type,
  ${day('sl.starts_on')} AS starts_on, ${day('sl.ends_on')} AS ends_on,
  sl.status`;

const requesterInScope = (scope: OrgScope): RawBuilder<boolean> =>
  scope.campusScope === 'all'
    ? sql<boolean>`TRUE`
    : sql<boolean>`EXISTS (
        SELECT 1 FROM "teamMember" tm
        JOIN campus c ON c.team_id = tm."teamId"
          AND c.organization_id = ${scope.organizationId}
        WHERE tm."userId" = sl.created_by
          AND ${inScope(sql`tm."teamId"`, scope.campusScope)}
      )`;

const toEntry = (row: EntryRow, viewerId: string): LeaveEntry => ({
  id: row.id,
  createdBy: row.created_by,
  requesterName: row.requester_name,
  type: leaveTypeSchema.parse(row.type),
  startsOn: row.starts_on,
  endsOn: row.ends_on,
  reason: row.reason,
  cover: row.cover,
  status: leaveStatusSchema.parse(row.status),
  approvedBy: row.approved_by,
  approvedAt: isoOrNull(row.approved_at),
  rejectedBy: row.rejected_by,
  rejectedAt: isoOrNull(row.rejected_at),
  deciderName: row.decider_name,
  rejectionReason: row.rejection_reason,
  cancelledBy: row.cancelled_by,
  cancelledAt: isoOrNull(row.cancelled_at),
  cancellerName: row.canceller_name,
  cancellationReason: row.cancellation_reason,
  createdAt: iso(row.created_at),
  isOwn: row.created_by === viewerId,
});

const toLocked = (row: LockedRow): LockedLeave => ({
  id: row.id,
  createdBy: row.created_by,
  requesterName: row.requester_name,
  type: leaveTypeSchema.parse(row.type),
  startsOn: row.starts_on,
  endsOn: row.ends_on,
  status: leaveStatusSchema.parse(row.status),
});

const toWaiting = (row: WaitingRow): WaitingLeave => ({
  id: row.id,
  createdBy: row.created_by,
  requesterName: row.requester_name,
  type: leaveTypeSchema.parse(row.type),
  startsOn: row.starts_on,
  endsOn: row.ends_on,
  reason: row.reason,
  createdAt: iso(row.created_at),
  campusId: row.campus_id,
});

class KyselyLeaveTx implements LeaveTx {
  private readonly decisions: ReturnType<typeof decisionsFor>;

  constructor(
    private readonly trx: Kysely<DB>,
    private readonly activity: ActivityWriter,
    private readonly who: { scope: OrgScope; userId: string }
  ) {
    this.decisions = decisionsFor(trx, {
      table: 'staff_leave',
      organizationId: who.scope.organizationId,
      userId: who.userId,
    });
  }

  private get organizationId(): string {
    return this.who.scope.organizationId;
  }

  async hasOverlap(startsOn: string, endsOn: string): Promise<boolean> {
    const row = await this.trx
      .selectFrom('staff_leave')
      .select('id')
      .where('organization_id', '=', this.organizationId)
      .where('created_by', '=', this.who.userId)
      .where('status', 'in', ['submitted', 'approved'])
      .where(
        sql<boolean>`daterange(starts_on, ends_on, '[]') && daterange(${startsOn}::date, ${endsOn}::date, '[]')`
      )
      .limit(1)
      .executeTakeFirst();
    return row !== undefined;
  }

  async insert(input: NewLeave): Promise<string> {
    const row = await this.trx
      .insertInto('staff_leave')
      .values({
        organization_id: this.organizationId,
        type: input.type,
        starts_on: input.startsOn,
        ends_on: input.endsOn,
        reason: input.reason,
        cover: input.cover,
        created_by: this.who.userId,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    return row.id;
  }

  async lockOwn(id: string): Promise<LockedLeave | undefined> {
    const { rows } = await sql<LockedRow>`
      SELECT ${LOCKED_COLUMNS}
      FROM staff_leave sl
      JOIN "user" cu ON cu.id = sl.created_by
      WHERE sl.id = ${id} AND sl.organization_id = ${this.organizationId}
        AND sl.created_by = ${this.who.userId}
      FOR UPDATE OF sl`.execute(this.trx);
    return rows[0] && toLocked(rows[0]);
  }

  async lockInScope(id: string): Promise<LockedLeave | undefined> {
    const { rows } = await sql<LockedRow>`
      SELECT ${LOCKED_COLUMNS}
      FROM staff_leave sl
      JOIN "user" cu ON cu.id = sl.created_by
      WHERE sl.id = ${id} AND sl.organization_id = ${this.organizationId}
        AND (sl.created_by = ${this.who.userId} OR ${requesterInScope(this.who.scope)})
      FOR UPDATE OF sl`.execute(this.trx);
    return rows[0] && toLocked(rows[0]);
  }

  async withdraw(id: string): Promise<boolean> {
    const result = await this.trx
      .updateTable('staff_leave')
      .set({
        status: 'cancelled',
        cancelled_at: new Date(),
        updated_at: new Date(),
      })
      .where('id', '=', id)
      .where('organization_id', '=', this.organizationId)
      .where('created_by', '=', this.who.userId)
      .where('status', '=', 'submitted')
      .executeTakeFirst();
    return result.numUpdatedRows > 0n;
  }

  approve(id: string): Promise<boolean> {
    return this.decisions.approve(id);
  }

  reject(id: string, reason: string): Promise<boolean> {
    return this.decisions.reject(id, reason);
  }

  async cancel(id: string, reason: string): Promise<boolean> {
    const now = new Date();
    const result = await this.trx
      .updateTable('staff_leave')
      .set({
        status: 'cancelled',
        cancelled_by: this.who.userId,
        cancelled_at: now,
        cancellation_reason: reason,
        updated_at: now,
      })
      .where('id', '=', id)
      .where('organization_id', '=', this.organizationId)
      .where('status', '=', 'approved')
      .executeTakeFirst();
    return result.numUpdatedRows > 0n;
  }

  record(input: ActivityInput): Promise<void> {
    return this.activity.record(this.trx, input);
  }
}

@Injectable()
export class KyselyLeaveRepository extends LeaveRepository {
  constructor(
    @Inject(KYSELY_TOKEN) private readonly db: Database,
    private readonly activity: ActivityWriter
  ) {
    super();
  }

  withTx<T>(
    scope: OrgScope,
    userId: string,
    work: (tx: LeaveTx) => Promise<T>
  ): Promise<T> {
    return this.db
      .transaction()
      .execute((trx) =>
        work(new KyselyLeaveTx(trx, this.activity, { scope, userId }))
      );
  }

  async find(
    organizationId: string,
    viewerId: string,
    id: string
  ): Promise<LeaveEntry | undefined> {
    const { rows } = await sql<EntryRow>`
      SELECT ${ENTRY_COLUMNS} ${ENTRY_JOINS}
      WHERE sl.id = ${id} AND sl.organization_id = ${organizationId}`.execute(
      this.db
    );
    return rows[0] && toEntry(rows[0], viewerId);
  }

  async mine(organizationId: string, userId: string): Promise<LeaveEntry[]> {
    const { rows } = await sql<EntryRow>`
      SELECT ${ENTRY_COLUMNS} ${ENTRY_JOINS}
      WHERE sl.organization_id = ${organizationId} AND sl.created_by = ${userId}
      ORDER BY sl.starts_on DESC, sl.created_at DESC, sl.id`.execute(this.db);
    return rows.map((row) => toEntry(row, userId));
  }

  async list(
    scope: OrgScope,
    viewerId: string,
    query: LeaveListQuery
  ): Promise<LeaveEntry[]> {
    const status =
      query.status === 'all'
        ? sql<boolean>`TRUE`
        : sql<boolean>`sl.status = 'submitted'`;
    const requester =
      query.userId === undefined
        ? sql<boolean>`TRUE`
        : sql<boolean>`sl.created_by = ${query.userId}`;
    const { rows } = await sql<EntryRow>`
      SELECT ${ENTRY_COLUMNS} ${ENTRY_JOINS}
      WHERE sl.organization_id = ${scope.organizationId}
        AND ${requesterInScope(scope)} AND ${status} AND ${requester}
      ORDER BY sl.starts_on DESC, sl.created_at DESC, sl.id`.execute(this.db);
    return rows.map((row) => toEntry(row, viewerId));
  }

  async unseenDecisions(
    organizationId: string,
    userId: string
  ): Promise<UnseenDecisions> {
    const { rows } = await sql<UnseenRow>`
      SELECT ${ENTRY_COLUMNS}, COUNT(*) OVER () AS unseen_total ${ENTRY_JOINS}
      LEFT JOIN staff_leave_seen sv
        ON sv.organization_id = sl.organization_id AND sv.user_id = sl.created_by
      WHERE sl.organization_id = ${organizationId} AND sl.created_by = ${userId}
        AND ${DECIDED_AT} > COALESCE(sv.seen_at, '-infinity'::timestamptz)
      ORDER BY ${DECIDED_AT} DESC, sl.id
      LIMIT ${LEAVE_UNSEEN_MAX}`.execute(this.db);
    return {
      items: rows.map((row) => asDecided(toEntry(row, userId))),
      count: Number(rows[0]?.unseen_total ?? 0),
    };
  }

  async markSeen(
    organizationId: string,
    userId: string,
    at: Date
  ): Promise<void> {
    await this.db
      .insertInto('staff_leave_seen')
      .values({ organization_id: organizationId, user_id: userId, seen_at: at })
      .onConflict((conflict) =>
        conflict.columns(['organization_id', 'user_id']).doUpdateSet({
          seen_at: sql<Date>`GREATEST(staff_leave_seen.seen_at, ${at})`,
        })
      )
      .execute();
  }

  async otherApproverExists(
    organizationId: string,
    userId: string
  ): Promise<boolean> {
    const [members, custom] = await Promise.all([
      this.db
        .selectFrom('member')
        .select('role')
        .where('organizationId', '=', organizationId)
        .where('userId', '<>', userId)
        .execute(),
      schoolRolePermissions(this.db, organizationId),
    ]);
    return members.some((member) =>
      holds(
        resolvePermissions(splitRoles(member.role), custom),
        'leave:approve'
      )
    );
  }

  async waiting(scope: OrgScope): Promise<WaitingLeave[]> {
    const { rows } = await sql<WaitingRow>`
      SELECT sl.id, sl.created_by, cu.name AS requester_name, sl.type,
        ${day('sl.starts_on')} AS starts_on, ${day('sl.ends_on')} AS ends_on,
        sl.reason, sl.created_at,
        (
          SELECT tm."teamId" FROM "teamMember" tm
          JOIN campus c ON c.team_id = tm."teamId"
            AND c.organization_id = sl.organization_id
          JOIN team t ON t.id = tm."teamId"
          WHERE tm."userId" = sl.created_by
            AND ${inScope(sql`tm."teamId"`, scope.campusScope)}
          ORDER BY t.name, t.id
          LIMIT 1
        ) AS campus_id
      FROM staff_leave sl
      JOIN "user" cu ON cu.id = sl.created_by
      WHERE sl.organization_id = ${scope.organizationId}
        AND sl.status = 'submitted' AND ${requesterInScope(scope)}
      ORDER BY sl.created_at, sl.id`.execute(this.db);
    return rows.map((row) => toWaiting(row));
  }
}
