import type { LeaveDto, MyLeave } from '@eduvault/api-contract';

const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const LEAVE_ID = id(901);

export const leaveDto = (over: Partial<LeaveDto> = {}): LeaveDto => ({
  id: LEAVE_ID,
  createdBy: 'user-emeka',
  requesterName: 'Emeka Obi',
  type: 'sick',
  startsOn: '2026-10-12',
  endsOn: '2026-10-13',
  days: 2,
  reason: 'Malaria',
  cover: null,
  status: 'submitted',
  approvedBy: null,
  approvedAt: null,
  rejectedBy: null,
  rejectedAt: null,
  deciderName: null,
  rejectionReason: null,
  createdAt: '2026-10-10T08:00:00.000Z',
  isOwn: true,
  ...over,
});

export const approvedLeave = (over: Partial<LeaveDto> = {}): LeaveDto =>
  leaveDto({
    id: id(902),
    status: 'approved',
    approvedBy: 'user-funmi',
    approvedAt: '2026-10-11T09:00:00.000Z',
    deciderName: 'Funmi Adeyemi',
    ...over,
  });

export const declinedLeave = (over: Partial<LeaveDto> = {}): LeaveDto =>
  leaveDto({
    id: id(903),
    status: 'rejected',
    rejectedBy: 'user-funmi',
    rejectedAt: '2026-10-11T09:00:00.000Z',
    deciderName: 'Funmi Adeyemi',
    rejectionReason: 'Exams that week',
    ...over,
  });

export const myLeave = (over: Partial<MyLeave> = {}): MyLeave => ({
  items: [],
  daysTakenThisYear: 0,
  waiting: 0,
  oldestWaitingSentOn: null,
  nextTimeOff: null,
  otherApproverExists: true,
  schoolYearLabel: '2026/2027',
  holidays: [],
  ...over,
});
