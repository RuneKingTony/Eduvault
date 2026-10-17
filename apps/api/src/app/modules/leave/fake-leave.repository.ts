import type { LeaveListQuery } from '@eduvault/api-contract';
import type { LeaveStatus, LeaveType } from '@eduvault/shared';
import type { ActivityInput } from '../../common/activity';
import { canSeeCampus } from '../../common/campus-scope';
import {
  LeaveRepository,
  type LeaveEntry,
  type LeaveScope,
  type LeaveTx,
  type LockedLeave,
  type NewLeave,
  type WaitingLeave,
} from './leave.repository';

interface StoredLeave {
  id: string;
  createdBy: string;
  type: LeaveType;
  startsOn: string;
  endsOn: string;
  reason: string;
  cover: string | null;
  status: LeaveStatus;
  deciderId: string | null;
  rejectionReason: string | null;
  createdAt: string;
}

class FakeLeaveTx implements LeaveTx {
  constructor(
    private readonly store: FakeLeaveRepository,
    private readonly scope: LeaveScope,
    private readonly userId: string
  ) {}

  hasOverlap(startsOn: string, endsOn: string): Promise<boolean> {
    return Promise.resolve(
      this.store.rows.some(
        (row) =>
          row.createdBy === this.userId &&
          ['submitted', 'approved'].includes(row.status) &&
          row.startsOn <= endsOn &&
          row.endsOn >= startsOn
      )
    );
  }

  insert(input: NewLeave): Promise<string> {
    return Promise.resolve(
      this.store.seed({ createdBy: this.userId, ...input }).id
    );
  }

  lockOwn(id: string): Promise<LockedLeave | undefined> {
    const row = this.store.rows.find(
      (candidate) => candidate.id === id && candidate.createdBy === this.userId
    );
    return Promise.resolve(row && this.store.locked(row));
  }

  lockInScope(id: string): Promise<LockedLeave | undefined> {
    const row = this.store.rows.find(
      (candidate) =>
        candidate.id === id && this.store.inScope(this.scope, candidate)
    );
    return Promise.resolve(row && this.store.locked(row));
  }

  withdraw(id: string): Promise<boolean> {
    return this.store.transition(id, {
      status: 'cancelled',
      userId: this.userId,
    });
  }

  approve(id: string): Promise<boolean> {
    return this.store.transition(id, {
      status: 'approved',
      userId: this.userId,
    });
  }

  reject(id: string, reason: string): Promise<boolean> {
    return this.store.transition(id, {
      status: 'rejected',
      userId: this.userId,
      reason,
    });
  }

  record(input: ActivityInput): Promise<void> {
    this.store.events.push(input);
    return Promise.resolve();
  }
}

export class FakeLeaveRepository extends LeaveRepository {
  readonly rows: StoredLeave[] = [];
  readonly events: ActivityInput[] = [];
  readonly names = new Map<string, string>();
  readonly campuses = new Map<string, string[]>();
  readonly approvers = new Set<string>();
  private sequence = 0;

  seed(
    row: Partial<StoredLeave> & Pick<StoredLeave, 'createdBy' | 'startsOn'>
  ): StoredLeave {
    this.sequence += 1;
    const stored: StoredLeave = {
      id: `leave-${this.sequence}`,
      type: 'annual',
      endsOn: row.startsOn,
      reason: 'Family',
      cover: null,
      status: 'submitted',
      deciderId: null,
      rejectionReason: null,
      createdAt: `2026-10-0${this.sequence}T08:00:00.000Z`,
      ...row,
    };
    this.rows.push(stored);
    return stored;
  }

  nameOf(userId: string): string {
    return this.names.get(userId) ?? userId;
  }

  inScope(scope: LeaveScope, row: StoredLeave): boolean {
    return (
      scope.campusScope === 'all' ||
      (this.campuses.get(row.createdBy) ?? []).some((campus) =>
        canSeeCampus(scope.campusScope, campus)
      )
    );
  }

  toEntry(row: StoredLeave, viewerId: string): LeaveEntry {
    const decided = row.deciderId !== null;
    return {
      id: row.id,
      createdBy: row.createdBy,
      requesterName: this.nameOf(row.createdBy),
      type: row.type,
      startsOn: row.startsOn,
      endsOn: row.endsOn,
      reason: row.reason,
      cover: row.cover,
      status: row.status,
      approvedBy: row.status === 'approved' ? row.deciderId : null,
      approvedAt: row.status === 'approved' ? row.createdAt : null,
      rejectedBy: row.status === 'rejected' ? row.deciderId : null,
      rejectedAt: row.status === 'rejected' ? row.createdAt : null,
      deciderName: decided ? this.nameOf(row.deciderId ?? '') : null,
      rejectionReason: row.rejectionReason,
      createdAt: row.createdAt,
      isOwn: row.createdBy === viewerId,
    };
  }

  locked(row: StoredLeave): LockedLeave {
    return {
      id: row.id,
      createdBy: row.createdBy,
      requesterName: this.nameOf(row.createdBy),
      type: row.type,
      startsOn: row.startsOn,
      endsOn: row.endsOn,
      status: row.status,
    };
  }

  withTx<T>(
    scope: LeaveScope,
    userId: string,
    work: (tx: LeaveTx) => Promise<T>
  ): Promise<T> {
    return work(new FakeLeaveTx(this, scope, userId));
  }

  transition(
    id: string,
    change: { status: LeaveStatus; userId: string; reason?: string }
  ): Promise<boolean> {
    const row = this.rows.find((candidate) => candidate.id === id);
    if (row?.status !== 'submitted') {
      return Promise.resolve(false);
    }
    row.status = change.status;
    row.deciderId = change.status === 'cancelled' ? null : change.userId;
    row.rejectionReason = change.reason ?? null;
    return Promise.resolve(true);
  }

  find(
    _organizationId: string,
    viewerId: string,
    id: string
  ): Promise<LeaveEntry | undefined> {
    const row = this.rows.find((candidate) => candidate.id === id);
    return Promise.resolve(row && this.toEntry(row, viewerId));
  }

  mine(_organizationId: string, userId: string): Promise<LeaveEntry[]> {
    return Promise.resolve(
      this.rows
        .filter((row) => row.createdBy === userId)
        .toSorted((a, b) => b.startsOn.localeCompare(a.startsOn))
        .map((row) => this.toEntry(row, userId))
    );
  }

  list(
    scope: LeaveScope,
    viewerId: string,
    query: LeaveListQuery
  ): Promise<LeaveEntry[]> {
    return Promise.resolve(
      this.rows
        .filter(
          (row) =>
            this.inScope(scope, row) &&
            (query.status === 'all' || row.status === 'submitted') &&
            (query.userId === undefined || row.createdBy === query.userId)
        )
        .map((row) => this.toEntry(row, viewerId))
    );
  }

  otherApproverExists(
    _organizationId: string,
    userId: string
  ): Promise<boolean> {
    return Promise.resolve(
      [...this.approvers].some((approver) => approver !== userId)
    );
  }

  waiting(scope: LeaveScope): Promise<WaitingLeave[]> {
    return Promise.resolve(
      this.rows
        .filter((row) => row.status === 'submitted' && this.inScope(scope, row))
        .map((row) => ({
          id: row.id,
          createdBy: row.createdBy,
          requesterName: this.nameOf(row.createdBy),
          type: row.type,
          startsOn: row.startsOn,
          endsOn: row.endsOn,
          reason: row.reason,
          createdAt: row.createdAt,
          campusId: this.campuses.get(row.createdBy)?.[0] ?? null,
        }))
    );
  }
}
