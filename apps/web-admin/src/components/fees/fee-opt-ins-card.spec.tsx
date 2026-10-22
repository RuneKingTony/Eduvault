import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '@eduvault/api-contract';
import { toast } from '@eduvault/ui';
import { ADA, BUS, CHIDI, TERM_1, feesApi, optInRoster } from '../../test-fees';
import { ownerAccess, renderWithApi, starterAccess } from '../../test-utils';
import { FeeOptInsCard } from './fee-opt-ins-card';

vi.mock('@eduvault/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@eduvault/ui')>()),
  toast: { success: vi.fn(), error: vi.fn() },
}));

function setup(
  options: Parameters<typeof feesApi>[0] = {},
  access = ownerAccess()
) {
  const api = feesApi(options);
  renderWithApi(
    <FeeOptInsCard feeTypeId={BUS.id} feeTypeName={BUS.name} termId={TERM_1} />,
    api,
    access
  );
  return { api };
}

describe('FeeOptInsCard', () => {
  let user: ReturnType<typeof userEvent.setup>;

  beforeEach(() => {
    vi.clearAllMocks();
    user = userEvent.setup();
  });

  it('lists the students with their status under the card copy', async () => {
    const { api } = setup();
    expect(await screen.findByText('Who takes School bus')).toBeInTheDocument();
    expect(
      await screen.findByText(
        'Opted-in students are billed School bus from the next round of charges. Opt-ins last the whole school year (2026/2027).'
      )
    ).toBeInTheDocument();
    const ada = screen.getByRole('row', { name: /Ada Okeke/ });
    expect(within(ada).getByText('GF-0123')).toBeInTheDocument();
    expect(within(ada).getByText('Lekki')).toBeInTheDocument();
    expect(within(ada).getByText('Opted in')).toBeInTheDocument();
    expect(
      within(screen.getByRole('row', { name: /Chidi Eze/ })).getByText(
        'Not opted in'
      )
    ).toBeInTheDocument();
    expect(api.feeOptIns.list).toHaveBeenCalledWith({
      params: { feeTypeId: BUS.id },
      query: { termId: TERM_1, q: '' },
    });
  });

  it('opts every listed student in after select all and toasts the count', async () => {
    const { api } = setup();
    await user.click(
      await screen.findByRole('checkbox', { name: 'Select all' })
    );
    expect(screen.getByText('2 selected')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Opt in' }));
    await waitFor(() => {
      expect(api.feeOptIns.set).toHaveBeenCalledWith({
        params: { feeTypeId: BUS.id },
        body: { termId: TERM_1, studentIds: [ADA, CHIDI], optedIn: true },
      });
    });
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(
        '2 students now take School bus from the next round of charges.'
      );
    });
    expect(await screen.findByText('0 selected')).toBeInTheDocument();
  });

  it('opts one picked student out', async () => {
    const { api } = setup();
    await user.click(
      await screen.findByRole('checkbox', { name: 'Select Ada Okeke' })
    );
    await user.click(screen.getByRole('button', { name: 'Opt out' }));
    await waitFor(() => {
      expect(api.feeOptIns.set).toHaveBeenCalledWith({
        params: { feeTypeId: BUS.id },
        body: { termId: TERM_1, studentIds: [ADA], optedIn: false },
      });
    });
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(
        '1 student no longer takes School bus.'
      );
    });
  });

  it('toasts that nothing changed when every student already took the fee', async () => {
    const { api } = setup();
    api.feeOptIns.set.mockResolvedValue({
      feeTypeId: BUS.id,
      optedIn: true,
      changed: 0,
      unchanged: 2,
    });
    await user.click(
      await screen.findByRole('checkbox', { name: 'Select all' })
    );
    await user.click(screen.getByRole('button', { name: 'Opt in' }));
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(
        'No change: the selected students already take School bus.'
      );
    });
  });

  it('keeps the selection and toasts a refusal', async () => {
    const { api } = setup();
    api.feeOptIns.set.mockRejectedValue(
      new ApiError(400, {
        code: 'BadRequest',
        message: 'That student cannot take this fee.',
      })
    );
    await user.click(
      await screen.findByRole('checkbox', { name: 'Select all' })
    );
    await user.click(screen.getByRole('button', { name: 'Opt in' }));
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        'That student cannot take this fee.'
      );
    });
    expect(screen.getByText('2 selected')).toBeInTheDocument();
  });

  it('disables Opt in and Opt out with nothing selected', async () => {
    setup();
    expect(
      await screen.findByRole('button', { name: 'Opt in' })
    ).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Opt out' })).toBeDisabled();
  });

  it('searches the list through the server', async () => {
    const { api } = setup();
    await user.type(await screen.findByLabelText('Search students'), 'chidi');
    await waitFor(() => {
      expect(api.feeOptIns.list).toHaveBeenCalledWith({
        params: { feeTypeId: BUS.id },
        query: { termId: TERM_1, q: 'chidi' },
      });
    });
  });

  it('keeps the search box while a cleared search reloads the full list', async () => {
    const { api } = setup();
    api.feeOptIns.list.mockImplementation(
      ({ query }: { query: { q: string } }) =>
        Promise.resolve(
          query.q === 'zzz'
            ? optInRoster({ items: [], total: 0 })
            : optInRoster()
        )
    );
    const search = await screen.findByLabelText('Search students');
    await user.type(search, 'zzz');
    expect(
      await screen.findByText('No student matches that search')
    ).toBeInTheDocument();
    await user.clear(search);
    expect(screen.getByLabelText('Search students')).toBe(search);
    expect(
      screen.queryByText('No student can take School bus this school year')
    ).not.toBeInTheDocument();
    expect(await screen.findByText('Ada Okeke')).toBeInTheDocument();
  });

  it('says how many of the students it shows when the list is capped', async () => {
    setup({ optIns: optInRoster({ total: 340 }) });
    expect(
      await screen.findByText(
        'Showing 2 of 340 students. Search to narrow the list.'
      )
    ).toBeInTheDocument();
  });

  it('shows the list without checkboxes or buttons to a read-only member', async () => {
    setup({}, starterAccess('administrator'));
    expect(await screen.findByText('Ada Okeke')).toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Opt in' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Opt out' })
    ).not.toBeInTheDocument();
  });

  it('shows the empty state when no student can take the fee', async () => {
    setup({ optIns: optInRoster({ items: [], total: 0 }) });
    expect(
      await screen.findByText('No student can take School bus this school year')
    ).toBeInTheDocument();
    expect(
      screen.getByText('Add an optional School bus fee to offer it.')
    ).toBeInTheDocument();
  });

  it('shows an error in place of the list when it fails', async () => {
    const api = feesApi();
    api.feeOptIns.list.mockRejectedValue(
      new ApiError(500, {
        code: 'UnknownError',
        message: 'The list is down',
      })
    );
    renderWithApi(
      <FeeOptInsCard
        feeTypeId={BUS.id}
        feeTypeName={BUS.name}
        termId={TERM_1}
      />,
      api
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The list is down'
    );
  });
});
