import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  LEAVE_NO_SCHOOL_DAY_MESSAGE,
  LEAVE_OVERLAP_MESSAGE,
  LEAVE_PAST_START_MESSAGE,
  type CreateLeaveInput,
} from '@eduvault/api-contract';
import type { OrgContext } from '../../common/auth';
import { Clock } from '../../common/clock';
import type { CalendarService } from '../calendar/calendar.service';
import { FakeLeaveRepository } from './fake-leave.repository';
import { LeaveApprovalProvider } from './leave-approval.provider';
import { LeaveService } from './leave.service';

const TODAY = '2026-10-12';
const LEKKI = 'campus-lekki';
const IKEJA = 'campus-ikeja';

const ctxFor = (
  userId: string,
  campusScope: OrgContext['campusScope'] = 'all',
  acting: OrgContext['acting'] = null
): OrgContext =>
  ({
    organizationId: 'school-a',
    user: { id: userId, name: `Name ${userId}` },
    campusScope,
    acting,
  }) as unknown as OrgContext;

function setup(holidays: string[] = []) {
  const repository = new FakeLeaveRepository();
  repository.names.set('emeka', 'Emeka Obi');
  repository.names.set('grace', 'Grace Nwosu');
  repository.campuses.set('emeka', [LEKKI]);
  repository.campuses.set('ayo', [IKEJA]);
  repository.campuses.set('grace', [LEKKI]);
  const calendar = {
    holidayDates: () => Promise.resolve(holidays),
    current: () =>
      Promise.resolve({
        term: null,
        schoolYear: {
          id: 'year',
          name: '2026/2027',
          startsOn: '2026-09-07',
          endsOn: '2027-07-23',
        },
        schoolDays: 0,
        schoolDaysSoFar: 0,
      }),
    daysOff: () => Promise.resolve([]),
  } as unknown as CalendarService;
  const clock = new Clock();
  clock.set(TODAY);
  return {
    repository,
    calendar,
    service: new LeaveService(repository, calendar, clock),
  };
}

const request = (over: Partial<CreateLeaveInput> = {}): CreateLeaveInput => ({
  type: 'annual',
  startsOn: '2026-10-22',
  reason: 'Family wedding',
  ...over,
});

const refusal = (promise: Promise<unknown>): Promise<unknown> =>
  promise.then(
    () => null,
    (error: unknown) => error
  );

describe('LeaveService.create', () => {
  it('refuses a first day before today', async () => {
    const { service } = setup();
    const error = await refusal(
      service.create(ctxFor('emeka'), request({ startsOn: '2026-10-09' }))
    );
    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).message).toBe(
      LEAVE_PAST_START_MESSAGE
    );
  });

  it('accepts today and defaults the last day to the first', async () => {
    const { service, repository } = setup();
    const leave = await service.create(
      ctxFor('emeka'),
      request({ startsOn: TODAY })
    );
    expect(leave).toMatchObject({
      startsOn: TODAY,
      endsOn: TODAY,
      days: 1,
      status: 'submitted',
      isOwn: true,
    });
    expect(repository.rows).toHaveLength(1);
  });

  it('refuses a weekend and a run of school holidays', async () => {
    const { service } = setup(['2026-10-14', '2026-10-15']);
    for (const dates of [
      { startsOn: '2026-10-17', endsOn: '2026-10-18' },
      { startsOn: '2026-10-14', endsOn: '2026-10-15' },
    ]) {
      const error = await refusal(
        service.create(ctxFor('emeka'), request(dates))
      );
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).message).toBe(
        LEAVE_NO_SCHOOL_DAY_MESSAGE
      );
    }
  });

  it('counts a week with one holiday as four days', async () => {
    const { service } = setup(['2026-10-21']);
    const leave = await service.create(
      ctxFor('emeka'),
      request({ startsOn: '2026-10-19', endsOn: '2026-10-23' })
    );
    expect(leave.days).toBe(4);
  });

  it('refuses dates that overlap the requester’s own waiting or approved leave', async () => {
    const { service, repository } = setup();
    repository.seed({
      createdBy: 'emeka',
      startsOn: '2026-10-22',
      endsOn: '2026-10-22',
    });
    const error = await refusal(
      service.create(
        ctxFor('emeka'),
        request({ startsOn: '2026-10-21', endsOn: '2026-10-23' })
      )
    );
    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).message).toBe(LEAVE_OVERLAP_MESSAGE);
    expect(repository.rows).toHaveLength(1);
  });

  it('does not count declined or withdrawn leave as an overlap', async () => {
    const { service, repository } = setup();
    repository.seed({
      createdBy: 'emeka',
      startsOn: '2026-10-22',
      status: 'rejected',
    });
    repository.seed({
      createdBy: 'emeka',
      startsOn: '2026-10-22',
      status: 'cancelled',
    });
    await expect(
      service.create(ctxFor('emeka'), request())
    ).resolves.toMatchObject({ status: 'submitted' });
  });

  it('writes the activity sentence in the same transaction with no campus', async () => {
    const { service, repository } = setup();
    await service.create(
      ctxFor('emeka'),
      request({ type: 'sick', startsOn: '2026-10-22', endsOn: '2026-10-23' })
    );
    expect(repository.events).toHaveLength(1);
    expect(repository.events[0]).toMatchObject({
      organizationId: 'school-a',
      campusId: null,
      subjectType: 'staff_leave',
      text: 'Name emeka asked for sick leave: 22 Oct 2026 – 23 Oct 2026.',
    });
  });

  it('stores an empty cover as none', async () => {
    const { service } = setup();
    const leave = await service.create(ctxFor('emeka'), request({ cover: '' }));
    expect(leave.cover).toBeNull();
  });

  it('refuses a super admin acting in the school', async () => {
    const { service } = setup();
    const acting = { organizationId: 'school-a', writes: true, reason: 'x' };
    await expect(
      service.create(ctxFor('root', 'all', acting), request())
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('LeaveService.withdraw', () => {
  it('moves a waiting request to withdrawn', async () => {
    const { service, repository } = setup();
    const row = repository.seed({ createdBy: 'emeka', startsOn: '2026-10-22' });
    const leave = await service.withdraw(ctxFor('emeka'), row.id);
    expect(leave.status).toBe('cancelled');
  });

  it('answers 404 to anyone but the requester', async () => {
    const { service, repository } = setup();
    const row = repository.seed({ createdBy: 'emeka', startsOn: '2026-10-22' });
    await expect(
      service.withdraw(ctxFor('chika'), row.id)
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('answers 409 the second time', async () => {
    const { service, repository } = setup();
    const row = repository.seed({ createdBy: 'emeka', startsOn: '2026-10-22' });
    await service.withdraw(ctxFor('emeka'), row.id);
    await expect(
      service.withdraw(ctxFor('emeka'), row.id)
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('LeaveService.approve and decline', () => {
  it('approves in scope, names the decider and writes the sentence', async () => {
    const { service, repository } = setup();
    const row = repository.seed({
      createdBy: 'emeka',
      type: 'sick',
      startsOn: '2026-10-12',
      endsOn: '2026-10-13',
    });
    const leave = await service.approve(ctxFor('grace', [LEKKI]), row.id);
    expect(leave).toMatchObject({
      status: 'approved',
      approvedBy: 'grace',
      deciderName: 'Grace Nwosu',
      days: 2,
    });
    expect(repository.events.at(-1)?.text).toBe(
      'Emeka Obi’s sick leave (12 Oct 2026 – 13 Oct 2026) was approved.'
    );
  });

  it('answers 409 when the requester approves their own request', async () => {
    const { service, repository } = setup();
    const row = repository.seed({ createdBy: 'grace', startsOn: '2026-10-22' });
    await expect(
      service.approve(ctxFor('grace'), row.id)
    ).rejects.toMatchObject({
      response: { code: 'SelfApproval' },
    });
    await expect(
      service.decline(ctxFor('grace'), row.id, 'No')
    ).rejects.toMatchObject({ response: { code: 'SelfApproval' } });
    expect(repository.rows[0]?.status).toBe('submitted');
  });

  it('answers 409 when it has been decided already', async () => {
    const { service, repository } = setup();
    const row = repository.seed({ createdBy: 'emeka', startsOn: '2026-10-22' });
    await service.approve(ctxFor('grace'), row.id);
    await expect(
      service.approve(ctxFor('grace'), row.id)
    ).rejects.toMatchObject({ response: { code: 'AlreadyDecided' } });
  });

  it('answers 404 outside the approver’s campuses', async () => {
    const { service, repository } = setup();
    const row = repository.seed({ createdBy: 'ayo', startsOn: '2026-10-22' });
    await expect(
      service.approve(ctxFor('grace', [LEKKI]), row.id)
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.decline(ctxFor('grace', [LEKKI]), row.id, 'No')
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('refuses a decline without a reason', async () => {
    const { service, repository } = setup();
    const row = repository.seed({ createdBy: 'emeka', startsOn: '2026-10-22' });
    await expect(
      service.decline(ctxFor('grace'), row.id, '   ')
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.rows[0]?.status).toBe('submitted');
  });

  it('declines with the reason the requester will see', async () => {
    const { service, repository } = setup();
    const row = repository.seed({ createdBy: 'emeka', startsOn: '2026-10-22' });
    const leave = await service.decline(
      ctxFor('grace'),
      row.id,
      '  Exams that week  '
    );
    expect(leave).toMatchObject({
      status: 'rejected',
      rejectionReason: 'Exams that week',
      rejectedBy: 'grace',
    });
    expect(repository.events.at(-1)?.text).toBe(
      'A request was declined: Exams that week'
    );
  });
});

describe('LeaveService.list', () => {
  it('lists waiting requests in scope, own included and flagged', async () => {
    const { service, repository } = setup();
    repository.seed({ createdBy: 'emeka', startsOn: '2026-10-22' });
    repository.seed({ createdBy: 'grace', startsOn: '2026-10-23' });
    repository.seed({ createdBy: 'ayo', startsOn: '2026-10-26' });
    const rows = await service.list(ctxFor('grace', [LEKKI]), {
      status: 'submitted',
    });
    expect(rows.map((row) => [row.createdBy, row.isOwn])).toEqual([
      ['emeka', false],
      ['grace', true],
    ]);
  });

  it('filters one member and all statuses for the member page', async () => {
    const { service, repository } = setup();
    repository.seed({
      createdBy: 'emeka',
      startsOn: '2026-10-22',
      status: 'approved',
    });
    repository.seed({ createdBy: 'ayo', startsOn: '2026-10-26' });
    const rows = await service.list(ctxFor('grace'), {
      status: 'all',
      userId: 'emeka',
    });
    expect(rows.map((row) => row.status)).toEqual(['approved']);
  });
});

describe('LeaveService.mine', () => {
  it('reports the figures, latest first', async () => {
    const { service, repository } = setup();
    repository.seed({
      createdBy: 'emeka',
      startsOn: '2026-10-12',
      endsOn: '2026-10-13',
      status: 'approved',
    });
    repository.seed({
      createdBy: 'emeka',
      startsOn: '2026-10-22',
      createdAt: '2026-10-10T08:00:00.000Z',
    });
    repository.approvers.add('grace');
    const mine = await service.mine(ctxFor('emeka'));
    expect(mine.items.map((item) => item.startsOn)).toEqual([
      '2026-10-22',
      '2026-10-12',
    ]);
    expect(mine).toMatchObject({
      daysTakenThisYear: 2,
      waiting: 1,
      oldestWaitingSentOn: '2026-10-10',
      schoolYearLabel: '2026/2027',
      otherApproverExists: true,
    });
    expect(mine.nextTimeOff?.startsOn).toBe('2026-10-12');
  });

  it('says nobody else can approve when the requester is the only approver', async () => {
    const { service, repository } = setup();
    repository.approvers.add('emeka');
    expect((await service.mine(ctxFor('emeka'))).otherApproverExists).toBe(
      false
    );
    repository.approvers.add('grace');
    expect((await service.mine(ctxFor('emeka'))).otherApproverExists).toBe(
      true
    );
  });

  it('is empty for someone with no leave', async () => {
    const { service } = setup();
    expect(await service.mine(ctxFor('emeka'))).toMatchObject({
      items: [],
      daysTakenThisYear: 0,
      waiting: 0,
      oldestWaitingSentOn: null,
      nextTimeOff: null,
    });
  });
});

describe('LeaveApprovalProvider', () => {
  it('turns waiting leave into queue rows with details, days and the first campus', async () => {
    const { repository, calendar } = setup();
    repository.seed({
      createdBy: 'emeka',
      type: 'sick',
      startsOn: '2026-10-12',
      endsOn: '2026-10-13',
      reason: 'Malaria',
    });
    repository.seed({
      createdBy: 'emeka',
      startsOn: '2026-10-22',
      status: 'approved',
    });
    const provider = new LeaveApprovalProvider(repository, calendar);
    const rows = await provider.waiting({
      organizationId: 'school-a',
      campusScope: 'all',
    });
    expect(rows).toEqual([
      {
        kind: 'leave',
        id: 'leave-1',
        details: 'Emeka Obi · Sick leave · 12 Oct 2026 – 13 Oct 2026. Malaria',
        amountMinor: null,
        amountText: '2 days',
        createdById: 'emeka',
        createdByName: 'Emeka Obi',
        createdAt: '2026-10-01T08:00:00.000Z',
        campusId: LEKKI,
      },
    ]);
  });
});
