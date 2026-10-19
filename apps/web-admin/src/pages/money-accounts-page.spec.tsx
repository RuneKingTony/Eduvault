import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {
  CreateMoneyAccountInput,
  UpdateMoneyAccountInput,
} from '@eduvault/api-contract';
import { toast } from '@eduvault/ui';
import { testId } from '../test-api';
import { LEKKI, IKEJA, campus } from '../test-announcements';
import { cashBook, moneyAccount, moneyAccountList } from '../test-money';
import { ownerAccess, renderWithApi, starterAccess } from '../test-utils';
import { MoneyAccountsPage } from './money-accounts-page';

vi.mock('@eduvault/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@eduvault/ui')>()),
  toast: { success: vi.fn(), error: vi.fn() },
}));

const POS_ID = testId(0x2_60_01);
const CASH_BOX_ID = testId(0x2_60_02);
const ADJUSTMENT_ENTRY_ID = testId(0x2_60_11);
const OPENING_ENTRY_ID = testId(0x2_60_12);

const gtbank = moneyAccount();
const pos = moneyAccount({
  id: POS_ID,
  name: 'Moniepoint POS',
  kind: 'pos',
  campusId: LEKKI,
  campusName: 'Lekki',
  bankName: null,
  last4: null,
  ledgerCode: 1220,
  balanceMinor: 1_200_000,
});
const old = moneyAccount({
  id: CASH_BOX_ID,
  name: 'Old cash box',
  kind: 'cash',
  campusId: IKEJA,
  campusName: 'Ikeja',
  bankName: null,
  last4: null,
  ledgerCode: 1230,
  balanceMinor: 0,
  retiredAt: '2026-10-01T09:00:00.000Z',
});

function setup(
  options: {
    list?: ReturnType<typeof moneyAccountList>;
    access?: ReturnType<typeof ownerAccess>;
  } = {}
) {
  const list = options.list ?? moneyAccountList([gtbank, pos, old]);
  const api = {
    moneyAccounts: {
      list: vi.fn().mockResolvedValue(list),
      cashBook: vi.fn(({ params }: { params: { id: string } }) =>
        Promise.resolve(
          cashBook(list.items.find((item) => item.id === params.id) ?? gtbank)
        )
      ),
      create: vi.fn(({ body }: { body: CreateMoneyAccountInput }) =>
        Promise.resolve(
          moneyAccount({
            id: testId(0x2_60_21),
            name: body.name,
            kind: body.kind,
            bankName: body.bankName ?? null,
            last4: body.last4 ?? null,
            campusId: body.campusId,
            campusName: null,
            ledgerCode: 1240,
            balanceMinor: 0,
          })
        )
      ),
      update: vi.fn(
        ({
          params,
          body,
        }: {
          params: { id: string };
          body: UpdateMoneyAccountInput;
        }) => {
          const account =
            list.items.find((item) => item.id === params.id) ?? gtbank;
          return Promise.resolve({
            ...account,
            name: body.name ?? account.name,
            last4: body.last4 === undefined ? account.last4 : body.last4,
            retiredAt:
              body.retired === true ? '2026-10-12T09:00:00.000Z' : null,
          });
        }
      ),
    },
    campuses: {
      list: vi
        .fn()
        .mockResolvedValue([campus(LEKKI, 'Lekki'), campus(IKEJA, 'Ikeja')]),
    },
  };
  renderWithApi(<MoneyAccountsPage />, api, options.access ?? ownerAccess());
  return api;
}

let user: ReturnType<typeof userEvent.setup>;

beforeEach(() => {
  user = userEvent.setup();
});

describe('MoneyAccountsPage tiles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows a tile per account with kind, balance, campus and last 4, first one selected', async () => {
    const api = setup();
    expect(await screen.findByText('Moniepoint POS')).toBeInTheDocument();
    const first = screen.getByRole('button', { name: /GTBank current/ });
    expect(first).toHaveAttribute('aria-pressed', 'true');
    expect(within(first).getByText('₦95,000')).toBeInTheDocument();
    expect(within(first).getByText('Bank')).toBeInTheDocument();
    expect(
      within(first).getByText('School-wide · ending 4417')
    ).toBeInTheDocument();
    const second = screen.getByRole('button', { name: /Moniepoint POS/ });
    expect(second).toHaveAttribute('aria-pressed', 'false');
    expect(within(second).getByText('Lekki')).toBeInTheDocument();
    expect(within(second).getByText('POS')).toBeInTheDocument();
    const retired = screen.getByRole('button', { name: /Old cash box/ });
    expect(within(retired).getByText('Retired')).toBeInTheDocument();
    await waitFor(() => {
      expect(api.moneyAccounts.cashBook).toHaveBeenCalledWith({
        params: { id: gtbank.id },
        query: { page: 1 },
      });
    });
  });

  it('selects another tile and loads its cash book', async () => {
    const api = setup();
    await user.click(
      await screen.findByRole('button', { name: /Moniepoint POS/ })
    );
    expect(
      screen.getByRole('button', { name: /Moniepoint POS/ })
    ).toHaveAttribute('aria-pressed', 'true');
    expect(
      screen.getByRole('button', { name: /GTBank current/ })
    ).toHaveAttribute('aria-pressed', 'false');
    expect(
      await screen.findByText('Moniepoint POS cash book')
    ).toBeInTheDocument();
    expect(api.moneyAccounts.cashBook).toHaveBeenCalledWith({
      params: { id: pos.id },
      query: { page: 1 },
    });
  });

  it('says there are no movements for an empty cash book, and lists them otherwise', async () => {
    setup();
    expect(await screen.findByText('No movements yet')).toBeInTheDocument();
  });

  it('shows the cash book rows with money in, out and the running balance', async () => {
    const api = setup();
    api.moneyAccounts.cashBook.mockResolvedValue(
      cashBook(gtbank, {
        total: 2,
        items: [
          {
            entryId: ADJUSTMENT_ENTRY_ID,
            effectiveOn: '2026-09-20',
            reference: 'ADJ-2026-0001',
            kind: 'adjustment',
            memo: null,
            link: null,
            inMinor: 0,
            outMinor: 30_000,
            runningBalanceMinor: 9_470_000,
          },
          {
            entryId: OPENING_ENTRY_ID,
            effectiveOn: '2026-09-01',
            reference: 'OPEN-MA-1',
            kind: 'opening',
            memo: 'Opening balance',
            link: null,
            inMinor: 9_500_000,
            outMinor: 0,
            runningBalanceMinor: 9_500_000,
          },
        ],
      })
    );
    expect(await screen.findByText('ADJ-2026-0001')).toBeInTheDocument();
    expect(screen.getByText('OPEN-MA-1 · Opening balance')).toBeInTheDocument();
    expect(screen.getByText('₦94,700')).toBeInTheDocument();
    expect(screen.getAllByText('₦95,000').length).toBeGreaterThan(1);
  });
});

describe('MoneyAccountsPage callout and empty state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('says one school-wide account is hidden, in the singular', async () => {
    setup({ list: moneyAccountList([pos], { hiddenSchoolWideCount: 1 }) });
    expect(
      await screen.findByText(
        '1 school-wide account is hidden. Seeing it needs access to every campus.'
      )
    ).toBeInTheDocument();
  });

  it('says several are hidden, in the plural', async () => {
    setup({ list: moneyAccountList([pos], { hiddenSchoolWideCount: 3 }) });
    expect(
      await screen.findByText(
        '3 school-wide accounts are hidden. Seeing them needs access to every campus.'
      )
    ).toBeInTheDocument();
  });

  it('shows no callout when nothing is hidden', async () => {
    setup();
    await screen.findByText('Moniepoint POS');
    expect(screen.queryByText(/is hidden|are hidden/)).not.toBeInTheDocument();
  });

  it('shows an empty state with an Add button when no account is in scope', async () => {
    setup({ list: moneyAccountList([]) });
    expect(
      await screen.findByText('No money accounts in your scope')
    ).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Add account' })).toHaveLength(
      2
    );
  });
});

describe('MoneyAccountsPage permissions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('hides Add, Edit and Retire from someone who can only read', async () => {
    setup({ access: starterAccess('bursar') });
    await screen.findByText('GTBank current cash book');
    expect(
      screen.queryByRole('button', { name: 'Add account' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Edit' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Retire' })
    ).not.toBeInTheDocument();
  });

  it('shows Add, Edit and Retire to the owner, but no Retire on a retired account', async () => {
    setup();
    expect(
      await screen.findByRole('button', { name: 'Add account' })
    ).toBeInTheDocument();
    expect(
      await screen.findByRole('button', { name: 'Edit' })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retire' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Old cash box/ }));
    await screen.findByText('Old cash box cash book');
    expect(
      screen.queryByRole('button', { name: 'Retire' })
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
  });
});

const openAdd = async () => {
  await user.click(await screen.findByRole('button', { name: 'Add account' }));
  const sheet = await screen.findByRole('dialog');
  await within(sheet).findByLabelText('Name');
  return sheet;
};

describe('MoneyAccountsPage add form', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('refuses a blank name and last 4 that is not four digits, and sends nothing', async () => {
    const api = setup();
    const sheet = await openAdd();
    await user.click(
      await within(sheet).findByRole('button', { name: 'Add account' })
    );
    expect(
      await within(sheet).findByText('Give the account a name.')
    ).toBeInTheDocument();

    await user.type(within(sheet).getByLabelText('Name'), 'Zenith savings');
    await user.type(within(sheet).getByLabelText('Last 4 digits'), '12a');
    await user.click(
      within(sheet).getByRole('button', { name: 'Add account' })
    );
    expect(
      await within(sheet).findByText(
        'Enter the last 4 digits, or leave it blank.'
      )
    ).toBeInTheDocument();
    expect(api.moneyAccounts.create).not.toHaveBeenCalled();
  });

  it('shows the bank field for Bank only and offers School-wide to someone who sees every campus', async () => {
    setup();
    const sheet = await openAdd();
    expect(within(sheet).getByLabelText('Bank')).toBeInTheDocument();
    await user.selectOptions(within(sheet).getByLabelText('Kind'), 'pos');
    expect(within(sheet).queryByLabelText('Bank')).not.toBeInTheDocument();
    const campusOptions = within(within(sheet).getByLabelText('Campus'))
      .getAllByRole('option')
      .map((option) => option.textContent);
    expect(campusOptions).toEqual(['School-wide', 'Lekki', 'Ikeja']);
  });

  it('adds the account, toasts its ledger code and selects the new tile', async () => {
    const api = setup();
    const sheet = await openAdd();
    await user.type(within(sheet).getByLabelText('Name'), 'Zenith savings');
    await user.type(within(sheet).getByLabelText('Bank'), 'Zenith');
    await user.type(within(sheet).getByLabelText('Last 4 digits'), '9001');
    await user.click(
      within(sheet).getByRole('button', { name: 'Add account' })
    );
    await waitFor(() => {
      expect(api.moneyAccounts.create).toHaveBeenCalledWith({
        body: {
          name: 'Zenith savings',
          kind: 'bank',
          bankName: 'Zenith',
          last4: '9001',
          campusId: null,
        },
      });
    });
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(
        'Zenith savings added with ledger account 1240.'
      );
    });
  });
});

describe('MoneyAccountsPage edit and retire', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('edits the name and last 4 and says it saved', async () => {
    const api = setup();
    await user.click(await screen.findByRole('button', { name: 'Edit' }));
    const sheet = await screen.findByRole('dialog');
    await within(sheet).findByLabelText('Name');
    expect(within(sheet).queryByLabelText('Kind')).not.toBeInTheDocument();
    expect(within(sheet).queryByLabelText('Campus')).not.toBeInTheDocument();
    const name = within(sheet).getByLabelText('Name');
    await user.clear(name);
    await user.type(name, 'GTBank main');
    await user.clear(within(sheet).getByLabelText('Last 4 digits'));
    await user.click(
      within(sheet).getByRole('button', { name: 'Save changes' })
    );
    await waitFor(() => {
      expect(api.moneyAccounts.update).toHaveBeenCalledWith({
        params: { id: gtbank.id },
        body: { name: 'GTBank main', last4: null },
      });
    });
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('GTBank main saved.');
    });
  });

  it('retires after a confirmation and says the cash book is kept', async () => {
    const api = setup();
    await user.click(await screen.findByRole('button', { name: 'Retire' }));
    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByText('Retire GTBank current?')
    ).toBeInTheDocument();
    await user.click(
      within(dialog).getByRole('button', { name: 'Retire account' })
    );
    await waitFor(() => {
      expect(api.moneyAccounts.update).toHaveBeenCalledWith({
        params: { id: gtbank.id },
        body: { retired: true },
      });
    });
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(
        'GTBank current retired. Its cash book is kept.'
      );
    });
  });
});
