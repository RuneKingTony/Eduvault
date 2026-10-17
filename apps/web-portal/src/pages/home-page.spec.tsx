import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { ApiError, type AnnouncementSummary } from '@eduvault/api-contract';
import type { Permission } from '@eduvault/policy';
import { addDays, lagosDateOf } from '@eduvault/shared';
import {
  calendarCurrent,
  dayOffEntry,
  portalAnnouncements,
  portalChild,
  portalFamilyStatement,
  portalMe,
  portalStudent,
  renderWithApi,
} from '../test-utils';
import { HomePage } from './home-page';

const TODAY = lagosDateOf(new Date());
const ada = portalChild({ id: 'ada', firstName: 'Ada' });
const tobi = portalChild({ id: 'tobi', firstName: 'Tobi' });
const guardian = portalMe({ children: [ada, tobi] });
const studentMe = portalMe({
  kind: 'student',
  name: 'Ada Okeke',
  firstName: 'Ada',
  login: { username: 'greenfield-0123', email: null },
  children: [ada],
});

const item = (
  overrides: Partial<AnnouncementSummary> = {}
): AnnouncementSummary => ({
  id: 'n1',
  title: 'PTA meeting',
  body: 'Saturday at ten.',
  tag: 'event',
  pinned: false,
  publishedOn: addDays(TODAY, -30),
  ...overrides,
});

interface Answers {
  student?: unknown;
  news?: unknown;
  current?: unknown;
  daysOff?: unknown[];
}

const apiWith = ({
  student = portalStudent({ id: 'ada' }),
  news = portalAnnouncements(),
  current = calendarCurrent(),
  daysOff = [],
}: Answers = {}) => ({
  portal: {
    student: vi.fn().mockResolvedValue(student),
    announcements: vi.fn().mockResolvedValue(news),
  },
  calendar: {
    current: vi.fn().mockResolvedValue(current),
    daysOff: vi.fn().mockResolvedValue(daysOff),
  },
});

const renderHome = (
  api: ReturnType<typeof apiWith>,
  props: {
    me?: typeof guardian;
    childId?: string;
    onMissing?: () => void;
    onSeeAll?: (childId: string) => void;
    onSeeFees?: (childId: string) => void;
    held?: Permission[];
  } = {}
) =>
  renderWithApi(
    <HomePage
      me={props.me ?? guardian}
      childId={props.childId}
      onChildMissing={props.onMissing ?? vi.fn()}
      onSeeAllAnnouncements={props.onSeeAll ?? vi.fn()}
      onSeeFees={props.onSeeFees ?? vi.fn()}
    />,
    api,
    props.held
  );

describe('Home hero', () => {
  it('names the child, their class and campus, and says the guardian is viewing', async () => {
    renderHome(apiWith());
    expect(
      await screen.findByRole('heading', { name: 'Ada Okeke' })
    ).toBeInTheDocument();
    expect(screen.getByText('JSS 1 Gold · Lekki campus')).toBeInTheDocument();
    expect(
      screen.getByText(/^Good (morning|afternoon|evening), Ngozi · viewing$/)
    ).toBeInTheDocument();
  });

  it('greets a student by first name without "viewing"', async () => {
    renderHome(apiWith(), { me: studentMe });
    expect(
      await screen.findByText(/^Good (morning|afternoon|evening), Ada$/)
    ).toBeInTheDocument();
  });

  it('shows a dash for an unplaced class', async () => {
    renderHome(
      apiWith({ student: portalStudent({ id: 'ada', className: null }) })
    );
    expect(await screen.findByText('— · Lekki campus')).toBeInTheDocument();
  });

  it('shows the term, week, end date and a progress bar', async () => {
    renderHome(apiWith());
    await screen.findByText(/First term/);
    expect(screen.getByText(/2026\/2027/)).toBeInTheDocument();
    expect(screen.getByText(/Week/).textContent).toBe('Week 5 of 14');
    expect(screen.getByText(/Ends/).textContent).toBe('Ends 11 Dec 2026');
    expect(
      screen.getByRole('progressbar', { name: 'School days done' })
    ).toBeInTheDocument();
  });

  it('shows the callout instead when there is no current term', async () => {
    renderHome(
      apiWith({
        current: calendarCurrent({ term: null, schoolYear: null }),
      })
    );
    expect(
      await screen.findByText('Your school hasn’t set up its school year yet.')
    ).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });
});

describe('Home tiles', () => {
  it('shows the next holiday, the new announcement count and the class teacher', async () => {
    renderHome(
      apiWith({
        daysOff: [
          dayOffEntry({
            name: 'Founders day',
            start: addDays(TODAY, 3),
            end: addDays(TODAY, 3),
          }),
        ],
        news: portalAnnouncements({ newThisWeek: 3 }),
      })
    );
    expect(await screen.findByText('Next holiday')).toBeInTheDocument();
    expect(await screen.findByText('3 days')).toBeInTheDocument();
    expect(screen.getByText('New this week')).toBeInTheDocument();
    expect(await screen.findByText('3')).toBeInTheDocument();
    expect(screen.getByText('Class teacher')).toBeInTheDocument();
    expect(screen.getAllByText('Zainab Lead').length).toBeGreaterThan(0);
  });

  it('says there is no holiday and no teacher when there is none', async () => {
    renderHome(
      apiWith({ student: portalStudent({ id: 'ada', classTeacherName: null }) })
    );
    expect(await screen.findByText('None this term')).toBeInTheDocument();
  });
});

describe('Home announcements', () => {
  it('opens pinned items, shows Pinned, and keeps the rest closed', async () => {
    renderHome(
      apiWith({
        news: portalAnnouncements({
          items: [
            item({
              id: 'p',
              title: 'Pinned notice',
              pinned: true,
              body: 'Read me first.',
            }),
            item({ id: 'o', title: 'Older news', body: 'Closed body.' }),
          ],
        }),
      })
    );
    expect(await screen.findByText('Pinned notice')).toBeInTheDocument();
    expect(screen.getByText('Pinned')).toBeInTheDocument();
    expect(screen.getByText('Read me first.')).toBeVisible();
    expect(screen.queryByText('Closed body.')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Pinned notice/ })
    ).toHaveAttribute('aria-expanded', 'true');
  });

  it('toggles an item open and closed on a tap', async () => {
    renderHome(
      apiWith({
        news: portalAnnouncements({
          items: [item({ body: 'Saturday at ten.' })],
        }),
      })
    );
    const toggle = await screen.findByRole('button', { name: /PTA meeting/ });
    fireEvent.click(toggle);
    expect(screen.getByText('Saturday at ten.')).toBeVisible();
    fireEvent.click(toggle);
    expect(screen.queryByText('Saturday at ten.')).not.toBeInTheDocument();
  });

  it('badges a recent unpinned item as New and an old or pinned one not', async () => {
    renderHome(
      apiWith({
        news: portalAnnouncements({
          items: [
            item({
              id: 'p',
              title: 'Pinned today',
              pinned: true,
              publishedOn: TODAY,
            }),
            item({ id: 'f', title: 'Fresh', publishedOn: addDays(TODAY, -2) }),
            item({ id: 'o', title: 'Stale', publishedOn: addDays(TODAY, -20) }),
          ],
        }),
      })
    );
    const fresh = await screen.findByRole('button', { name: /Fresh/ });
    expect(within(fresh).getByText('New')).toBeInTheDocument();
    expect(
      within(screen.getByRole('button', { name: /Stale/ })).queryByText('New')
    ).toBeNull();
    expect(
      within(screen.getByRole('button', { name: /Pinned today/ })).queryByText(
        'New'
      )
    ).toBeNull();
  });

  it('shows the tag badge', async () => {
    renderHome(
      apiWith({
        news: portalAnnouncements({ items: [item({ tag: 'academics' })] }),
      })
    );
    const row = await screen.findByRole('button', { name: /PTA meeting/ });
    expect(within(row).getByText('Academics')).toBeInTheDocument();
  });

  it('offers See all only when the card is full, and opens the full list for the child', async () => {
    const onSeeAll = vi.fn();
    const full = Array.from({ length: 5 }, (_, index) =>
      item({ id: `n${index}`, title: `News ${index}` })
    );
    renderHome(apiWith({ news: portalAnnouncements({ items: full }) }), {
      childId: 'ada',
      onSeeAll,
    });
    fireEvent.click(await screen.findByRole('button', { name: 'See all' }));
    expect(onSeeAll).toHaveBeenCalledWith('ada');
  });

  it('has no See all link when everything already fits on the card', async () => {
    renderHome(
      apiWith({
        news: portalAnnouncements({ items: [item(), item({ id: 'n2' })] }),
      })
    );
    await screen.findAllByRole('button', { name: /PTA meeting/ });
    expect(
      screen.queryByRole('button', { name: 'See all' })
    ).not.toBeInTheDocument();
  });

  it('says there is no news yet', async () => {
    renderHome(apiWith());
    expect(
      await screen.findByText('No news from the school yet.')
    ).toBeInTheDocument();
  });
});

describe('Home holidays and profile', () => {
  it('lists the upcoming holidays with portal sub-lines', async () => {
    renderHome(
      apiWith({
        daysOff: [
          dayOffEntry({
            name: 'Founders day',
            start: '2026-10-29',
            end: '2026-10-29',
          }),
          dayOffEntry({
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
    expect(await screen.findByText('Upcoming holidays')).toBeInTheDocument();
    expect(await screen.findByText('Thu · no school')).toBeInTheDocument();
    expect(screen.getByText('School resumes 4 Jan 2027')).toBeInTheDocument();
  });

  it('says there are no holidays ahead', async () => {
    renderHome(apiWith());
    expect(await screen.findByText('No holidays ahead')).toBeInTheDocument();
  });

  it('keeps the profile closed until opened, then shows a student’s username', async () => {
    renderHome(apiWith(), { me: studentMe });
    const trigger = await screen.findByRole('button', { name: /Profile/ });
    expect(screen.queryByText('GF-0123')).not.toBeInTheDocument();
    fireEvent.click(trigger);
    expect(screen.getByText('GF-0123')).toHaveClass('font-mono');
    expect(screen.getByText('2 May 2014')).toBeInTheDocument();
    expect(screen.getByText('Username')).toBeInTheDocument();
    expect(screen.getByText('greenfield-0123')).toHaveClass('font-mono');
    expect(screen.queryByText('Signed in with')).not.toBeInTheDocument();
  });

  it('shows a guardian what they signed in with', async () => {
    renderHome(apiWith());
    fireEvent.click(await screen.findByRole('button', { name: /Profile/ }));
    expect(screen.getByText('Signed in with')).toBeInTheDocument();
    expect(screen.getByText('okeke-family')).toBeInTheDocument();
    expect(screen.queryByText('Username')).not.toBeInTheDocument();
  });

  it('shows a guardian’s email when they have one', async () => {
    renderHome(apiWith(), {
      me: portalMe({
        children: [ada],
        login: { username: null, email: 'ngozi@example.com' },
      }),
    });
    fireEvent.click(await screen.findByRole('button', { name: /Profile/ }));
    expect(screen.getByText('ngozi@example.com')).toBeInTheDocument();
  });
});

describe('Home states and the selected child', () => {
  it('shows a skeleton while the child loads', () => {
    renderHome({
      ...apiWith(),
      portal: {
        student: vi.fn().mockReturnValue(new Promise(() => undefined)),
        announcements: vi.fn(),
      },
    });
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
  });

  it('shows the error when the child cannot be loaded', async () => {
    renderHome({
      ...apiWith(),
      portal: {
        student: vi.fn().mockRejectedValue(new Error('The school is away')),
        announcements: vi.fn(),
      },
    });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The school is away'
    );
  });

  it('falls back to the first child when the selected one answers 404', async () => {
    const onMissing = vi.fn();
    renderHome(
      {
        ...apiWith(),
        portal: {
          student: vi.fn().mockRejectedValue(
            new ApiError(404, {
              code: 'NotFound',
              message: 'Student not found',
            })
          ),
          announcements: vi.fn(),
        },
      },
      { childId: 'tobi', onMissing }
    );
    await waitFor(() => {
      expect(onMissing).toHaveBeenCalledWith('ada');
    });
  });

  it('shows the selected child', async () => {
    const api = apiWith({
      student: portalStudent({ id: 'tobi', firstName: 'Tobi' }),
    });
    renderHome(api, { childId: 'tobi' });
    expect(
      await screen.findByRole('heading', { name: 'Tobi Okeke' })
    ).toBeInTheDocument();
    expect(api.portal.student).toHaveBeenCalledWith({
      params: { studentId: 'tobi' },
    });
  });

  it('asks the first child for an unlinked id', async () => {
    const api = apiWith();
    renderHome(api, { childId: 'someone-else' });
    await screen.findByRole('heading', { name: 'Ada Okeke' });
    expect(api.portal.student).toHaveBeenCalledWith({
      params: { studentId: 'ada' },
    });
  });

  it('says so when no children are linked', () => {
    renderHome(apiWith(), { me: portalMe({ children: [] }) });
    expect(screen.getByText('No children linked')).toBeInTheDocument();
  });
});

const WITH_FEES: Permission[] = ['student:readOwn', 'invoice:readOwn'];

const feesApi = (balanceMinor: number) => {
  const base = apiWith();
  return {
    ...base,
    portal: {
      ...base.portal,
      children: vi
        .fn()
        .mockResolvedValue([
          portalChild({ id: 'ada', firstName: 'Ada', balanceMinor }),
          portalChild({ id: 'tobi', firstName: 'Tobi', balanceMinor: 0 }),
        ]),
      familyStatement: vi.fn().mockResolvedValue(portalFamilyStatement()),
    },
  };
};

describe('Home fees tile', () => {
  it('shows what is owed for the selected child', async () => {
    renderHome(feesApi(6_000_000), { held: WITH_FEES });
    const tile = await screen.findByRole('button', { name: /Fees/ });
    expect(within(tile).getByText('₦60,000')).toBeInTheDocument();
    expect(within(tile).getByText('Owed')).toBeInTheDocument();
  });

  it('shows Paid up and what was paid ahead when in credit', async () => {
    renderHome(feesApi(-500_000), { held: WITH_FEES });
    const tile = await screen.findByRole('button', { name: /Fees/ });
    expect(within(tile).getByText('Paid up')).toBeInTheDocument();
    expect(within(tile).getByText('₦5,000 paid ahead')).toBeInTheDocument();
  });

  it('shows Paid up and Nothing owed at zero, with the other child’s balance ignored', async () => {
    renderHome(feesApi(0), { held: WITH_FEES, childId: 'tobi' });
    const tile = await screen.findByRole('button', { name: /Fees/ });
    expect(within(tile).getByText('Paid up')).toBeInTheDocument();
    expect(within(tile).getByText('Nothing owed')).toBeInTheDocument();
  });

  it('needs only the children list, so a failing family statement leaves it standing', async () => {
    const api = feesApi(6_000_000);
    api.portal.familyStatement.mockRejectedValue(new Error('boom'));
    renderHome(api, { held: WITH_FEES });
    const tile = await screen.findByRole('button', { name: /Fees/ });
    expect(within(tile).getByText('₦60,000')).toBeInTheDocument();
    expect(api.portal.familyStatement).not.toHaveBeenCalled();
  });

  it('opens Fees for the selected child', async () => {
    const onSeeFees = vi.fn();
    renderHome(feesApi(6_000_000), { held: WITH_FEES, onSeeFees });
    fireEvent.click(await screen.findByRole('button', { name: /Fees/ }));
    expect(onSeeFees).toHaveBeenCalledWith('ada');
  });

  it('is hidden, and asks for no balances, without invoice:readOwn', async () => {
    const api = feesApi(6_000_000);
    renderHome(api);
    await screen.findByText('Class teacher');
    expect(
      screen.queryByRole('button', { name: /Fees/ })
    ).not.toBeInTheDocument();
    expect(api.portal.children).not.toHaveBeenCalled();
    expect(api.portal.familyStatement).not.toHaveBeenCalled();
  });
});
