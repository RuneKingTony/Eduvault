import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { starterAccess } from '../test-utils';
import {
  OTHER_GUARDIAN_ID,
  OTHER_WALLET_ID,
  renderWallets,
  walletList,
  walletSummary,
} from '../test-wallets';
import { WalletsPage } from './wallets-page';

function setup(
  options: {
    list?: ReturnType<typeof walletList>;
    search?: Parameters<typeof WalletsPage>[0]['search'];
    access?: ReturnType<typeof starterAccess>;
  } = {}
) {
  const api = {
    wallets: { list: vi.fn().mockResolvedValue(options.list ?? walletList()) },
  };
  const onSearchChange = vi.fn();
  renderWallets(
    <WalletsPage
      search={options.search ?? {}}
      onSearchChange={onSearchChange}
    />,
    api,
    { access: options.access }
  );
  return { api, onSearchChange };
}

let user: ReturnType<typeof userEvent.setup>;

beforeEach(() => {
  user = userEvent.setup();
});

describe('WalletsPage', () => {
  it('shows the summary line with the money held, set aside and free', async () => {
    setup({
      list: walletList([
        walletSummary(),
        walletSummary({
          id: OTHER_WALLET_ID,
          guardianId: OTHER_GUARDIAN_ID,
          guardianName: 'Musa Bello',
          guardianPhone: '08099998888',
          childCount: 1,
          balanceMinor: 0,
          setAsideMinor: 0,
          freeMinor: 0,
        }),
      ]),
    });
    expect(
      await screen.findByText(
        '2 wallets · ₦50,000.00 held · ₦10,000.00 set aside · ₦40,000.00 free to use'
      )
    ).toBeInTheDocument();
  });

  it('lists each family with its children, balance, set aside and free money', async () => {
    setup();
    const row = await screen.findByRole('row', { name: /Ngozi Okeke/ });
    const cells = within(row).getAllByRole('cell');
    expect(cells[0]).toHaveTextContent('Ngozi Okeke08012345678');
    expect(cells.slice(1).map((cell) => cell.textContent)).toEqual([
      '2 children',
      '₦50,000.00',
      '₦10,000.00',
      '₦40,000.00',
    ]);
    expect(
      within(row).getAllByRole('link', { name: /Ngozi Okeke/ })[0]
    ).toHaveAttribute('href', expect.stringContaining('/finance/wallets/'));
  });

  it('shows a family with nothing in its wallet as ₦0.00 rather than a bare zero', async () => {
    setup({
      list: walletList([
        walletSummary({
          childCount: 1,
          balanceMinor: 0,
          setAsideMinor: 0,
          freeMinor: 0,
        }),
      ]),
    });
    const row = await screen.findByRole('row', { name: /Ngozi Okeke/ });
    expect(within(row).getAllByText('₦0.00')).toHaveLength(3);
    expect(within(row).getByText('1 child')).toBeInTheDocument();
  });

  it('searches as you type and returns to the first page', async () => {
    const { onSearchChange } = setup({ search: { page: 3 } });
    await user.click(await screen.findByLabelText('Search wallets'));
    await user.paste('ojo');
    await waitFor(() => {
      expect(onSearchChange).toHaveBeenCalledWith({
        q: 'ojo',
        page: undefined,
      });
    });
  });

  it('says no wallet matches a search, and says why there are none otherwise', async () => {
    setup({ list: walletList([]), search: { q: 'zzz' } });
    expect(await screen.findByText('No wallets match')).toBeInTheDocument();
  });

  it('explains an empty school without offering to add a wallet', async () => {
    setup({ list: walletList([]) });
    expect(await screen.findByText('No wallets yet')).toBeInTheDocument();
    expect(
      screen.getByText(
        'A wallet appears when a guardian is set to pay a child’s fees.'
      )
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /top-up/i })).toBeNull();
  });

  it('pages a long list', async () => {
    const { onSearchChange } = setup({
      list: walletList([walletSummary()], { total: 25 }),
    });
    await user.click(await screen.findByRole('button', { name: 'Page 2' }));
    expect(onSearchChange).toHaveBeenCalledWith({ page: 2 });
  });

  it('shows a bursar the same list', async () => {
    setup({ access: starterAccess('bursar') });
    expect(await screen.findByText('Ngozi Okeke')).toBeInTheDocument();
  });
});
