import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { testId } from '../test-api';
import { starterAccess } from '../test-utils';
import {
  ADA,
  NGOZI,
  balanceList,
  balanceRow,
  recordingOptions,
  renderPayments,
} from '../test-payments';
import { WhoOwesPage } from './who-owes-page';

const BAYO = testId(0x2_00_01);
const DAVID = testId(0x2_00_02);
const TOBI_ADE = testId(0x2_00_03);

function setup(
  options: {
    list?: ReturnType<typeof balanceList>;
    search?: Parameters<typeof WhoOwesPage>[0]['search'];
    access?: ReturnType<typeof starterAccess>;
  } = {}
) {
  const api = {
    studentAccounts: {
      balances: vi.fn().mockResolvedValue(options.list ?? balanceList()),
    },
    payments: {
      recordingOptions: vi.fn().mockResolvedValue(recordingOptions()),
    },
  };
  const onSearchChange = vi.fn();
  renderPayments(
    <WhoOwesPage
      search={options.search ?? {}}
      onSearchChange={onSearchChange}
    />,
    api,
    { path: '/finance/accounts', access: options.access }
  );
  return { api, onSearchChange };
}

describe('WhoOwesPage', () => {
  it('shows the three tiles with the scope note and the term’s receipts', async () => {
    setup();

    expect(await screen.findByText('Total owed')).toBeVisible();
    expect(screen.getByText('₦315,000')).toBeVisible();
    expect(screen.getByText('Lekki campus')).toBeVisible();
    expect(screen.getByText('Students owing')).toBeVisible();
    expect(screen.getByText('out of 12 students')).toBeVisible();
    expect(screen.getByText('Received this term')).toBeVisible();
    expect(screen.getByText('₦400,000')).toBeVisible();
    expect(screen.getByText('5 payments')).toBeVisible();
    expect(
      screen.getByRole('link', { name: /Received this term/ })
    ).toHaveAttribute('href', expect.stringContaining('/finance/payments'));
  });

  it('leaves the Received tile out when the API omits the received figures', async () => {
    setup({
      list: balanceList([balanceRow()], {
        summary: {
          totalOwedMinor: 18_000_000,
          studentsOwing: 1,
          studentsInScope: 12,
          scopeNote: 'Lekki campus',
        },
      }),
    });

    expect(await screen.findByText('Total owed')).toBeVisible();
    expect(screen.queryByText('Received this term')).not.toBeInTheDocument();
  });

  it('sets the filter back to Owing from the first two tiles', async () => {
    const { onSearchChange } = setup({ search: { filter: 'all', page: 3 } });
    fireEvent.click(await screen.findByRole('button', { name: /Total owed/ }));
    expect(onSearchChange).toHaveBeenCalledWith({
      filter: undefined,
      page: undefined,
    });
  });

  it('offers the five filters, Owing first', async () => {
    setup();
    const show = await screen.findByLabelText('Show');
    expect(show).toHaveValue('owing');
    expect(
      within(show)
        .getAllByRole('option')
        .map((option) => option.textContent)
    ).toEqual([
      'Owing',
      'Owing: current students',
      'Owing: left or graduated',
      'Paid up',
      'Everyone',
    ]);
  });

  it('changes the filter and the search and goes back to the first page', async () => {
    const { onSearchChange } = setup({ search: { page: 2 } });
    fireEvent.change(await screen.findByLabelText('Show'), {
      target: { value: 'owing_gone' },
    });
    expect(onSearchChange).toHaveBeenCalledWith({
      page: undefined,
      filter: 'owing_gone',
    });
    fireEvent.change(screen.getByLabelText('Search students'), {
      target: { value: 'ada' },
    });
    expect(onSearchChange).toHaveBeenLastCalledWith({
      page: undefined,
      q: 'ada',
    });
  });

  it('lists the student, class, guardian, owing, paid and total', async () => {
    setup();
    const cells = within(await screen.findByRole('row', { name: /Ada Okeke/ }));
    expect(cells.getByText('GF-0001')).toBeVisible();
    expect(cells.getByText('JSS 1 Gold')).toBeVisible();
    expect(cells.getByText('Ngozi Okeke')).toBeVisible();
    expect(cells.getByText('08012345678')).toBeVisible();
    expect(cells.getByText('₦180,000')).toBeVisible();
    expect(cells.getByText('₦40,000')).toBeVisible();
    expect(cells.getByText('₦220,000')).toBeVisible();
    expect(cells.getByRole('link', { name: /Ada Okeke/ })).toHaveAttribute(
      'href',
      expect.stringContaining(`/finance/accounts/${ADA}`)
    );
  });

  it('marks a leaver after their number and shows credit and paid-up pills', async () => {
    setup({
      list: balanceList([
        balanceRow({
          lifecycle: 'left',
          admissionNumber: 'GF-0002',
          name: 'Bayo Lawal',
          studentId: BAYO,
        }),
        balanceRow({
          balanceMinor: -500_000,
          name: 'David Eze',
          studentId: DAVID,
        }),
        balanceRow({ balanceMinor: 0, name: 'Tobi Ade', studentId: TOBI_ADE }),
      ]),
    });
    expect(await screen.findByText('GF-0002 · left')).toBeVisible();
    expect(
      within(screen.getByRole('row', { name: /David Eze/ })).getByText(
        '₦5,000 extra paid'
      )
    ).toBeVisible();
    expect(
      within(screen.getByRole('row', { name: /Tobi Ade/ })).getByText('Paid up')
    ).toBeVisible();
  });

  it('shows a dash for a student with no guardian or class', async () => {
    setup({
      list: balanceList([balanceRow({ guardian: null, className: null })]),
    });
    await screen.findByText('Ada Okeke');
    expect(screen.getAllByText('—')).toHaveLength(2);
  });

  it('shows Record payment only to someone who can record, and only for a student who owes', async () => {
    setup({
      access: starterAccess('bursar'),
      list: balanceList([
        balanceRow(),
        balanceRow({ studentId: TOBI_ADE, name: 'Tobi Ade', balanceMinor: 0 }),
      ]),
    });
    expect(
      await screen.findAllByRole('button', { name: /Record payment for/ })
    ).toHaveLength(1);
  });

  it('hides Record payment from a reader', async () => {
    setup({ access: starterAccess('administrator') });
    await screen.findByText('Ada Okeke');
    expect(
      screen.queryByRole('button', { name: /Record payment for/ })
    ).not.toBeInTheDocument();
  });

  it('opens the sheet in place, prefilled for the paying guardian', async () => {
    setup({ access: starterAccess('bursar') });
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Record payment for Ada Okeke',
      })
    );

    expect(
      await screen.findByRole('heading', { name: 'Record a payment' })
    ).toBeVisible();
    await waitFor(() => {
      expect(screen.getByLabelText('Payer')).toHaveValue(NGOZI);
    });
  });

  it('says Nobody owes fees when the Owing filter is empty', async () => {
    setup({ list: balanceList([], { total: 0 }) });
    expect(await screen.findByText('Nobody owes fees')).toBeVisible();
    expect(
      screen.getByText('Every student you look after is paid up.')
    ).toBeVisible();
  });

  it('says No students match for another filter or a search', async () => {
    setup({ list: balanceList([], { total: 0 }), search: { filter: 'paid' } });
    expect(await screen.findByText('No students match')).toBeVisible();
  });

  it('leads the Fees tabs with Who owes', async () => {
    setup();
    const tabs = await screen.findByRole('navigation', { name: 'Fees' });
    expect(within(tabs).getAllByRole('link')[0]).toHaveTextContent('Who owes');
  });
});
