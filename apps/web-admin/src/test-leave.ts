import type {
  DecidedLeaveDto,
  LeaveDto,
  MyLeave,
} from '@eduvault/api-contract';
import { testId } from './test-api';

export const LEAVE_ID = testId(0xf0_01);
export const APPROVED_LEAVE_ID = testId(0xf0_02);
export const DECLINED_LEAVE_ID = testId(0xf0_03);
export const CANCELLED_LEAVE_ID = testId(0xf0_04);

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
  cancelledBy: null,
  cancelledAt: null,
  cancellerName: null,
  cancellationReason: null,
  createdAt: '2026-10-10T08:00:00.000Z',
  isOwn: true,
  ...over,
});

type DecidedOverrides = Partial<Omit<LeaveDto, 'status'>>;

export const approvedLeave = (
  over: DecidedOverrides = {}
): DecidedLeaveDto => ({
  ...leaveDto({
    id: APPROVED_LEAVE_ID,
    approvedBy: 'user-funmi',
    approvedAt: '2026-10-11T09:00:00.000Z',
    deciderName: 'Funmi Adeyemi',
    ...over,
  }),
  status: 'approved',
});

export const declinedLeave = (
  over: DecidedOverrides = {}
): DecidedLeaveDto => ({
  ...leaveDto({
    id: DECLINED_LEAVE_ID,
    rejectedBy: 'user-funmi',
    rejectedAt: '2026-10-11T09:00:00.000Z',
    deciderName: 'Funmi Adeyemi',
    rejectionReason: 'Exams that week',
    ...over,
  }),
  status: 'rejected',
});

export const cancelledLeave = (
  over: DecidedOverrides = {}
): DecidedLeaveDto => ({
  ...approvedLeave({
    id: CANCELLED_LEAVE_ID,
    cancelledBy: 'user-funmi',
    cancelledAt: '2026-10-12T09:00:00.000Z',
    cancellerName: 'Funmi Adeyemi',
    cancellationReason: 'Cover is short',
    ...over,
  }),
  status: 'cancelled',
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
  unseenDecisions: [],
  unseenCount: 0,
  ...over,
});
