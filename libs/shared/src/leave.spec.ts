import { describe, expect, it } from 'vitest';
import { schoolDays } from './calendar';
import {
  DECIDED_LEAVE_STATUSES,
  LEAVE_DECISION_LABELS,
  LEAVE_STATUS_LABELS,
  LEAVE_STATUSES,
  LEAVE_TYPE_LABELS,
  LEAVE_TYPES,
  daysTakenThisYear,
  leaveDaysText,
  isCancelledByApprover,
  isDecidedLeaveStatus,
  leaveCancelBlock,
  leaveDecisionAt,
  leaveReasonLine,
  leaveSchoolDaysText,
  leaveStatusLabel,
  leaveTypeLower,
  nextTimeOff,
  type LeaveStatus,
} from './leave';

const leave = (
  startsOn: string,
  endsOn: string,
  status: LeaveStatus = 'approved'
) => ({
  status,
  startsOn,
  endsOn,
  days: schoolDays(startsOn, endsOn, []),
});

describe('leave day count', () => {
  it('counts nothing for a weekend', () => {
    expect(schoolDays('2026-10-17', '2026-10-18', [])).toBe(0);
  });

  it('counts a single weekday as one', () => {
    expect(schoolDays('2026-10-22', '2026-10-22', [])).toBe(1);
  });

  it('counts a week with one holiday as four', () => {
    expect(schoolDays('2026-10-12', '2026-10-16', ['2026-10-14'])).toBe(4);
  });

  it('counts nothing when every weekday is a holiday', () => {
    expect(
      schoolDays('2026-10-12', '2026-10-13', ['2026-10-12', '2026-10-13'])
    ).toBe(0);
  });
});

describe('leave copy', () => {
  it('labels every type and status', () => {
    expect(LEAVE_TYPES.map((type) => LEAVE_TYPE_LABELS[type])).toEqual([
      'Annual leave',
      'Sick leave',
      'Personal leave',
      'Study leave',
      'Maternity or paternity leave',
    ]);
    expect(LEAVE_STATUSES.map((status) => LEAVE_STATUS_LABELS[status])).toEqual(
      ['Waiting', 'Approved', 'Declined', 'Withdrawn']
    );
  });

  it('lower-cases a type for a sentence', () => {
    expect(leaveTypeLower('parental')).toBe('maternity or paternity leave');
  });

  it('pluralises days', () => {
    expect(leaveDaysText(1)).toBe('1 day');
    expect(leaveDaysText(2)).toBe('2 days');
    expect(leaveSchoolDaysText(1)).toBe('1 school day');
    expect(leaveSchoolDaysText(0)).toBe('0 school days');
  });
});

describe('daysTakenThisYear', () => {
  it('sums approved leave from the year start only', () => {
    const items = [
      leave('2026-10-12', '2026-10-13'),
      leave('2026-09-01', '2026-09-01'),
      leave('2026-08-31', '2026-08-31'),
      leave('2026-10-19', '2026-10-19', 'submitted'),
      leave('2026-10-20', '2026-10-20', 'rejected'),
      leave('2026-10-21', '2026-10-21', 'cancelled'),
    ];
    expect(daysTakenThisYear(items, '2026-09-01')).toBe(3);
  });

  it('is zero for no leave', () => {
    expect(daysTakenThisYear([], '2026-09-01')).toBe(0);
  });

  it('does not count leave that started before a new year began', () => {
    expect(
      daysTakenThisYear([leave('2026-07-20', '2026-07-24')], '2026-09-07')
    ).toBe(0);
  });
});

describe('nextTimeOff', () => {
  it('picks the earliest approved leave that has not ended', () => {
    const later = leave('2026-11-02', '2026-11-03');
    const sooner = leave('2026-10-20', '2026-10-21');
    expect(nextTimeOff([later, sooner], '2026-10-17')).toBe(sooner);
  });

  it('ignores ended leave and leave that was not approved', () => {
    const ended = leave('2026-10-05', '2026-10-06');
    const waiting = leave('2026-10-20', '2026-10-21', 'submitted');
    expect(nextTimeOff([ended, waiting], '2026-10-17')).toBeNull();
  });

  it('keeps leave that is under way', () => {
    const now = leave('2026-10-15', '2026-10-19');
    expect(nextTimeOff([now], '2026-10-17')).toBe(now);
  });
});

describe('leaveStatusLabel', () => {
  it('calls a cancel by someone else Cancelled and a withdrawal Withdrawn', () => {
    expect(
      leaveStatusLabel({ status: 'cancelled', cancelledBy: 'user-2' })
    ).toBe('Cancelled');
    expect(leaveStatusLabel({ status: 'cancelled', cancelledBy: null })).toBe(
      'Withdrawn'
    );
  });

  it('keeps the other labels', () => {
    expect(leaveStatusLabel({ status: 'submitted', cancelledBy: null })).toBe(
      'Waiting'
    );
    expect(leaveStatusLabel({ status: 'approved', cancelledBy: null })).toBe(
      'Approved'
    );
    expect(leaveStatusLabel({ status: 'rejected', cancelledBy: null })).toBe(
      'Declined'
    );
  });
});

describe('isCancelledByApprover', () => {
  it('tells an approver cancellation from a withdrawal', () => {
    expect(
      isCancelledByApprover({ status: 'cancelled', cancelledBy: 'user-2' })
    ).toBe(true);
    expect(
      isCancelledByApprover({ status: 'cancelled', cancelledBy: null })
    ).toBe(false);
    expect(
      isCancelledByApprover({ status: 'approved', cancelledBy: null })
    ).toBe(false);
  });
});

describe('leaveReasonLine', () => {
  const base = {
    cancelledBy: null,
    deciderName: 'Funmi Adeyemi',
    rejectionReason: null,
    cancellerName: null,
    cancellationReason: null,
  };

  it('says who declined and why', () => {
    expect(
      leaveReasonLine({
        ...base,
        status: 'rejected',
        rejectionReason: 'Exams that week',
      })
    ).toBe('Declined by Funmi Adeyemi: Exams that week');
  });

  it('says who cancelled and why', () => {
    expect(
      leaveReasonLine({
        ...base,
        status: 'cancelled',
        cancelledBy: 'user-2',
        cancellerName: 'Funmi Adeyemi',
        cancellationReason: 'Cover is short',
      })
    ).toBe('Cancelled by Funmi Adeyemi: Cover is short');
  });

  it('has nothing for approved, waiting or withdrawn leave', () => {
    for (const status of ['approved', 'submitted', 'cancelled'] as const) {
      expect(leaveReasonLine({ ...base, status })).toBeNull();
    }
  });
});

describe('decided statuses', () => {
  it('are the three an approver can leave a request in', () => {
    expect(
      LEAVE_STATUSES.filter((status) => isDecidedLeaveStatus(status))
    ).toEqual([...DECIDED_LEAVE_STATUSES]);
    expect(isDecidedLeaveStatus('submitted')).toBe(false);
  });

  it('are labelled the way the badge reads them', () => {
    for (const status of DECIDED_LEAVE_STATUSES) {
      expect(LEAVE_DECISION_LABELS[status]).toBe(
        leaveStatusLabel({ status, cancelledBy: 'user-2' })
      );
    }
  });
});

describe('leaveDecisionAt', () => {
  const times = {
    approvedAt: '2026-10-11T09:00:00.000Z',
    rejectedAt: '2026-10-11T10:00:00.000Z',
    cancelledAt: '2026-10-12T09:00:00.000Z',
  };

  it('reads the time that matches how the request was decided', () => {
    expect(
      leaveDecisionAt({ ...times, status: 'approved', cancelledBy: null })
    ).toBe(times.approvedAt);
    expect(
      leaveDecisionAt({ ...times, status: 'rejected', cancelledBy: null })
    ).toBe(times.rejectedAt);
    expect(
      leaveDecisionAt({ ...times, status: 'cancelled', cancelledBy: 'user-2' })
    ).toBe(times.cancelledAt);
  });

  it('has none for waiting leave or a withdrawal', () => {
    expect(
      leaveDecisionAt({ ...times, status: 'submitted', cancelledBy: null })
    ).toBeNull();
    expect(
      leaveDecisionAt({ ...times, status: 'cancelled', cancelledBy: null })
    ).toBeNull();
  });
});

describe('leaveCancelBlock', () => {
  it('allows approved leave that starts after today', () => {
    expect(
      leaveCancelBlock(
        { status: 'approved', startsOn: '2026-10-13' },
        '2026-10-12'
      )
    ).toBeNull();
  });

  it('blocks leave that is not approved before it asks about the start', () => {
    expect(
      leaveCancelBlock(
        { status: 'submitted', startsOn: '2026-10-01' },
        '2026-10-12'
      )
    ).toBe('notApproved');
  });

  it('blocks approved leave starting today or earlier', () => {
    for (const startsOn of ['2026-10-12', '2026-10-01']) {
      expect(
        leaveCancelBlock({ status: 'approved', startsOn }, '2026-10-12')
      ).toBe('started');
    }
  });
});
