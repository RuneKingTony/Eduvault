import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import type {
  JournalList,
  LedgerAccount,
  LedgerAccountList,
} from '@eduvault/api-contract';
import { toast } from '@eduvault/ui';
import { LEKKI, campus } from '../test-announcements';
import { journalEntry, ledgerAccount } from '../test-money';
import { ownerAccess, renderWithApi, starterAccess } from '../test-utils';
import {
  MoneyCategoriesPage,
  type CategoriesTab,
} from './money-categories-page';

vi.mock('@eduvault/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@eduvault/ui')>()),
  toast: { success: vi.fn(), error: vi.fn() },
}));

const FEE_INCOME = '00000000-0000-4000-8000-0000000000e1';

const chart: LedgerAccount[] = [
  ledgerAccount({
    id: '00000000-0000-4000-8000-0000000000e2',
    code: 1100,
    name: 'Fees owed to the school',
    type: 'asset',
    systemKey: 'fees_receivable',
    balanceMinor: 2_700_000,
  }),
  ledgerAccount({ balanceMinor: 2_000_000 }),
  ledgerAccount({
    id: '00000000-0000-4000-8000-0000000000e3',
    code: 4010,
    name: 'Tuition',
    parentId: FEE_INCOME,
    systemKey: null,
    balanceMinor: 2_000_000,
  }),
  ledgerAccount({
    id: '00000000-0000-4000-8000-0000000000e4',
    code: 5000,
    name: 'Discounts given',
    type: 'expense',
    systemKey: 'discounts_given',
    balanceMinor: -150_000,
  }),
];

const chartList = (
  items: LedgerAccount[],
  scoped = false
): LedgerAccountList => ({ currency: 'NGN', scoped, items });

const journalList = (entries = [journalEntry()]): JournalList => ({
  currency: 'NGN',
  items: entries,
  total: entries.length,
});

function setup(
  options: {
    items?: LedgerAccount[];
    scoped?: boolean;
    tab?: CategoriesTab;
    access?: ReturnType<typeof ownerAccess>;
    journal?: JournalList;
  } = {}
) {
  const onTabChange = vi.fn();
  const api = {
    ledgerAccounts: {
      list: vi
        .fn()
        .mockResolvedValue(chartList(options.items ?? chart, options.scoped)),
      create: vi.fn().mockResolvedValue(
        ledgerAccount({
          code: 4090,
          name: 'Sports',
          parentId: FEE_INCOME,
          systemKey: null,
        })
      ),
    },
    journal: {
      list: vi.fn().mockResolvedValue(options.journal ?? journalList()),
    },
    campuses: { list: vi.fn().mockResolvedValue([campus(LEKKI, 'Lekki')]) },
  };
  renderWithApi(
    <MoneyCategoriesPage
      tab={options.tab ?? 'categories'}
      onTabChange={onTabChange}
    />,
    api,
    options.access ?? ownerAccess()
  );
  return { api, onTabChange };
}

describe('MoneyCategoriesPage chart', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists each category with its code, plain type word and natural-sign balance', async () => {
    setup();
    expect(
      await screen.findByText('Fees owed to the school')
    ).toBeInTheDocument();
    const row = screen.getByRole('row', { name: /Fees owed to the school/ });
    expect(within(row).getByText('1100')).toBeInTheDocument();
    expect(within(row).getByText('Money held')).toBeInTheDocument();
    expect(within(row).getByText('₦27,000')).toBeInTheDocument();
    const discounts = screen.getByRole('row', { name: /Discounts given/ });
    expect(within(discounts).getByText('Cost')).toBeInTheDocument();
    expect(within(discounts).getByText('−₦1,500')).toBeInTheDocument();
  });

  it('indents a child under its parent and locks only the built-in rows', async () => {
    setup();
    const tuition = await screen.findByRole('row', { name: /Tuition/ });
    expect(within(tuition).getByText('└')).toBeInTheDocument();
    expect(
      within(tuition).queryByRole('button', { name: 'Built in' })
    ).not.toBeInTheDocument();
    const fees = screen.getByRole('row', { name: /Fee income/ });
    expect(
      within(fees).getByRole('button', { name: 'Built in' })
    ).toBeInTheDocument();
    expect(within(fees).queryByText('└')).not.toBeInTheDocument();
  });

  it('shows 10 rows a page and pages the rest', async () => {
    const many = Array.from({ length: 12 }, (_, index) =>
      ledgerAccount({
        id: `00000000-0000-4000-8000-00000000${String(index).padStart(4, '0')}`,
        code: 6000 + index * 10,
        name: `Category ${index + 1}`,
        systemKey: null,
      })
    );
    setup({ items: many });
    expect(await screen.findByText('Category 1')).toBeInTheDocument();
    expect(screen.getByText('Category 10')).toBeInTheDocument();
    expect(screen.queryByText('Category 11')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Page 2' }));
    expect(await screen.findByText('Category 11')).toBeInTheDocument();
    expect(screen.queryByText('Category 1')).not.toBeInTheDocument();
  });

  it('shows the plain header and no scope callout for someone who sees everything', async () => {
    setup();
    expect(
      await screen.findByRole('columnheader', { name: 'Balance' })
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/campus only|campuses only/)
    ).not.toBeInTheDocument();
  });

  it('names the campus and changes the balance header for a scoped member', async () => {
    setup({ scoped: true, access: starterAccess('bursar') });
    expect(
      await screen.findByText('Showing Lekki campus only.')
    ).toBeInTheDocument();
    expect(
      screen.getByRole('columnheader', { name: 'Balance (your campuses)' })
    ).toBeInTheDocument();
  });
});

describe('MoneyCategoriesPage adding a fee category', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('hides the button from someone without ledger:manageAccounts', async () => {
    setup({ access: starterAccess('bursar') });
    await screen.findByText('Tuition');
    expect(
      screen.queryByRole('button', { name: 'Add a fee category' })
    ).not.toBeInTheDocument();
  });

  it('offers only Fee income as the parent and refuses a blank name', async () => {
    const { api } = setup();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Add a fee category' })
    );
    const dialog = await screen.findByRole('dialog');
    const options = within(within(dialog).getByLabelText('Under')).getAllByRole(
      'option'
    );
    expect(options.map((option) => option.textContent)).toEqual([
      '4000 Fee income',
    ]);
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Add category' })
    );
    expect(
      await within(dialog).findByText('Give the category a name.')
    ).toBeInTheDocument();
    expect(api.ledgerAccounts.create).not.toHaveBeenCalled();
  });

  it('adds the category and says it was added as a fee type', async () => {
    const { api } = setup();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Add a fee category' })
    );
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Name'), {
      target: { value: 'Sports' },
    });
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Add category' })
    );
    await waitFor(() => {
      expect(api.ledgerAccounts.create).toHaveBeenCalledWith({
        body: { parentId: FEE_INCOME, name: 'Sports' },
      });
    });
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Sports added as a fee type.');
    });
  });
});

describe('MoneyCategoriesPage tabs and journal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('asks to switch to the journal when its tab is clicked', async () => {
    const { onTabChange } = setup();
    fireEvent.mouseDown(await screen.findByRole('tab', { name: 'Journal' }));
    expect(onTabChange).toHaveBeenCalledWith('journal');
  });

  it('lists journal entries and expands one to its lines, with School-wide for a null campus', async () => {
    const { api } = setup({ tab: 'journal' });
    const entry = await screen.findByRole('button', {
      name: /Opening balance/,
    });
    expect(within(entry).getByText('₦12,000')).toBeInTheDocument();
    fireEvent.click(entry);
    expect(
      await screen.findByText('1100 Fees owed to the school')
    ).toBeInTheDocument();
    expect(screen.getByText('Bola Adeyemi')).toBeInTheDocument();
    expect(screen.getByText('School-wide')).toBeInTheDocument();
    expect(screen.getByText('Lekki')).toBeInTheDocument();
    expect(api.journal.list).toHaveBeenCalledWith({
      query: { from: undefined, to: undefined, kind: undefined, page: 1 },
    });
  });

  it('says there are no entries yet', async () => {
    setup({ tab: 'journal', journal: journalList([]) });
    expect(await screen.findByText('No entries yet')).toBeInTheDocument();
  });

  it('filters by date and kind', async () => {
    const { api } = setup({ tab: 'journal' });
    await screen.findByRole('button', { name: /Opening balance/ });
    fireEvent.change(screen.getByLabelText('From'), {
      target: { value: '2026-09-01' },
    });
    fireEvent.change(screen.getByLabelText('Kind'), {
      target: { value: 'payment' },
    });
    await waitFor(() => {
      expect(api.journal.list).toHaveBeenLastCalledWith({
        query: { from: '2026-09-01', to: undefined, kind: 'payment', page: 1 },
      });
    });
  });

  it('says so, and asks nothing, when From is after To', async () => {
    const { api } = setup({ tab: 'journal' });
    await screen.findByRole('button', { name: /Opening balance/ });
    api.journal.list.mockClear();
    fireEvent.change(screen.getByLabelText('From'), {
      target: { value: '2026-10-02' },
    });
    fireEvent.change(screen.getByLabelText('To'), {
      target: { value: '2026-10-01' },
    });
    expect(
      await screen.findByText('The From date can’t be after the To date.')
    ).toBeInTheDocument();
    expect(api.journal.list).not.toHaveBeenCalledWith({
      query: expect.objectContaining({ from: '2026-10-02', to: '2026-10-01' }),
    });
  });
});
