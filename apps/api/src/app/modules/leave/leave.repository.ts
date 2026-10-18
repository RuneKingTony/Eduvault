import type { LeaveDto, LeaveListQuery } from '@eduvault/api-contract';
import {
  isDecidedLeaveStatus,
  type DecidedLeaveStatus,
  type LeaveStatus,
  type LeaveType,
} from '@eduvault/shared';
import type { ActivityInput } from '../../common/activity';
import type { CampusScope } from '../../common/campus-scope';

export interface LeaveScope {
  organizationId: string;
  campusScope: CampusScope;
}

export type LeaveEntry = Omit<LeaveDto, 'days'>;
export type DecidedEntry = LeaveEntry & { status: DecidedLeaveStatus };

export function asDecided(entry: LeaveEntry): DecidedEntry {
  const { status } = entry;
  if (!isDecidedLeaveStatus(status)) {
    throw new Error(`Leave ${entry.id} is ${status}, not decided`);
  }
  return { ...entry, status };
}

export interface LockedLeave {
  id: string;
  createdBy: string;
  requesterName: string;
  type: LeaveType;
  startsOn: string;
  endsOn: string;
  status: LeaveStatus;
}

export interface UnseenDecisions {
  items: DecidedEntry[];
  count: number;
}

export interface NewLeave {
  type: LeaveType;
  startsOn: string;
  endsOn: string;
  reason: string;
  cover: string | null;
}

export interface WaitingLeave {
  id: string;
  createdBy: string;
  requesterName: string;
  type: LeaveType;
  startsOn: string;
  endsOn: string;
  reason: string;
  createdAt: string;
  campusId: string | null;
}

export interface LeaveTx {
  hasOverlap(startsOn: string, endsOn: string): Promise<boolean>;
  insert(input: NewLeave): Promise<string>;
  lockOwn(id: string): Promise<LockedLeave | undefined>;
  lockInScope(id: string): Promise<LockedLeave | undefined>;
  withdraw(id: string): Promise<boolean>;
  approve(id: string): Promise<boolean>;
  reject(id: string, reason: string): Promise<boolean>;
  cancel(id: string, reason: string): Promise<boolean>;
  record(input: ActivityInput): Promise<void>;
}

export abstract class LeaveRepository {
  abstract withTx<T>(
    scope: LeaveScope,
    userId: string,
    work: (tx: LeaveTx) => Promise<T>
  ): Promise<T>;

  abstract find(
    organizationId: string,
    viewerId: string,
    id: string
  ): Promise<LeaveEntry | undefined>;

  abstract mine(organizationId: string, userId: string): Promise<LeaveEntry[]>;

  abstract list(
    scope: LeaveScope,
    viewerId: string,
    query: LeaveListQuery
  ): Promise<LeaveEntry[]>;

  abstract otherApproverExists(
    organizationId: string,
    userId: string
  ): Promise<boolean>;

  abstract unseenDecisions(
    organizationId: string,
    userId: string
  ): Promise<UnseenDecisions>;

  abstract markSeen(
    organizationId: string,
    userId: string,
    at: Date
  ): Promise<void>;

  abstract waiting(scope: LeaveScope): Promise<WaitingLeave[]>;
}
