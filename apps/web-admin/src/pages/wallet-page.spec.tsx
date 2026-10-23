import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '@eduvault/api-contract';
import { starterAccess } from '../test-utils';
import {
  OTHER_WALLET_ID,
  RECEIPT_FILE_ID,
  TOBI,
  WALLET_ID,
  movementList,
  movement,
  renderWallets,
  spendMovement,
  topUpOptions,
  wallet,
  walletChild,
} from '../test-wallets';
import { WalletPage } from './wallet-page';

function setup(
  options: {
    wallet?: ReturnType<typeof wallet>;
    movements?: ReturnType<typeof movementList>;
    search?: Parameters<typeof WalletPage>[0]['search'];
    access?: ReturnType<typeof starterAccess>;
    missing?: boolean;
  } = {}
) {
  const api = {
    wallets: {
      get:
        options.missing === true
          ? vi.fn().mockRejectedValue(
              new ApiError(404, {
                code: 'NotFound',
                message: 'Wallet not found',
              })
            )
          : vi.fn().mockResolvedValue(options.wallet ?? wallet()),
      movements: vi
        .fn()
        .mockResolvedValue(
          options.movements ?? movementList([spendMovement(), movement()])
        ),
      topUpOptions: vi.fn().mockResolvedValue(topUpOptions()),
    },
  };
  const onSearchChange = vi.fn();
  renderWallets(
    <WalletPage
      walletId={WALLET_ID}
      search={options.search ?? {}}
      onSearchChange={onSearchChange}
    />,
    api,
    { access: options.access, path: `/finance/wallets/${WALLET_ID}` }
  );
  return { api, onSearchChange };
}

let user: ReturnType<typeof userEvent.setup>;

beforeEach(() => {
  user = userEvent.setup();
});

describe('WalletPage', () => {
  it('names the family and shows the three balances', async () => {
    setup();
    expect(
      await screen.findByRole('heading', { name: 'Ngozi Okeke' })
    ).toBeVisible();
    expect(screen.getByText('08012345678')).toBeVisible();
    expect(
      within(screen.getByRole('group', { name: 'Balance' })).getByText(
        '₦50,000.00'
      )
    ).toBeVisible();
    expect(
      within(screen.getByRole('group', { name: 'Set aside' })).getByText(
        '₦10,000.00'
      )
    ).toBeVisible();
    expect(
      within(screen.getByRole('group', { name: 'Free to use' })).getByText(
        '₦40,000.00'
      )
    ).toBeVisible();
  });

  it('shows an empty wallet as ₦0.00 in all three cards', async () => {
    setup({
      wallet: wallet({ balanceMinor: 0, setAsideMinor: 0, freeMinor: 0 }),
    });
    await screen.findByRole('group', { name: 'Balance' });
    for (const name of ['Balance', 'Set aside', 'Free to use']) {
      expect(
        within(screen.getByRole('group', { name })).getByText('₦0.00')
      ).toBeVisible();
    }
  });

  it('lists each child with what they owe, what is set aside and the most they can use', async () => {
    setup();
    const ada = await screen.findByRole('row', { name: /Ada Okeke/ });
    expect(
      within(ada)
        .getAllByRole('cell')
        .slice(1)
        .map((cell) => cell.textContent)
    ).toEqual(['₦180,000.00', '₦10,000.00', '₦50,000.00']);
    const tobi = screen.getByRole('row', { name: /Tobi Okeke/ });
    expect(
      within(tobi)
        .getAllByRole('cell')
        .slice(1)
        .map((cell) => cell.textContent)
    ).toEqual(['₦0.00', '₦0.00', '₦0.00']);
  });

  it('links a child in scope to their statement and leaves one on another campus plain', async () => {
    setup({
      wallet: wallet({
        children: [
          walletChild(),
          walletChild({
            studentId: TOBI,
            name: 'Tobi Okeke',
            admissionNumber: 'GF-0002',
            inScope: false,
          }),
        ],
      }),
    });
    await screen.findByRole('row', { name: /Ada Okeke/ });
    expect(screen.getByRole('link', { name: 'Ada Okeke' })).toBeVisible();
    expect(screen.queryByRole('link', { name: 'Tobi Okeke' })).toBeNull();
  });

  it('shows the movements newest first with the way they were paid, the receipt and who made them', async () => {
    setup();
    const spent = await screen.findByRole('row', {
      name: /Paid Ada Okeke’s charges/,
    });
    expect(within(spent).getByText('WSP-20261009-A1B2C3')).toBeVisible();
    expect(within(spent).getByText('Ngozi Okeke')).toBeVisible();
    expect(within(spent).getByText('−₦15,000.00')).toBeVisible();

    const topUp = screen.getByRole('row', { name: /Top-up from Uncle Bode/ });
    expect(
      within(topUp).getByText('Top-up from Uncle Bode · Cash')
    ).toBeVisible();
    expect(within(topUp).getByText('Chika Eze')).toBeVisible();
    expect(within(topUp).getByText('₦50,000.00')).toBeVisible();
    expect(
      within(topUp).getByRole('link', { name: 'Receipt' })
    ).toHaveAttribute(
      'href',
      expect.stringContaining(`/files/${RECEIPT_FILE_ID}`)
    );
  });

  it('says there are no movements yet', async () => {
    setup({ movements: movementList([]) });
    expect(await screen.findByText('No movements yet')).toBeVisible();
  });

  it('shows Record top-up to someone who may top up, and opens the sheet from it', async () => {
    const { onSearchChange } = setup({ access: starterAccess('bursar') });
    await user.click(
      await screen.findByRole('button', { name: 'Record top-up' })
    );
    expect(onSearchChange).toHaveBeenCalledWith({ topup: 1 });
  });

  it('hides Record top-up from someone who may only look', async () => {
    setup({ access: starterAccess('principal') });
    await screen.findByRole('heading', { name: 'Ngozi Okeke' });
    expect(screen.queryByRole('button', { name: 'Record top-up' })).toBeNull();
  });

  it('opens the sheet when the address asks for it, and only for someone who may top up', async () => {
    setup({ search: { topup: 1 }, access: starterAccess('bursar') });
    expect(
      await screen.findByRole('dialog', { name: 'Record a top-up' })
    ).toBeVisible();
  });

  it('keeps the sheet shut for a reader even if the address asks for it', async () => {
    setup({ search: { topup: 1 }, access: starterAccess('principal') });
    await screen.findByRole('heading', { name: 'Ngozi Okeke' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('answers a wallet that is not there, or out of reach, with a not-found page', async () => {
    setup({ missing: true });
    expect(await screen.findByText('No wallet here')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Back to wallets' })).toBeVisible();
    expect(OTHER_WALLET_ID).not.toBe(WALLET_ID);
  });
});
