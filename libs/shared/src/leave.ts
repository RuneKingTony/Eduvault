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
