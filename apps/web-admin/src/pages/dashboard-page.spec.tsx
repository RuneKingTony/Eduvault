import { screen, waitFor } from '@testing-library/react';
import { toPermissionMap } from '@eduvault/policy';
import type { DashboardTask } from '@eduvault/api-contract';
import { currentCalendar, noCalendar } from '../test-calendar';
import {
  announcementSummary,
  dashboardApi,
  dayOff,
  finance,
  myClass,
  person,
  renderInRouter,
} from '../test-dashboard';
import { fakeAccess, ownerAccess, starterAccess } from '../test-utils';
import { DashboardPage } from './dashboard-page';

const render = (
  access: Parameters<typeof renderInRouter>[2],
  api: ReturnType<typeof dashboardApi>
) => {
  renderInRouter(<DashboardPage />, api, access);
};

const dueLeft = (count: number, shown = count): DashboardTask => ({
  kind: 'dueLeft',
  count,
  students: [1, 2, 3, 4, 5].slice(0, shown).map((n) => person(n)),
});

const notInClass = (startYear: { name: string } | null): DashboardTask => ({
  kind: 'notInClass',
  count: 2,
  students: [person(1), person(2)],
  startYear,
});

describe('DashboardPage no access', () => {
  it('welcomes a member with no permission and asks nothing of the API', async () => {
    const api = dashboardApi();
    render(fakeAccess({ roles: ['member'] }), api);
    expect(
      await screen.findByRole('heading', { name: 'Welcome, Funmi' })
    ).toBeInTheDocument();
    expect(await screen.findByText('No access yet')).toBeInTheDocument();
    expect(
      await screen.findByText('Greenfield College · First term, 2026/2027')
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'See my access' })
    ).toBeInTheDocument();
    expect(api.dashboard.tasks).not.toHaveBeenCalled();
    expect(api.activity.list).not.toHaveBeenCalled();
  });
});

describe('DashboardPage views', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('greets in Lagos time, which is an hour ahead of UTC', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-07T11:30:00Z'));
    render(ownerAccess(), dashboardApi());
    expect(
      await screen.findByRole('heading', { name: 'Good afternoon, Funmi' })
    ).toBeInTheDocument();
  });

  it('shows the staff view to an owner', async () => {
    render(ownerAccess(), dashboardApi());
    expect(await screen.findByText('Students by status')).toBeInTheDocument();
    expect(screen.getByText('Across all campuses')).toBeInTheDocument();
    expect(screen.getByText('First term · 2026/2027')).toBeInTheDocument();
    expect(screen.getByText('Recent activity')).toBeInTheDocument();
    expect(screen.queryByText('My students')).not.toBeInTheDocument();
  });

  it('shows the teacher view to a class-scoped member', async () => {
    const api = dashboardApi({
      myClasses: [myClass()],
      daysOff: [dayOff()],
    });
    render({ ...starterAccess('teacher'), classScope: ['a1'] }, api);
    expect(await screen.findByText('My students')).toBeInTheDocument();
    expect(await screen.findByText('Class teacher')).toBeInTheDocument();
    expect(screen.getByText('1 as class teacher')).toBeInTheDocument();
    expect(screen.getByText('Week 5')).toBeInTheDocument();
    expect(
      screen.getByText('Mid-term break · 29 Oct 2026')
    ).toBeInTheDocument();
    expect(screen.getByText('Upcoming holidays')).toBeInTheDocument();
    expect(screen.getByText('All caught up.')).toBeInTheDocument();
    expect(screen.queryByText('Students by status')).not.toBeInTheDocument();
    expect(api.dashboard.roll).not.toHaveBeenCalled();
  });

  it('shows the Announcements card in the teacher view from the feed', async () => {
    const api = dashboardApi({
      myClasses: [myClass()],
      announcements: [announcementSummary({ pinned: true })],
    });
    render({ ...starterAccess('teacher'), classScope: ['a1'] }, api);
    expect(await screen.findByText('Announcements')).toBeInTheDocument();
    expect(
      await screen.findByText('9 Oct 2026 · Event · Pinned')
    ).toBeInTheDocument();
    expect(api.announcements.feed).toHaveBeenCalledWith({
      query: { limit: 4 },
    });
  });

  it('keeps the Announcements card out of the staff view', async () => {
    const api = dashboardApi();
    render(ownerAccess(), api);
    await screen.findByText('Students by status');
    expect(api.announcements.feed).not.toHaveBeenCalled();
  });

  it('shows a teacher with no classes the empty state', async () => {
    render({ ...starterAccess('teacher'), classScope: [] }, dashboardApi());
    expect(await screen.findByText('No classes yet')).toBeInTheDocument();
  });
});

describe('DashboardPage permissions', () => {
  it('never calls the roll or my classes without their permission', async () => {
    const api = dashboardApi();
    render(
      fakeAccess({
        roles: ['custom'],
        permissions: toPermissionMap(['session:read']),
        campusScope: 'all',
      }),
      api
    );
    expect(
      await screen.findByText('First term · 2026/2027')
    ).toBeInTheDocument();
    expect(screen.queryByText('Students by status')).not.toBeInTheDocument();
    expect(screen.queryByText('Students')).not.toBeInTheDocument();
    expect(api.dashboard.roll).not.toHaveBeenCalled();
    expect(api.dashboard.myClasses).not.toHaveBeenCalled();
  });

  it('never calls my classes in the staff view', async () => {
    const api = dashboardApi();
    render(ownerAccess(), api);
    await screen.findByText('Students by status');
    expect(api.dashboard.myClasses).not.toHaveBeenCalled();
  });

  it('shows a failing roll in its own cards while the Term card still renders', async () => {
    const api = dashboardApi();
    api.dashboard.roll.mockRejectedValue(new Error('The roll is unavailable'));
    render(ownerAccess(), api);
    expect(
      (await screen.findAllByText('The roll is unavailable')).length
    ).toBeGreaterThan(0);
    expect(screen.getByText('First term · 2026/2027')).toBeInTheDocument();
    expect(screen.queryByText('Students by status')).not.toBeInTheDocument();
  });
});

describe('DashboardPage while the term loads', () => {
  it('holds the stat row and the roll card back until a term is known', async () => {
    const api = dashboardApi();
    api.calendar.current.mockReturnValue(new Promise(() => undefined));
    render(ownerAccess(), api);
    expect(await screen.findByText('Recent activity')).toBeInTheDocument();
    expect(screen.queryByText('Students by status')).not.toBeInTheDocument();
    expect(
      screen.queryByText('Create the first school year')
    ).not.toBeInTheDocument();
    expect(api.dashboard.roll).not.toHaveBeenCalled();
  });
});

describe('DashboardPage without a current term', () => {
  it('replaces the stat row, Term card and roll card in the staff view', async () => {
    const api = dashboardApi({ calendar: noCalendar(), tasks: [dueLeft(1)] });
    render(ownerAccess(), api);
    expect(
      await screen.findByText('Create the first school year')
    ).toBeInTheDocument();
    expect(await screen.findByText('Needs you today')).toBeInTheDocument();
    expect(screen.getByText('Recent activity')).toBeInTheDocument();
    expect(screen.queryByText('Students by status')).not.toBeInTheDocument();
    expect(screen.queryByText(/school days/)).not.toBeInTheDocument();
    expect(screen.queryByText('Across all campuses')).not.toBeInTheDocument();
  });

  it('replaces the stats and holidays card in the teacher view', async () => {
    const api = dashboardApi({ calendar: noCalendar(), tasks: [dueLeft(1)] });
    render({ ...starterAccess('teacher'), classScope: ['a1'] }, api);
    expect(
      await screen.findByText('Your school hasn’t set up its school year yet.')
    ).toBeInTheDocument();
    expect(await screen.findByText('Needs you today')).toBeInTheDocument();
    expect(screen.getByText('Recent activity')).toBeInTheDocument();
    expect(screen.queryByText('My students')).not.toBeInTheDocument();
    expect(screen.queryByText('Upcoming holidays')).not.toBeInTheDocument();
  });

  it('keeps a session:read-only member out of the create button', async () => {
    render(
      fakeAccess({ roles: ['custom'], permissions: { session: ['read'] } }),
      dashboardApi({ calendar: noCalendar() })
    );
    await screen.findByText('Your school hasn’t set up its school year yet.');
    expect(
      screen.queryByRole('button', { name: 'New school year' })
    ).not.toBeInTheDocument();
  });
});

describe('DashboardPage term card', () => {
  it('shows the term, week, school days and dates', async () => {
    render(ownerAccess(), dashboardApi());
    expect(
      await screen.findByText('First term · 2026/2027')
    ).toBeInTheDocument();
    expect(screen.getByText('Week 5')).toBeInTheDocument();
    expect(screen.getByText('of 14')).toBeInTheDocument();
    expect(screen.getByText('22 of 67 school days')).toBeInTheDocument();
    expect(screen.getByText('7 Sep 2026')).toBeInTheDocument();
    expect(screen.getByText('11 Dec 2026')).toBeInTheDocument();
  });

  it('links to the calendar only with session:read', async () => {
    render(ownerAccess(), dashboardApi({ calendar: currentCalendar() }));
    expect(
      (await screen.findAllByRole('link', { name: 'Calendar' }))[0]
    ).toHaveAttribute('href', '/calendar');
  });

  it('lists upcoming holidays and breaks, the first marked next', async () => {
    render(
      ownerAccess(),
      dashboardApi({
        daysOff: [
          dayOff(),
          dayOff({
            kind: 'break',
            name: 'Christmas break',
            start: '2026-12-12',
            end: '2027-01-03',
            days: 15,
            resume: '2027-01-04',
          }),
        ],
      })
    );
    expect(await screen.findByText('Mid-term break')).toBeInTheDocument();
    expect(screen.getByText('Thu – Fri · 2 days off')).toBeInTheDocument();
    expect(screen.getByText('Resumes 4 Jan 2027')).toBeInTheDocument();
  });
});

describe('DashboardPage tasks', () => {
  it('offers Start only when the task carries a start year', async () => {
    render(
      ownerAccess(),
      dashboardApi({ tasks: [notInClass({ name: '2027/2028' })] })
    );
    expect(
      await screen.findByRole('link', { name: 'Start 2027/2028' })
    ).toHaveAttribute('href', '/students?dialog=start-year');
  });

  it('leaves Start out when there is no start year', async () => {
    render(ownerAccess(), dashboardApi({ tasks: [notInClass(null)] }));
    await screen.findByText('2 students not in a class');
    expect(
      screen.queryByRole('link', { name: /^Start / })
    ).not.toBeInTheDocument();
  });

  it('writes plurals and counts what the sample leaves out', async () => {
    render(
      ownerAccess(),
      dashboardApi({
        tasks: [
          dueLeft(1),
          dueLeft(7, 5),
          {
            kind: 'noRole',
            memberId: 'm1',
            name: 'Ada Obi',
          },
        ],
      })
    );
    expect(
      await screen.findByText('1 student due to be marked Left')
    ).toBeInTheDocument();
    expect(
      screen.getByText('7 students due to be marked Left')
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /Student 1, Student 2, Student 3, Student 4, Student 5 and 2 more/
      )
    ).toBeInTheDocument();
    expect(screen.getByText('Ada Obi has no role yet')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Give a role' })).toHaveAttribute(
      'href',
      '/members/m1'
    );
  });

  it('sends a single student task straight to that student', async () => {
    render(
      ownerAccess(),
      dashboardApi({
        tasks: [
          {
            kind: 'notSeen',
            count: 1,
            students: [{ ...person(1), notSeenSince: '2026-09-01' }],
          },
        ],
      })
    );
    expect(
      await screen.findByText('Student 1 (since 1 Sep 2026)')
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open' })).toHaveAttribute(
      'href',
      '/students/s1'
    );
  });

  it('shows All caught up when nothing needs the member', async () => {
    render(ownerAccess(), dashboardApi());
    expect(await screen.findByText('All caught up')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByText('Needs you today')).not.toBeInTheDocument();
    });
  });
});

describe('DashboardPage Charged this term', () => {
  const charged = {
    currency: 'NGN',
    termId: 't1',
    termName: 'First term, 2026/2027',
    chargedMinor: 45_200_000,
    chargeCount: 2,
  };

  it('shows the figure and the term to a holder of invoice:read', async () => {
    render(ownerAccess(), dashboardApi({ charged }));
    expect(await screen.findByText('Charged this term')).toBeInTheDocument();
    expect(screen.getByText('₦452,000')).toBeInTheDocument();
    expect(screen.getByText('First term, 2026/2027')).toBeInTheDocument();
    expect(screen.getByText('Charged this term').closest('a')).toHaveAttribute(
      'href',
      '/finance/invoices'
    );
  });

  it('asks for nothing and shows nothing without invoice:read', async () => {
    const api = dashboardApi({ charged });
    render(
      fakeAccess({
        permissions: toPermissionMap(['student:read']),
        campusScope: 'all',
      }),
      api
    );
    expect(await screen.findByText('Students by status')).toBeInTheDocument();
    expect(api.dashboard.charged).not.toHaveBeenCalled();
    expect(screen.queryByText('Charged this term')).not.toBeInTheDocument();
  });

  it('leaves the tile out when there is no current term to charge', async () => {
    render(ownerAccess(), dashboardApi({ charged: null }));
    expect(await screen.findByText('Students by status')).toBeInTheDocument();
    expect(screen.queryByText('Charged this term')).not.toBeInTheDocument();
  });

  it('lists the charge tasks with their buttons', async () => {
    render(
      ownerAccess(),
      dashboardApi({
        tasks: [
          {
            kind: 'unsentRound',
            runId: 'r1',
            number: 'BR-2026-0002',
            termName: 'Second term, 2026/2027',
            count: 3,
          },
          {
            kind: 'notCharged',
            count: 2,
            termId: 't2',
            termName: 'Second term',
            students: [person(1), person(2)],
          },
        ],
      })
    );
    expect(
      await screen.findByText(
        'Charges prepared for Second term, 2026/2027, not sent yet'
      )
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /Check and send/ })
    ).toHaveAttribute('href', expect.stringContaining('/finance/billing/r1'));
    expect(
      screen.getByText('2 students not charged for Second term yet')
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /Charge students/ })
    ).toHaveAttribute('href', '/finance/billing?prepare=1');
  });
});

const asReader = (...permissions: Parameters<typeof toPermissionMap>[0]) =>
  fakeAccess({
    permissions: toPermissionMap(['student:read', ...permissions]),
    campusScope: 'all',
  });

describe('DashboardPage Received and Still owed', () => {
  it('shows Charged, Received and Still owed to an owner', async () => {
    render(ownerAccess(), dashboardApi({ charged: null }));
    expect(await screen.findByText('Received')).toBeInTheDocument();
    expect(screen.getByText('₦900,000')).toBeInTheDocument();
    expect(screen.getByText('Still owed')).toBeInTheDocument();
    expect(screen.getByText('₦250,000')).toBeInTheDocument();
  });

  it('shows only Still owed to an invoice reader, from the finance answer', async () => {
    const api = dashboardApi({
      finance: finance({ receivedMinor: undefined, paymentCount: undefined }),
    });
    render(asReader('invoice:read'), api);
    expect(await screen.findByText('Still owed')).toBeInTheDocument();
    expect(screen.queryByText('Received')).not.toBeInTheDocument();
    expect(api.dashboard.finance).toHaveBeenCalledTimes(1);
  });

  it('shows Received and Still owed to a payment reader', async () => {
    render(asReader('payment:read'), dashboardApi());
    expect(await screen.findByText('Received')).toBeInTheDocument();
    expect(screen.getByText('Still owed')).toBeInTheDocument();
    expect(screen.queryByText('Charged this term')).not.toBeInTheDocument();
  });

  it('asks for no money figures and shows none without a finance read', async () => {
    const api = dashboardApi();
    render(asReader(), api);
    expect(await screen.findByText('Students by status')).toBeInTheDocument();
    expect(api.dashboard.finance).not.toHaveBeenCalled();
    expect(screen.queryByText('Still owed')).not.toBeInTheDocument();
    expect(screen.queryByText('Received')).not.toBeInTheDocument();
    expect(screen.queryByText(/Owed/)).not.toBeInTheDocument();
  });

  it('leaves both tiles out when there is no current term to count', async () => {
    render(ownerAccess(), dashboardApi({ finance: null }));
    expect(await screen.findByText('Students by status')).toBeInTheDocument();
    expect(screen.queryByText('Still owed')).not.toBeInTheDocument();
    expect(screen.queryByText('Received')).not.toBeInTheDocument();
  });
});
