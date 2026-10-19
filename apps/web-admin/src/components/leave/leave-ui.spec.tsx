import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import {
  ApiError,
  type CreateLeaveInput,
  type LeaveDto,
} from '@eduvault/api-contract';
import { toPermissionMap } from '@eduvault/policy';
import { toast } from '@eduvault/ui';
import {
  approvedLeave,
  cancelledLeave,
  declinedLeave,
  leaveDto,
  myLeave,
} from '../../test-leave';
import { testId } from '../../test-api';
import { fakeAccess, ownerAccess, renderWithApi } from '../../test-utils';
import { CancelLeaveDialog } from './cancel-leave-dialog';
import { LeaveOnlyApprovalsPage } from './leave-only-approvals-page';
import { MemberLeaveCard } from './member-leave-card';
import { MyLeaveCard } from './my-leave-card';
import { RequestLeaveDialog } from './request-leave-dialog';

vi.mock('@eduvault/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@eduvault/ui')>()),
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

const TODAY = '2026-10-12';

const LEAVE_IDS = Array.from({ length: 7 }, (_, index) =>
  testId(0x2_10_01 + index)
);
const [
  STARTED_TODAY,
  STARTED_EARLIER,
  WAITING,
  DECLINED,
  WITHDRAWN,
  CANCELLED,
  OWN,
] = LEAVE_IDS as [string, string, string, string, string, string, string];

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(`${TODAY}T09:00:00Z`));
});

afterEach(() => {
  vi.useRealTimers();
});

function cardApi(mine = myLeave()) {
  return {
    leave: {
      me: vi.fn().mockResolvedValue(mine),
      withdraw: vi.fn(({ params }: { params: { id: string } }) =>
        leaveDto({ id: params.id, status: 'cancelled' })
      ),
      create: vi.fn(({ body }: { body: CreateLeaveInput }) =>
        leaveDto({
          type: body.type,
          startsOn: body.startsOn,
          endsOn: body.endsOn ?? body.startsOn,
          reason: body.reason,
          cover: body.cover ?? null,
        })
      ),
      seen: vi.fn().mockResolvedValue({ seenAt: '2026-10-12T09:00:00.000Z' }),
      cancel: vi.fn(
        ({
          params,
          body,
        }: {
          params: { id: string };
          body: { reason: string };
        }) => cancelledLeave({ id: params.id, cancellationReason: body.reason })
      ),
    },
  };
}

const LEAVE_INVALIDATIONS = [['leave'], ['approvals'], ['dashboard', 'tasks']];

const invalidatedKeys = (spy: { mock: { calls: unknown[][] } }): unknown[] =>
  spy.mock.calls.map(
    ([filters]) => (filters as { queryKey: unknown }).queryKey
  );

const listed = myLeave({
  items: [
    leaveDto({ startsOn: '2026-10-20', endsOn: '2026-10-20', days: 1 }),
    approvedLeave({ startsOn: '2026-10-12', endsOn: '2026-10-13' }),
    declinedLeave({ startsOn: '2026-09-14', endsOn: '2026-09-14', days: 1 }),
  ],
  daysTakenThisYear: 2,
  waiting: 1,
});

describe('MyLeaveCard', () => {
  it('is for every staff member: figures, the requests latest first and a decision line each', async () => {
    renderWithApi(<MyLeaveCard canWrite />, cardApi(listed));

    expect(await screen.findByText('My leave')).toBeVisible();
    expect(
      await screen.findByText(
        '2 days taken this year · 1 waiting for a decision · 3 requests in total'
      )
    ).toBeVisible();
    const rows = screen.getAllByRole('listitem');
    expect(rows).toHaveLength(3);
    expect(within(rows[0]!).getByText('Waiting')).toBeVisible();
    expect(within(rows[1]!).getByText('Approved')).toBeVisible();
    expect(within(rows[2]!).getByText('Declined')).toBeVisible();
    expect(
      screen.getByText('Approved by Funmi Adeyemi on 11 Oct 2026')
    ).toBeVisible();
    expect(
      screen.getByText('Declined by Funmi Adeyemi: Exams that week')
    ).toBeVisible();
    expect(
      screen.getByText('12 Oct 2026 – 13 Oct 2026 · 2 school days')
    ).toBeVisible();
    expect(screen.getByText('20 Oct 2026 · 1 school day')).toBeVisible();
  });

  it('offers Withdraw on a waiting request only, then toasts', async () => {
    const api = cardApi(listed);
    renderWithApi(<MyLeaveCard canWrite />, api);

    const buttons = await screen.findAllByRole('button', { name: 'Withdraw' });
    expect(buttons).toHaveLength(1);
    fireEvent.click(buttons[0]!);

    await waitFor(() => {
      expect(api.leave.withdraw).toHaveBeenCalledWith({
        params: { id: leaveDto().id },
      });
    });
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Request withdrawn.');
    });
  });

  it('hides Request leave and Withdraw when the viewer cannot write', async () => {
    renderWithApi(<MyLeaveCard canWrite={false} />, cardApi(listed));
    await screen.findByText('Approved');
    expect(screen.queryByRole('button', { name: 'Request leave' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Withdraw' })).toBeNull();
  });

  it('says so when nobody else can approve leave, and still accepts requests', async () => {
    renderWithApi(
      <MyLeaveCard canWrite />,
      cardApi(myLeave({ otherApproverExists: false }))
    );
    expect(
      await screen.findByText(
        'Nobody else can approve leave yet. Ask the owner to give someone leave approval.'
      )
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Request leave' })).toBeVisible();
  });

  it('shows the empty state with no leave', async () => {
    renderWithApi(<MyLeaveCard canWrite />, cardApi());
    expect(await screen.findByText('No leave requests yet')).toBeVisible();
    expect(
      screen.getByText(
        'Ask for time off here. Someone with leave approval decides.'
      )
    ).toBeVisible();
    expect(screen.queryByText(/Nobody else can approve leave yet/)).toBeNull();
  });
});

describe('LeaveOnlyApprovalsPage', () => {
  it('shows the three tiles, My requests and the school holidays', async () => {
    const mine = myLeave({
      items: [
        approvedLeave({
          startsOn: '2026-10-22',
          endsOn: '2026-10-22',
          days: 1,
        }),
      ],
      daysTakenThisYear: 4,
      waiting: 2,
      oldestWaitingSentOn: '2026-10-08',
      nextTimeOff: approvedLeave({
        startsOn: '2026-10-22',
        endsOn: '2026-10-22',
        days: 1,
        type: 'annual',
      }),
      holidays: [
        {
          kind: 'holiday',
          name: 'Mid-term break',
          start: '2026-10-29',
          end: '2026-10-29',
          days: 1,
        },
      ],
    });
    renderWithApi(
      <LeaveOnlyApprovalsPage canWrite />,
      cardApi(mine),
      ownerAccess()
    );

    expect(
      await screen.findByText('Ask for leave and see what the school decides.')
    ).toBeVisible();
    expect(
      await screen.findByText('Approved leave in 2026/2027')
    ).toBeVisible();
    expect(screen.getByText('Oldest sent 8 Oct 2026')).toBeVisible();
    expect(screen.getByText('22 Oct 2026')).toBeVisible();
    expect(screen.getByText('Annual leave · 1 day')).toBeVisible();
    expect(screen.getByText('My requests')).toBeVisible();
    expect(
      screen.getByText('No need to request leave on these days.')
    ).toBeVisible();
    expect(screen.getByText('Mid-term break')).toBeVisible();
    expect(screen.getByText('Thu · no school')).toBeVisible();
  });

  it('shows a dash and the nothing-ahead lines with no leave', async () => {
    renderWithApi(<LeaveOnlyApprovalsPage canWrite />, cardApi());
    expect(await screen.findByText('No approved leave ahead')).toBeVisible();
    expect(screen.getByText('Nothing waiting')).toBeVisible();
    expect(screen.getByText('—')).toBeVisible();
    expect(screen.getByText('No holidays ahead')).toBeVisible();
  });

  it('hides Request leave when the viewer cannot write', async () => {
    renderWithApi(<LeaveOnlyApprovalsPage canWrite={false} />, cardApi());
    await screen.findByText('Nothing waiting');
    expect(screen.queryByRole('button', { name: 'Request leave' })).toBeNull();
  });
});

describe('Cancelled and Withdrawn leave', () => {
  const WITHDRAWN_ID = '00000000-0000-4000-8000-000000000905';

  it('reads Cancelled with who and why for a cancel by someone, and Withdrawn for the requester’s own', async () => {
    const withdrawn = leaveDto({
      id: WITHDRAWN_ID,
      status: 'cancelled',
      startsOn: '2026-09-01',
      endsOn: '2026-09-01',
      days: 1,
    });
    renderWithApi(
      <MyLeaveCard canWrite />,
      cardApi(myLeave({ items: [cancelledLeave(), withdrawn] }))
    );

    expect(await screen.findByText('Cancelled')).toBeVisible();
    expect(screen.getByText('Withdrawn')).toBeVisible();
    expect(
      screen.getByText('Cancelled by Funmi Adeyemi: Cover is short')
    ).toBeVisible();
    expect(screen.queryByText(/Withdrawn by/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Withdraw' })).toBeNull();
  });
});

describe('LeaveDecisionsNotice', () => {
  const unseen = myLeave({
    items: [cancelledLeave(), approvedLeave(), declinedLeave()],
    unseenCount: 3,
    unseenDecisions: [cancelledLeave(), declinedLeave(), approvedLeave()],
  });

  it('shows one line per unseen decision and clears with Got it', async () => {
    const api = cardApi(unseen);
    const { queryClient } = renderWithApi(<MyLeaveCard canWrite />, api);
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

    expect(
      await screen.findByText('New decisions on your leave')
    ).toBeVisible();
    expect(
      screen.getAllByText('Cancelled by Funmi Adeyemi: Cover is short')
    ).not.toHaveLength(0);
    expect(
      screen.getAllByText('Declined by Funmi Adeyemi: Exams that week')
    ).not.toHaveLength(0);
    expect(
      screen.getByText(
        'Approved by Funmi Adeyemi: Sick leave, 12 Oct 2026 – 13 Oct 2026'
      )
    ).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Got it' }));

    await waitFor(() => {
      expect(api.leave.seen).toHaveBeenCalledExactlyOnceWith({
        body: { through: '2026-10-12T09:00:00.000Z' },
      });
    });
    await waitFor(() => {
      expect(api.leave.me).toHaveBeenCalledTimes(2);
    });
    expect(invalidatedKeys(invalidate)).toEqual(
      expect.arrayContaining(LEAVE_INVALIDATIONS)
    );
  });

  it('shows why Got it failed in the notice, not as a toast', async () => {
    const api = cardApi(unseen);
    api.leave.seen.mockRejectedValue(
      new ApiError(409, { code: 'Conflict', message: 'Try again in a moment.' })
    );
    renderWithApi(<MyLeaveCard canWrite />, api);

    fireEvent.click(await screen.findByRole('button', { name: 'Got it' }));

    expect(await screen.findByText('Try again in a moment.')).toBeVisible();
    expect(toast.error).not.toHaveBeenCalled();
    expect(screen.getByText('New decisions on your leave')).toBeVisible();
  });

  it('says how many more there are beyond the five shown', async () => {
    renderWithApi(
      <MyLeaveCard canWrite />,
      cardApi(myLeave({ unseenCount: 8, unseenDecisions: [approvedLeave()] }))
    );
    expect(await screen.findByText('and 7 more')).toBeVisible();
  });

  it('is absent when everything has been seen', async () => {
    renderWithApi(<MyLeaveCard canWrite />, cardApi(listed));
    await screen.findByText('Approved');
    expect(screen.queryByText('New decisions on your leave')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Got it' })).toBeNull();
  });
});

const ahead = (over: Parameters<typeof approvedLeave>[0] = {}) =>
  approvedLeave({
    isOwn: false,
    startsOn: '2026-10-22',
    endsOn: '2026-10-22',
    days: 1,
    ...over,
  });

const actingApprover = (writes: boolean) =>
  fakeAccess({
    roles: [],
    permissions: toPermissionMap(['leave:approve']),
    campusScope: 'all',
    acting: { organizationId: 'org-1', writes },
  });

function memberApi(items: LeaveDto[] = [ahead()]) {
  return {
    ...cardApi(),
    leave: { ...cardApi().leave, list: vi.fn().mockResolvedValue(items) },
  };
}

describe('MemberLeaveCard Cancel leave', () => {
  it('is offered on an approved row that has not started', async () => {
    renderWithApi(<MemberLeaveCard userId="user-emeka" />, memberApi());
    expect(
      await screen.findByRole('button', { name: 'Cancel leave' })
    ).toBeVisible();
  });

  it('is left off started, waiting, declined, withdrawn, already cancelled and own leave', async () => {
    const items = [
      ahead({ id: STARTED_TODAY, startsOn: TODAY, endsOn: TODAY }),
      ahead({
        id: STARTED_EARLIER,
        startsOn: '2026-10-05',
        endsOn: '2026-10-05',
      }),
      leaveDto({ id: WAITING, isOwn: false, startsOn: '2026-10-22' }),
      declinedLeave({ id: DECLINED, isOwn: false, startsOn: '2026-10-22' }),
      leaveDto({
        id: WITHDRAWN,
        isOwn: false,
        status: 'cancelled',
        startsOn: '2026-10-22',
      }),
      cancelledLeave({ id: CANCELLED, isOwn: false, startsOn: '2026-10-22' }),
      ahead({ id: OWN, isOwn: true }),
    ];
    renderWithApi(<MemberLeaveCard userId="user-emeka" />, memberApi(items));
    expect(await screen.findAllByRole('listitem')).toHaveLength(items.length);
    expect(screen.queryByRole('button', { name: 'Cancel leave' })).toBeNull();
  });

  it('is hidden while a super admin is acting read-only and shown once they have a reason', async () => {
    const { unmount } = renderWithApi(
      <MemberLeaveCard userId="user-emeka" />,
      memberApi(),
      actingApprover(false)
    );
    await screen.findByText('Approved');
    expect(screen.queryByRole('button', { name: 'Cancel leave' })).toBeNull();
    unmount();

    renderWithApi(
      <MemberLeaveCard userId="user-emeka" />,
      memberApi(),
      actingApprover(true)
    );
    expect(
      await screen.findByRole('button', { name: 'Cancel leave' })
    ).toBeVisible();
  });

  it('opens the dialog for that row', async () => {
    renderWithApi(<MemberLeaveCard userId="user-emeka" />, memberApi());
    fireEvent.click(
      await screen.findByRole('button', { name: 'Cancel leave' })
    );
    expect(await screen.findByText('Cancel this leave?')).toBeVisible();
    expect(
      screen.getByText('Emeka Obi · Sick leave · 22 Oct 2026')
    ).toBeVisible();
  });
});

const submit = () => {
  fireEvent.click(screen.getByRole('button', { name: 'Cancel leave' }));
};

describe('CancelLeaveDialog', () => {
  const target = approvedLeave({
    isOwn: false,
    startsOn: '2026-10-22',
    endsOn: '2026-10-23',
    days: 2,
  });

  function openCancel(api = cardApi()) {
    const onClose = vi.fn();
    const { queryClient } = renderWithApi(
      <CancelLeaveDialog leave={target} onClose={onClose} />,
      api
    );
    return { api, onClose, queryClient };
  }

  it('names the leave and offers Keep leave and Cancel leave', () => {
    const { onClose } = openCancel();
    expect(screen.getByText('Cancel this leave?')).toBeVisible();
    expect(
      screen.getByText('Emeka Obi · Sick leave · 22 Oct 2026 – 23 Oct 2026')
    ).toBeVisible();
    expect(
      screen.getByPlaceholderText('The staff member will see this')
    ).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Keep leave' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('asks for a reason before cancelling', () => {
    const { api } = openCancel();
    submit();
    expect(screen.getByText('Give a reason.')).toBeVisible();
    fireEvent.change(screen.getByLabelText('Reason'), {
      target: { value: '   ' },
    });
    submit();
    expect(screen.getByText('Give a reason.')).toBeVisible();
    expect(api.leave.cancel).not.toHaveBeenCalled();
  });

  it('cancels with the trimmed reason, closes and toasts', async () => {
    const { api, onClose, queryClient } = openCancel();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    fireEvent.change(screen.getByLabelText('Reason'), {
      target: { value: '  Cover is short  ' },
    });
    submit();

    await waitFor(() => {
      expect(api.leave.cancel).toHaveBeenCalledWith({
        params: { id: target.id },
        body: { reason: 'Cover is short' },
      });
    });
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(
        'Leave cancelled. Emeka Obi can see your reason.'
      );
    });
    expect(onClose).toHaveBeenCalled();
    expect(invalidatedKeys(invalidate)).toEqual(
      expect.arrayContaining(LEAVE_INVALIDATIONS)
    );
  });

  it('shows the server’s message when the leave can no longer be cancelled', async () => {
    const api = cardApi();
    api.leave.cancel.mockRejectedValue(
      new ApiError(409, {
        code: 'Conflict',
        message: 'Leave that has started can’t be cancelled.',
      })
    );
    const { onClose } = openCancel(api);
    fireEvent.change(screen.getByLabelText('Reason'), {
      target: { value: 'Too late' },
    });
    submit();

    expect(
      await screen.findByText('Leave that has started can’t be cancelled.')
    ).toBeVisible();
    expect(onClose).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });
});

function openDialog(api = cardApi()) {
  renderWithApi(<RequestLeaveDialog open onOpenChange={vi.fn()} />, api);
  return api;
}

const type = (label: string, value: string) => {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
};

const send = () => {
  fireEvent.click(screen.getByRole('button', { name: 'Send request' }));
};

describe('RequestLeaveDialog', () => {
  it('opens with the PRD fields and defaults', () => {
    openDialog();

    expect(screen.getByText('Request leave')).toBeVisible();
    expect(
      screen.getByText(
        'Someone with leave approval decides. You’ll see the decision here.'
      )
    ).toBeVisible();
    expect(screen.getByLabelText('Type of leave')).toHaveValue('annual');
    expect(
      within(screen.getByLabelText('Type of leave'))
        .getAllByRole('option')
        .map((option) => option.textContent)
    ).toEqual([
      'Annual leave',
      'Sick leave',
      'Personal leave',
      'Study leave',
      'Maternity or paternity leave',
    ]);
    expect(screen.getByLabelText('First day')).toHaveValue('');
    expect(screen.getByLabelText('First day')).toHaveAttribute('min', TODAY);
    expect(screen.getByText('Leave empty for one day.')).toBeVisible();
    expect(
      screen.getByPlaceholderText('e.g. Doctor’s appointment')
    ).toBeVisible();
    expect(
      screen.getByPlaceholderText('e.g. Ayo Bassey will take JSS 2 Mathematics')
    ).toBeVisible();
  });

  it('asks for a first day and a reason before sending', () => {
    const api = openDialog();
    send();

    expect(screen.getByText('Choose the first day of leave.')).toBeVisible();
    expect(screen.getByText('Give a reason.')).toBeVisible();
    expect(api.leave.create).not.toHaveBeenCalled();
  });

  it('sets the last day’s minimum to the first day', () => {
    openDialog();
    type('First day', '2026-10-22');
    expect(screen.getByLabelText('Last day')).toHaveAttribute(
      'min',
      '2026-10-22'
    );
  });

  it('refuses a last day before the first, a past first day and a weekend', () => {
    const api = openDialog();
    type('Reason', 'Trip');

    type('First day', '2026-10-22');
    type('Last day', '2026-10-21');
    send();
    expect(
      screen.getByText('The last day can’t be before the first day.')
    ).toBeVisible();

    type('First day', '2026-10-09');
    type('Last day', '');
    send();
    expect(
      screen.getByText('The first day can’t be before today.')
    ).toBeVisible();

    type('First day', '2026-10-17');
    send();
    expect(
      screen.getByText(
        'Those dates are school holidays or a weekend. Choose at least one school day.'
      )
    ).toBeVisible();
    expect(api.leave.create).not.toHaveBeenCalled();
  });

  it('sends the request and toasts the school days', async () => {
    const api = openDialog();
    api.leave.create.mockImplementation(
      ({ body }: { body: CreateLeaveInput }) =>
        leaveDto({
          type: body.type,
          startsOn: body.startsOn,
          endsOn: body.startsOn,
          reason: body.reason,
          cover: body.cover ?? null,
          days: 1,
        })
    );
    type('Type of leave', 'study');
    type('First day', '2026-10-22');
    type('Reason', '  Exam  ');
    type('Cover for your classes (optional)', 'Ayo takes JSS 2');
    send();

    await waitFor(() => {
      expect(api.leave.create).toHaveBeenCalledWith({
        body: {
          type: 'study',
          startsOn: '2026-10-22',
          reason: 'Exam',
          cover: 'Ayo takes JSS 2',
        },
      });
    });
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(
        'Leave request sent: 1 school day. Someone with leave approval will decide.'
      );
    });
  });

  it('shows an overlap under the dates', async () => {
    const api = openDialog();
    api.leave.create.mockRejectedValue(
      new ApiError(409, {
        code: 'Conflict',
        message: 'You already asked for leave on some of these days.',
      })
    );
    type('First day', '2026-10-22');
    type('Reason', 'Trip');
    send();

    expect(
      await screen.findByText(
        'You already asked for leave on some of these days.'
      )
    ).toBeVisible();
  });

  it('shows any other refusal in the form', async () => {
    const api = openDialog();
    api.leave.create.mockRejectedValue(
      new ApiError(400, {
        code: 'BadRequest',
        message:
          'Those dates are school holidays or a weekend. Choose at least one school day.',
      })
    );
    type('First day', '2026-10-22');
    type('Reason', 'Trip');
    send();

    expect(
      await screen.findByText(
        'Those dates are school holidays or a weekend. Choose at least one school day.'
      )
    ).toBeVisible();
  });
});
