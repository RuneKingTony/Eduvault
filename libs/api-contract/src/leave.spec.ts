import { contract } from './contract';
import {
  LEAVE_COVER_MAX,
  LEAVE_END_BEFORE_START_MESSAGE,
  LEAVE_FIRST_DAY_MESSAGE,
  LEAVE_NO_SCHOOL_DAY_MESSAGE,
  LEAVE_OVERLAP_MESSAGE,
  LEAVE_PAST_START_MESSAGE,
  LEAVE_REASON_MAX,
  LEAVE_REASON_MESSAGE,
  createLeaveSchema,
  leaveDtoSchema,
  leaveListQuerySchema,
  leaveTypeSchema,
  myLeaveSchema,
} from './leave';

const id = '0b0c8a8e-8a3e-4c6c-a8c4-0e2f0f6b1f11';

const valid = {
  type: 'annual',
  startsOn: '2026-10-22',
  reason: 'Family wedding',
};

const messagesOf = (input: unknown): string[] => {
  const result = createLeaveSchema.safeParse(input);
  return result.success ? [] : result.error.issues.map((i) => i.message);
};

const dto = {
  id,
  createdBy: 'user-1',
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
};

describe('leave copy', () => {
  it('uses the PRD words', () => {
    expect(LEAVE_OVERLAP_MESSAGE).toBe(
      'You already asked for leave on some of these days.'
    );
    expect(LEAVE_NO_SCHOOL_DAY_MESSAGE).toBe(
      'Those dates are school holidays or a weekend. Choose at least one school day.'
    );
    expect(LEAVE_END_BEFORE_START_MESSAGE).toBe(
      'The last day can’t be before the first day.'
    );
    expect(LEAVE_PAST_START_MESSAGE).toBe(
      'The first day can’t be before today.'
    );
  });
});

describe('createLeaveSchema', () => {
  it('accepts a minimal request and trims the text', () => {
    expect(
      createLeaveSchema.parse({ ...valid, reason: '  Family wedding  ' })
    ).toEqual(valid);
    expect(
      createLeaveSchema.parse({
        ...valid,
        endsOn: '2026-10-22',
        cover: '  Ayo takes JSS 2  ',
      })
    ).toEqual({
      ...valid,
      endsOn: '2026-10-22',
      cover: 'Ayo takes JSS 2',
    });
  });

  it('refuses a last day before the first', () => {
    expect(messagesOf({ ...valid, endsOn: '2026-10-21' })).toEqual([
      LEAVE_END_BEFORE_START_MESSAGE,
    ]);
  });

  it('refuses a blank or missing reason', () => {
    expect(messagesOf({ ...valid, reason: '   ' })).toEqual([
      LEAVE_REASON_MESSAGE,
    ]);
    expect(messagesOf({ type: 'annual', startsOn: valid.startsOn })).toEqual([
      LEAVE_REASON_MESSAGE,
    ]);
  });

  it('allows a reason of 500 characters and refuses 501', () => {
    expect(
      createLeaveSchema.safeParse({
        ...valid,
        reason: 'x'.repeat(LEAVE_REASON_MAX),
      }).success
    ).toBe(true);
    expect(
      createLeaveSchema.safeParse({
        ...valid,
        reason: 'x'.repeat(LEAVE_REASON_MAX + 1),
      }).success
    ).toBe(false);
  });

  it('allows cover of 200 characters and refuses 201', () => {
    expect(
      createLeaveSchema.safeParse({
        ...valid,
        cover: 'x'.repeat(LEAVE_COVER_MAX),
      }).success
    ).toBe(true);
    expect(
      createLeaveSchema.safeParse({
        ...valid,
        cover: 'x'.repeat(LEAVE_COVER_MAX + 1),
      }).success
    ).toBe(false);
  });

  it('asks for a first day and refuses an unknown type', () => {
    expect(messagesOf({ ...valid, startsOn: undefined })).toEqual([
      LEAVE_FIRST_DAY_MESSAGE,
    ]);
    expect(leaveTypeSchema.safeParse('holiday').success).toBe(false);
    expect(createLeaveSchema.safeParse({ ...valid, type: 'x' }).success).toBe(
      false
    );
  });
});

describe('leaveDtoSchema and myLeaveSchema', () => {
  it('parses a leave and refuses an unknown status', () => {
    expect(leaveDtoSchema.parse(dto)).toEqual(dto);
    expect(
      leaveDtoSchema.safeParse({ ...dto, status: 'pending' }).success
    ).toBe(false);
  });

  it('parses the My leave figures with holidays', () => {
    const mine = {
      items: [dto],
      daysTakenThisYear: 2,
      waiting: 1,
      oldestWaitingSentOn: '2026-10-10',
      nextTimeOff: null,
      otherApproverExists: true,
      schoolYearLabel: '2026/2027',
      holidays: [
        {
          kind: 'holiday',
          name: 'Independence Day',
          start: '2026-10-01',
          end: '2026-10-01',
          days: 1,
        },
      ],
    };
    expect(myLeaveSchema.parse(mine)).toEqual(mine);
  });
});

describe('leaveListQuerySchema', () => {
  it('defaults to submitted and accepts all and a user', () => {
    expect(leaveListQuerySchema.parse({})).toEqual({ status: 'submitted' });
    expect(
      leaveListQuerySchema.parse({ status: 'all', userId: 'user-1' })
    ).toEqual({ status: 'all', userId: 'user-1' });
    expect(leaveListQuerySchema.safeParse({ status: 'approved' }).success).toBe(
      false
    );
  });
});

describe('contract.leave', () => {
  it('serves the six routes', () => {
    const paths = Object.values(contract.leave).map(
      (route) => `${route.method} ${route.path}`
    );
    expect(paths).toEqual([
      'GET /me/leave',
      'POST /leave',
      'POST /leave/:id/withdraw',
      'GET /leave',
      'POST /leave/:id/approve',
      'POST /leave/:id/decline',
    ]);
  });
});
