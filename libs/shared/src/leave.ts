import { countOf } from './count-of';

export const LEAVE_TYPES = [
  'annual',
  'sick',
  'personal',
  'study',
  'parental',
] as const;
export type LeaveType = (typeof LEAVE_TYPES)[number];

export const LEAVE_STATUSES = [
  'submitted',
  'approved',
  'rejected',
  'cancelled',
] as const;
export type LeaveStatus = (typeof LEAVE_STATUSES)[number];

export const LEAVE_TYPE_LABELS = {
  annual: 'Annual leave',
  sick: 'Sick leave',
  personal: 'Personal leave',
  study: 'Study leave',
  parental: 'Maternity or paternity leave',
} as const satisfies Record<LeaveType, string>;

export const LEAVE_STATUS_LABELS = {
  submitted: 'Waiting',
  approved: 'Approved',
  rejected: 'Declined',
  cancelled: 'Withdrawn',
} as const satisfies Record<LeaveStatus, string>;

export const DECIDED_LEAVE_STATUSES = [
  'approved',
  'rejected',
  'cancelled',
] as const satisfies readonly LeaveStatus[];
export type DecidedLeaveStatus = (typeof DECIDED_LEAVE_STATUSES)[number];

export const isDecidedLeaveStatus = (
  status: LeaveStatus
): status is DecidedLeaveStatus =>
  (DECIDED_LEAVE_STATUSES as readonly LeaveStatus[]).includes(status);

export const LEAVE_DECISION_LABELS = {
  approved: LEAVE_STATUS_LABELS.approved,
  rejected: LEAVE_STATUS_LABELS.rejected,
  cancelled: 'Cancelled',
} as const satisfies Record<DecidedLeaveStatus, string>;

export interface LeaveOutcome {
  status: LeaveStatus;
  cancelledBy: string | null;
}

export const isCancelledByApprover = (leave: LeaveOutcome): boolean =>
  leave.status === 'cancelled' && leave.cancelledBy !== null;

export const leaveDecisionAt = (
  leave: LeaveOutcome & {
    approvedAt: string | null;
    rejectedAt: string | null;
    cancelledAt: string | null;
  }
): string | null => {
  if (leave.status === 'approved') {
    return leave.approvedAt;
  }
  if (leave.status === 'rejected') {
    return leave.rejectedAt;
  }
  return isCancelledByApprover(leave) ? leave.cancelledAt : null;
};

export type LeaveCancelBlock = 'notApproved' | 'started';

export const leaveCancelBlock = (
  leave: { status: LeaveStatus; startsOn: string },
  today: string
): LeaveCancelBlock | null => {
  if (leave.status !== 'approved') {
    return 'notApproved';
  }
  return leave.startsOn <= today ? 'started' : null;
};

export const leaveStatusLabel = (leave: LeaveOutcome): string =>
  isCancelledByApprover(leave)
    ? LEAVE_DECISION_LABELS.cancelled
    : LEAVE_STATUS_LABELS[leave.status];

export const leaveReasonLine = (
  leave: LeaveOutcome & {
    deciderName: string | null;
    rejectionReason: string | null;
    cancellerName: string | null;
    cancellationReason: string | null;
  }
): string | null => {
  if (leave.status === 'rejected') {
    return `Declined by ${leave.deciderName}: ${leave.rejectionReason}`;
  }
  return isCancelledByApprover(leave)
    ? `Cancelled by ${leave.cancellerName}: ${leave.cancellationReason}`
    : null;
};

export const leaveTypeLower = (type: LeaveType): string =>
  LEAVE_TYPE_LABELS[type].toLowerCase();

export const leaveDaysText = (days: number): string =>
  countOf(days, 'day', 'days');

export const leaveSchoolDaysText = (days: number): string =>
  countOf(days, 'school day', 'school days');

interface LeaveSpan {
  status: LeaveStatus;
  startsOn: string;
  endsOn: string;
  days: number;
}

export function daysTakenThisYear(
  items: readonly Pick<LeaveSpan, 'status' | 'startsOn' | 'days'>[],
  yearStart: string
): number {
  return items
    .filter((item) => item.status === 'approved' && item.startsOn >= yearStart)
    .reduce((total, item) => total + item.days, 0);
}

/** A person's approved leave never overlaps, so the earliest start is the next one. */
export function nextTimeOff<
  T extends Pick<LeaveSpan, 'status' | 'startsOn' | 'endsOn'>,
>(items: readonly T[], today: string): T | null {
  const ahead = items
    .filter((item) => item.status === 'approved' && item.endsOn >= today)
    .toSorted((a, b) => a.startsOn.localeCompare(b.startsOn));
  return ahead[0] ?? null;
}
