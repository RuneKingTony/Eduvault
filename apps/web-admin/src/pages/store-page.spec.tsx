import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { toast } from '@eduvault/ui';
import {
  ITEM_PRICE_BELOW_COST_MESSAGE,
  type ItemList,
} from '@eduvault/api-contract';
import { toPermissionMap } from '@eduvault/policy';
import { NO_ACCOUNT_ACCESS_MESSAGE } from '../components/store/store-text';
import { SHOW_COSTS_KEY } from '../components/store/use-show-costs';
import { IKEJA, LEKKI } from '../test-members';
import {
  BANK_ACCOUNT_ID,
  LEVEL_ID,
  SHIRT_ID,
  deliveryList,
  itemList,
  moneyAccountList,
  openingDelivery,
  recordedDelivery,
  shirt,
  storeSummary,
  textbook,
  tie,
} from '../test-store';
import {
  actingAccess,
  fakeAccess,
  ownerAccess,
  renderWithApi,
  starterAccess,
} from '../test-utils';
import { StorePage } from './store-page';

vi.mock('@eduvault/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@eduvault/ui')>()),
  toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn() },
}));

type Search = Parameters<typeof StorePage>[0]['search'];

const readerAccess = () =>
  fakeAccess({
    roles: ['custom'],
    permissions: toPermissionMap(['store:read']),
    campusScope: 'all',
  });

function setup(
  options: {
    access?: ReturnType<typeof ownerAccess>;
    search?: Search;
    campuses?: (typeof LEKKI)[];
    items?: (args: { query: { page?: number } }) => Promise<ItemList>;
  } = {}
) {
  const campuses = options.campuses ?? [LEKKI, IKEJA];
  const api = {
    campuses: { list: vi.fn().mockResolvedValue(campuses) },
    classLevels: {
      list: vi.fn().mockResolvedValue([{ id: LEVEL_ID, name: 'JSS 1' }]),
    },
    moneyAccounts: { list: vi.fn().mockResolvedValue(moneyAccountList()) },
    store: {
      summary: vi.fn().mockResolvedValue(storeSummary()),
      items: vi.fn(
        options.items ??
          (() =>
            Promise.resolve(
              itemList([shirt(campuses), tie(campuses), textbook(campuses)])
            ))
      ),
      deliveries: vi
        .fn()
        .mockResolvedValue(
          deliveryList([openingDelivery(), recordedDelivery()])
        ),
      createItem: vi.fn(),
      updateItem: vi.fn(),
      recordDelivery: vi.fn().mockResolvedValue(recordedDelivery()),
    },
  };
  const onSearchChange = vi.fn();
  renderWithApi(
    <StorePage search={options.search ?? {}} onSearchChange={onSearchChange} />,
    api,
    options.access ?? ownerAccess()
  );
  return { api, onSearchChange };
}

const rowOf = (text: string) =>
  within(screen.getByText(text).closest('tr') as HTMLElement);

describe('StorePage', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('describes a Lekki-only scope, with no Campus select and one In stock column', async () => {
    setup({
      access: starterAccess('bursar'),
      campuses: [LEKKI],
    });

    expect(
      await screen.findByText('Books and uniforms · Lekki campus')
    ).toBeVisible();
    expect(screen.queryByLabelText('Campus')).not.toBeInTheDocument();
    expect(
      await screen.findByRole('columnheader', { name: 'In stock' })
    ).toBeVisible();
    expect(
      screen.queryByRole('columnheader', { name: 'Ikeja' })
    ).not.toBeInTheDocument();
  });

  it('gives the owner a Campus select and one stock column per campus, with 0 in the destructive colour', async () => {
    setup();

    expect(
      await screen.findByText('Books and uniforms · All campuses')
    ).toBeVisible();
    expect(await screen.findByLabelText('Campus')).toBeVisible();
    expect(
      await screen.findByRole('columnheader', { name: 'Lekki' })
    ).toBeVisible();
    expect(screen.getByRole('columnheader', { name: 'Ikeja' })).toBeVisible();
    expect(
      screen.queryByRole('columnheader', { name: 'In stock' })
    ).not.toBeInTheDocument();

    const cells = rowOf('School shirt').getAllByRole('cell');
    expect(cells[2]).toHaveTextContent('12');
    expect(cells[3]).toHaveTextContent('0');
    expect(cells[3]).toHaveClass('text-destructive');
    expect(cells[2]).not.toHaveClass('text-destructive');
  });

  it('masks the Stock value and the Cost column until Show costs is on', async () => {
    setup();

    expect(await screen.findByText('School shirt')).toBeVisible();
    expect(await screen.findByText(/low or out/)).toBeVisible();
    expect(screen.queryByText('₦70,000')).not.toBeInTheDocument();
    expect(screen.queryByText('₦3,500')).not.toBeInTheDocument();
    expect(rowOf('School shirt').getByLabelText('Hidden')).toHaveTextContent(
      '₦ ••••'
    );

    fireEvent.click(screen.getByRole('switch', { name: 'Show costs' }));

    expect(await screen.findByText('₦70,000')).toBeVisible();
    expect(rowOf('School shirt').getByText('₦3,500')).toBeVisible();
    expect(localStorage.getItem(SHOW_COSTS_KEY)).toBe('true');
  });

  it('masks the delivery Cost on the Deliveries tab and shows it once Show costs is on', async () => {
    setup({ search: { tab: 'deliveries' } });

    expect(await screen.findByText('Adebayo Uniforms Ltd')).toBeVisible();
    const row = rowOf('DEL-2026-0001');
    expect(row.getByLabelText('Hidden')).toHaveTextContent('₦ ••••');
    expect(screen.getByText('Stock held at go-live')).toBeVisible();
    expect(row.getByText('GTBank current')).toBeVisible();

    fireEvent.click(screen.getByRole('switch', { name: 'Show costs' }));

    expect(await screen.findByText('₦35,000')).toBeVisible();
    expect(screen.getByText('₦100,000')).toBeVisible();
  });

  it('shows the Low stock badge at the low level, and turns the low filter on from the Stock value tile', async () => {
    const { onSearchChange } = setup();

    expect(await screen.findByText('School tie')).toBeVisible();
    expect(rowOf('School tie').getByText('Low stock')).toBeVisible();
    expect(rowOf('Mathematics').getByText('In stock')).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: /Stock value/ }));

    expect(onSearchChange).toHaveBeenCalledWith({
      tab: undefined,
      low: 1,
      page: undefined,
    });
  });

  it('filters to low or out of stock items from the switch and asks the API for them', async () => {
    const { api, onSearchChange } = setup();

    fireEvent.click(
      await screen.findByRole('switch', { name: 'Low or out of stock (2)' })
    );
    expect(onSearchChange).toHaveBeenCalledWith({
      low: 1,
      page: undefined,
    });
    await waitFor(() => {
      expect(api.store.items).toHaveBeenCalled();
    });
  });

  it('asks for lowOnly when the address carries the low filter', async () => {
    const { api } = setup({ search: { low: 1 } });

    await waitFor(() => {
      expect(api.store.items).toHaveBeenCalledWith({
        query: expect.objectContaining({ lowOnly: true }),
      });
    });
    expect(
      await screen.findByRole('switch', { name: 'Low or out of stock (2)' })
    ).toBeChecked();
  });

  it('refuses a selling price below cost when adding an item', async () => {
    const { api } = setup({ search: { add: 1 } });

    fireEvent.change(await screen.findByLabelText('Name'), {
      target: { value: 'School cardigan' },
    });
    fireEvent.change(screen.getByLabelText('Cost price (₦)'), {
      target: { value: '5000' },
    });
    fireEvent.change(screen.getByLabelText('Selling price (₦)'), {
      target: { value: '3000' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add item' }));

    expect(
      await screen.findByText(ITEM_PRICE_BELOW_COST_MESSAGE)
    ).toBeVisible();
    expect(api.store.createItem).not.toHaveBeenCalled();
  });

  it('records a delivery from a bank account and toasts the number, total and account', async () => {
    const { api, onSearchChange } = setup({ search: { deliver: 1 } });

    fireEvent.change(await screen.findByLabelText('Supplier'), {
      target: { value: 'Adebayo Uniforms Ltd' },
    });
    fireEvent.change(
      await screen.findByLabelText('Quantity for School shirt, Size 12'),
      { target: { value: '10' } }
    );
    fireEvent.click(screen.getByRole('button', { name: 'Record delivery' }));

    await waitFor(() => {
      expect(api.store.recordDelivery).toHaveBeenCalledWith({
        body: expect.objectContaining({
          campusId: LEKKI.id,
          supplierName: 'Adebayo Uniforms Ltd',
          moneyAccountId: BANK_ACCOUNT_ID,
          lines: [{ itemId: SHIRT_ID, quantity: 10, unitCostMinor: 350_000 }],
        }),
      });
    });
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(
        'DEL-2026-0001 recorded: ₦35,000 paid from GTBank current.'
      );
    });
    expect(onSearchChange).toHaveBeenCalledWith({
      campus: undefined,
      tab: 'deliveries',
    });
  });

  it('masks the delivery sheet total until Show costs is on', async () => {
    setup({ search: { deliver: 1 } });

    fireEvent.change(
      await screen.findByLabelText('Quantity for School shirt, Size 12'),
      { target: { value: '10' } }
    );

    expect(screen.getByText(/Total at cost/)).toHaveTextContent(
      'Total at cost: ₦ ••••'
    );
    expect(screen.queryByText(/₦35,000/)).not.toBeInTheDocument();
  });

  it('lists every active item in the delivery sheet, past the first page of 50', async () => {
    const campuses = [LEKKI, IKEJA];
    const { api } = setup({
      search: { deliver: 1 },
      items: ({ query }) =>
        Promise.resolve({
          items:
            query.page === 2
              ? [textbook(campuses)]
              : [shirt(campuses), tie(campuses)],
          total: 51,
        }),
    });

    expect(
      await screen.findByLabelText('Quantity for Mathematics')
    ).toBeVisible();
    expect(api.store.items).toHaveBeenCalledWith({
      query: expect.objectContaining({ page: 2, pageSize: 50 }),
    });
  });

  it('says why Paid from is empty without access to money accounts', async () => {
    setup({
      search: { deliver: 1 },
      access: fakeAccess({
        roles: ['custom'],
        permissions: toPermissionMap(['store:read', 'store:receive']),
        campusScope: 'all',
      }),
    });

    expect(await screen.findByText(NO_ACCOUNT_ACCESS_MESSAGE)).toBeVisible();
  });

  it('shows the write controls to the owner', async () => {
    setup();
    expect(
      await screen.findByRole('button', { name: 'Record a delivery' })
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'More actions' })).toBeVisible();
    expect(
      await screen.findByRole('button', { name: 'Edit School shirt, Size 12' })
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Retire School shirt, Size 12' })
    ).toBeVisible();
  });

  it.each([
    ['a member with store:read only', readerAccess()],
    ['an acting super admin without a reason', actingAccess(false)],
  ])('hides every write control from %s', async (_label, access) => {
    setup({ access });

    expect(await screen.findByText('School shirt')).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Record a delivery' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'More actions' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /^Edit / })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /^Retire / })
    ).not.toBeInTheDocument();
  });
});
