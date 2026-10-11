import { fireEvent, screen, within } from '@testing-library/react';
import type { SchoolYear } from '@eduvault/api-contract';
import { actingAccess, fakeAccess, renderWithApi } from '../test-utils';
import {
  currentCalendar,
  currentYear,
  nextYear,
  schoolYear,
  term,
} from '../test-calendar';
import { CalendarPage } from './calendar-page';

const NEXT_YEAR_STARTS =
  'A school year that has already started cannot be deleted.';

type Access = Parameters<typeof renderWithApi>[2];

interface SetupOptions {
  items?: SchoolYear[];
  props?: Partial<Parameters<typeof CalendarPage>[0]>;
  total?: number;
}

function setup(
  access?: Access,
  {
    items = [nextYear({ studentsWaiting: 357 }), currentYear()],
    props = {},
    total = items.length,
  }: SetupOptions = {}
) {
  const terms = {
    makeCurrent: vi.fn().mockResolvedValue(term({ id: 't2' })),
    update: vi.fn(),
  };
  const api = {
    schoolYears: {
      list: vi.fn().mockResolvedValue({ items, total }),
      create: vi.fn(),
      remove: vi.fn(),
    },
    calendar: { current: vi.fn().mockResolvedValue(currentCalendar()) },
    terms,
    holidays: { create: vi.fn(), remove: vi.fn() },
  };
  const handlers = {
    onPageChange: vi.fn(),
    onNewYearOpenChange: vi.fn(),
    onStartYear: vi.fn(),
  };
  renderWithApi(
    <CalendarPage page={1} newYearOpen={false} {...handlers} {...props} />,
    api,
    access
  );
  return { api, ...handlers };
}

const cardOf = async (name: string) => {
  const title = await screen.findByText(name, {
    selector: '[data-slot="card-title"]',
  });
  const card = title.closest<HTMLElement>('[data-slot="card"]');
  if (card === null) {
    throw new Error(`no card for ${name}`);
  }
  return within(card);
};

const WRITE_CONTROLS = [
  /^New school year$/,
  /^Add holiday$/,
  /^Make current/,
  /^Actions for /,
  /^More for /,
];

async function openMore(name: string) {
  const card = await cardOf(name);
  fireEvent.keyDown(card.getByRole('button', { name: `More for ${name}` }), {
    key: 'Enter',
  });
  return screen.findByRole('menuitem', { name: 'Delete school year' });
}

describe('CalendarPage', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-07T09:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('lists each year newest first with its dates and its terms', async () => {
    setup();
    const next = await cardOf('2027/2028');
    expect(next.getByText('6 Sep 2027 – 28 Jul 2028')).toBeInTheDocument();
    const now = await cardOf('2026/2027');
    expect(now.getByText('7 Sep 2026 – 23 Jul 2027')).toBeInTheDocument();
    expect(now.getByText('Current')).toBeInTheDocument();
    expect(now.getAllByRole('row')).toHaveLength(4);
    expect(now.getByText('67')).toBeInTheDocument();
    const titles = screen
      .getAllByText(/^20\d\d\/20\d\d$/, {
        selector: '[data-slot="card-title"]',
      })
      .map((title) => title.textContent);
    expect(titles).toEqual(['2027/2028', '2026/2027']);
  });

  it('shows the header copy and the info tooltip', async () => {
    setup();
    expect(
      await screen.findByText('Each school year and its terms.')
    ).toBeInTheDocument();
    fireEvent.focus(
      screen.getByRole('button', { name: 'About school years and terms' })
    );
    expect(
      (
        await screen.findAllByText(
          'Charges and payments belong to a term. One term is current at a time.'
        )
      ).length
    ).toBeGreaterThan(0);
  });

  it('lists the holidays of a term in a tooltip', async () => {
    setup();
    const now = await cardOf('2026/2027');
    const count = now.getByRole('button', { name: '3 days' });
    fireEvent.focus(count);
    expect(
      (
        await screen.findAllByText(
          '1 Oct 2026 Independence Day · 29 Oct 2026 Mid-term break · 30 Oct 2026 Mid-term break'
        )
      ).length
    ).toBeGreaterThan(0);
  });

  describe('write controls', () => {
    it('shows every one to the owner', async () => {
      setup();
      await cardOf('2026/2027');
      expect(
        screen.getByRole('button', { name: 'New school year' })
      ).toBeInTheDocument();
      expect(
        screen.getAllByRole('button', { name: 'Add holiday' })
      ).toHaveLength(2);
      expect(
        screen.getAllByRole('button', { name: 'Make current' })
      ).toHaveLength(3);
      expect(
        screen.getByRole('button', { name: 'More for 2026/2027' })
      ).toBeInTheDocument();
      expect(
        screen.getAllByRole('button', { name: 'Actions for First term' })
      ).toHaveLength(2);
    });

    it.each([
      [
        'a session:read-only member',
        fakeAccess({ permissions: { session: ['read'] } }),
      ],
      ['an acting super admin with no reason', actingAccess(false)],
    ])('shows none to %s', async (_label, access) => {
      setup(access);
      await cardOf('2026/2027');
      for (const name of WRITE_CONTROLS) {
        expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
      }
      expect(
        screen.queryByRole('button', { name: '3 days' })
      ).not.toBeInTheDocument();
      expect(screen.getByText('3 days')).toBeInTheDocument();
    });

    it('leaves out the rest for someone who can only set the current term', async () => {
      setup(fakeAccess({ permissions: { session: ['read', 'setCurrent'] } }));
      await cardOf('2026/2027');
      expect(
        screen.getAllByRole('button', { name: 'Make current' })
      ).toHaveLength(3);
      for (const name of [
        /^New school year$/,
        /^Add holiday$/,
        /^Actions for /,
      ]) {
        expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
      }
    });
  });

  it('has no Edit dates on an ended term', async () => {
    const ended = currentYear();
    ended.terms[0] = term({ ...ended.terms[0], ended: true });
    setup(undefined, { items: [ended] });
    await cardOf('2026/2027');
    expect(
      screen.queryByRole('button', { name: 'Actions for First term' })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Actions for Second term' })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: '3 days' })
    ).not.toBeInTheDocument();
  });

  it('offers Edit dates from a term row menu', async () => {
    setup();
    const now = await cardOf('2026/2027');
    fireEvent.keyDown(
      now.getByRole('button', { name: 'Actions for Second term' }),
      {
        key: 'Enter',
      }
    );
    fireEvent.click(
      await screen.findByRole('menuitem', { name: 'Edit dates' })
    );
    expect(
      await screen.findByText('Edit Second term, 2026/2027')
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Starts')).toHaveValue('2027-01-04');
  });

  describe('Delete school year', () => {
    it('is disabled with the reason in a tooltip for a started year', async () => {
      setup();
      const item = await openMore('2026/2027');
      expect(item).toHaveAttribute('aria-disabled', 'true');
      fireEvent.focus(item.parentElement!);
      expect(
        (await screen.findAllByText(NEXT_YEAR_STARTS)).length
      ).toBeGreaterThan(0);
    });

    it('opens the confirmation for a year that can go', async () => {
      setup();
      const item = await openMore('2027/2028');
      expect(item).not.toHaveAttribute('aria-disabled', 'true');
      fireEvent.click(item);
      expect(await screen.findByText('Delete 2027/2028?')).toBeInTheDocument();
      expect(
        screen.getByText(
          'This removes the school year, its three terms and any holidays in them. It cannot be undone.'
        )
      ).toBeInTheDocument();
    });
  });

  describe('Make current', () => {
    it('moves to another term of the current year at once', async () => {
      const { api } = setup();
      const now = await cardOf('2026/2027');
      const second = now.getByText('Second term').closest('tr')!;
      fireEvent.click(
        within(second).getByRole('button', { name: 'Make current' })
      );
      await vi.waitFor(() => {
        expect(api.terms.makeCurrent).toHaveBeenCalledWith({
          params: { id: 't2' },
        });
      });
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('opens the dialog for next year’s first term and warns about waiting students', async () => {
      const { api } = setup();
      const next = await cardOf('2027/2028');
      const first = next.getByText('First term').closest('tr')!;
      expect(
        within(next.getByText('Second term').closest('tr')!).queryByRole(
          'button',
          { name: 'Make current' }
        )
      ).not.toBeInTheDocument();
      fireEvent.click(
        within(first).getByRole('button', { name: 'Make current' })
      );
      const dialog = await screen.findByRole('dialog');
      expect(
        within(dialog).getByText(
          /357 students are not in a 2027\/2028 class yet/
        )
      ).toBeInTheDocument();
      expect(
        within(dialog).getByRole('button', { name: 'Make current anyway' })
      ).toBeInTheDocument();
      expect(api.terms.makeCurrent).not.toHaveBeenCalled();
    });

    it('sends a holder of enrollment:place to the Start dialog from the waiting callout', async () => {
      const { api, onStartYear } = setup();
      const next = await cardOf('2027/2028');
      const first = next.getByText('First term').closest('tr')!;
      fireEvent.click(
        within(first).getByRole('button', { name: 'Make current' })
      );
      const dialog = await screen.findByRole('dialog');
      fireEvent.click(
        within(dialog).getByRole('button', { name: 'Start 2027/2028 first' })
      );
      expect(onStartYear).toHaveBeenCalled();
      expect(api.terms.makeCurrent).not.toHaveBeenCalled();
    });
  });

  it('opens the Holidays dialog from the count and removes a holiday', async () => {
    const { api } = setup();
    api.holidays.remove.mockResolvedValue({
      id: 'h2',
      term: term({ schoolDays: 68 }),
    });
    const now = await cardOf('2026/2027');
    fireEvent.click(now.getByRole('button', { name: '3 days' }));
    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByText('Holidays in First term, 2026/2027')
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(/29 Oct 2026 · Mid-term break/)
    ).toBeInTheDocument();
    fireEvent.click(
      within(dialog).getByRole('button', {
        name: 'Remove Mid-term break, 29 Oct 2026',
      })
    );
    await vi.waitFor(() => {
      expect(api.holidays.remove).toHaveBeenCalledWith({
        params: { id: 'h2' },
      });
    });
  });

  it('preselects the current term in Add a holiday and lists only terms not yet ended', async () => {
    setup();
    const now = await cardOf('2026/2027');
    fireEvent.click(now.getByRole('button', { name: 'Add holiday' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText('Term')).toHaveValue('t1');
    expect(
      within(dialog)
        .getAllByRole('option')
        .map((option) => option.textContent)
    ).toEqual([
      '2026/2027 · First term',
      '2026/2027 · Second term',
      '2026/2027 · Third term',
      '2027/2028 · First term',
      '2027/2028 · Second term',
      '2027/2028 · Third term',
    ]);
    expect(within(dialog).getByLabelText('Date')).toHaveValue('2026-10-14');
  });

  it('shows the empty state with the create button for someone who can create', async () => {
    const { onNewYearOpenChange } = setup(undefined, { items: [] });
    expect(await screen.findByText('No school years yet')).toBeInTheDocument();
    expect(
      screen.getByText('Create the first school year to set up its terms.')
    ).toBeInTheDocument();
    const buttons = screen.getAllByRole('button', { name: 'New school year' });
    expect(buttons).toHaveLength(2);
    fireEvent.click(buttons[1]!);
    expect(onNewYearOpenChange).toHaveBeenCalledWith(true);
  });

  it('shows the empty state without any button to a read-only member', async () => {
    setup(fakeAccess({ permissions: { session: ['read'] } }), { items: [] });
    expect(await screen.findByText('No school years yet')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'New school year' })
    ).not.toBeInTheDocument();
  });

  it('opens the New school year dialog when asked to', async () => {
    setup(undefined, {
      items: [currentYear()],
      props: { newYearOpen: true },
    });
    expect(
      await screen.findByText('New school year', {
        selector: '[data-slot="dialog-title"]',
      })
    ).toBeInTheDocument();
  });

  it('pages with the numbered pager', async () => {
    const { onPageChange } = setup(undefined, {
      items: [currentYear()],
      total: 24,
    });
    await cardOf('2026/2027');
    expect(
      await screen.findByText('Showing 1 to 10 of 24')
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Page 3' }));
    expect(onPageChange).toHaveBeenCalledWith(3);
  });

  it('shows a skeleton while loading and the error when the list fails', async () => {
    const { api } = setup();
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
    await cardOf('2026/2027');
    expect(api.schoolYears.list).toHaveBeenCalledWith({ query: { page: 1 } });
  });

  it('renders the API error when the list fails', async () => {
    const queryError = new Error('The calendar is unavailable');
    const failing = {
      schoolYears: { list: vi.fn().mockRejectedValue(queryError) },
      calendar: { current: vi.fn().mockResolvedValue(currentCalendar()) },
    };
    renderWithApi(
      <CalendarPage
        page={1}
        newYearOpen={false}
        onPageChange={vi.fn()}
        onNewYearOpenChange={vi.fn()}
        onStartYear={vi.fn()}
      />,
      failing
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The calendar is unavailable'
    );
  });

  it('collapses a year that is neither current nor next', async () => {
    const old = schoolYear({
      id: 'y0',
      name: '2024/2025',
      startsOn: '2024-09-02',
      endsOn: '2025-07-25',
      deletable: { ok: false, reason: NEXT_YEAR_STARTS },
      terms: [term({ id: 'o1', schoolYearId: 'y0', ended: true })],
    });
    setup(undefined, { items: [currentYear(), old] });
    await cardOf('2026/2027');
    const closed = await cardOf('2024/2025');
    expect(closed.queryByRole('table')).not.toBeInTheDocument();
  });
});
