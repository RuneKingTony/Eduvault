import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '@eduvault/api-contract';
import { toast } from '@eduvault/ui';
import { actingAccess, starterAccess } from '../test-utils';
import {
  OTHER_WALLET_ID,
  RECEIPT_FILE_ID,
  TOBI,
  WALLET_ID,
  movementList,
  monnifyMovement,
  movement,
  refundMovement,
  refundOptions,
  renderWallets,
  requestedCancellation,
  spendMovement,
  topUpOptions,
  wallet,
  walletChild,
} from '../test-wallets';
import { WalletPage } from './wallet-page';

vi.mock('@eduvault/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@eduvault/ui')>()),
  toast: Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  }),
}));

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
      refundOptions: vi.fn().mockResolvedValue(refundOptions()),
      requestCancellation: vi.fn().mockResolvedValue(requestedCancellation()),
      reservedAccount: vi.fn().mockResolvedValue(wallet()),
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
  vi.clearAllMocks();
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

const withAccount = () =>
  wallet({
    gatewayConnected: true,
    reservedAccount: {
      accountNumber: '5000000001',
      bankName: 'Wema Bank',
      accountName: 'Ngozi Okeke',
    },
  });

describe('WalletPage Monnify account', () => {
  it('shows the family’s bank, account number and account name', async () => {
    setup({ wallet: withAccount() });

    const card = await screen.findByRole('group', { name: 'Monnify account' });
    expect(within(card).getByText('Wema Bank')).toBeVisible();
    expect(within(card).getByText('5000000001')).toBeVisible();
    expect(within(card).getByText('Ngozi Okeke')).toBeVisible();
    expect(
      within(card).queryByRole('button', { name: 'Create account' })
    ).toBeNull();
  });

  it('offers Create account to a school that has connected but made none, and refreshes the wallet', async () => {
    const { api } = setup({
      wallet: wallet({ gatewayConnected: true }),
      access: starterAccess('bursar'),
    });
    await user.click(
      await screen.findByRole('button', { name: 'Create account' })
    );

    await waitFor(() => {
      expect(api.wallets.reservedAccount).toHaveBeenCalledWith({
        params: { walletId: WALLET_ID },
      });
    });
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Monnify account created.');
    });
    await waitFor(() => {
      expect(api.wallets.get).toHaveBeenCalledTimes(2);
    });
  });

  it('toasts the refusal when Monnify cannot make the account', async () => {
    const { api } = setup({
      wallet: wallet({ gatewayConnected: true }),
      access: starterAccess('bursar'),
    });
    api.wallets.reservedAccount.mockRejectedValue(
      new ApiError(502, {
        code: 'InternalError',
        message: 'Monnify did not create the account.',
      })
    );
    await user.click(
      await screen.findByRole('button', { name: 'Create account' })
    );

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        'Monnify did not create the account.'
      );
    });
  });

  it('points to Settings when the school has not connected Monnify', async () => {
    setup({ wallet: wallet({ gatewayConnected: false }) });

    const card = await screen.findByRole('group', { name: 'Monnify account' });
    expect(
      within(card).getByText(/Online payments aren’t connected/)
    ).toBeVisible();
    expect(
      within(card).queryByRole('button', { name: 'Create account' })
    ).toBeNull();
  });

  it('keeps Create account from someone who may only look', async () => {
    setup({
      wallet: wallet({ gatewayConnected: true }),
      access: starterAccess('principal'),
    });

    const card = await screen.findByRole('group', { name: 'Monnify account' });
    expect(
      within(card).queryByRole('button', { name: 'Create account' })
    ).toBeNull();
  });
});

describe('WalletPage Trace', () => {
  it('titles an online top-up and offers a Trace only on it', async () => {
    setup({ movements: movementList([monnifyMovement(), movement()]) });

    const online = await screen.findByRole('row', {
      name: /Online top-up · Monnify/,
    });
    expect(within(online).getByText('₦49,500.00')).toBeVisible();
    expect(within(online).getByRole('button', { name: 'Trace' })).toBeVisible();
    const staff = screen.getByRole('row', { name: /Top-up from Uncle Bode/ });
    expect(within(staff).queryByRole('button', { name: 'Trace' })).toBeNull();
  });

  it('opens the Trace with the Monnify reference, the signature check, the confirmation and the amounts', async () => {
    setup({ movements: movementList([monnifyMovement()]) });
    await user.click(await screen.findByRole('button', { name: 'Trace' }));

    const trace = await screen.findByRole('dialog', { name: 'Trace' });
    expect(
      within(trace).getAllByText('MNFY|20|20261024120000|000001')
    ).toHaveLength(2);
    expect(within(trace).getByText('pay-1')).toBeVisible();
    expect(within(trace).getByText('Valid')).toBeVisible();
    expect(
      within(trace).getByText(/Checked with Monnify on 2026-10-24/)
    ).toBeVisible();
    expect(within(trace).getByText('₦50,000.00')).toBeVisible();
    expect(within(trace).getByText('₦500.00')).toBeVisible();
    expect(within(trace).getByText('₦49,500.00')).toBeVisible();
  });
});

describe('WalletPage held money', () => {
  it('shows what waiting requests hold only when something is held', async () => {
    setup({
      wallet: wallet({ heldMinor: 1_500_000, freeMinor: 2_500_000 }),
    });
    expect(
      within(
        await screen.findByRole('group', { name: 'Held for requests' })
      ).getByText('₦15,000.00')
    ).toBeVisible();
    expect(
      within(screen.getByRole('group', { name: 'Free to use' })).getByText(
        '₦25,000.00'
      )
    ).toBeVisible();
  });

  it('leaves the card out when nothing is held', async () => {
    setup();
    await screen.findByRole('group', { name: 'Balance' });
    expect(
      screen.queryByRole('group', { name: 'Held for requests' })
    ).toBeNull();
  });
});

describe('WalletPage Request refund', () => {
  it('shows Request refund to someone who may ask, and opens the sheet from it', async () => {
    const { onSearchChange } = setup({ access: starterAccess('bursar') });
    await user.click(
      await screen.findByRole('button', { name: 'Request refund' })
    );
    expect(onSearchChange).toHaveBeenCalledWith({ refund: 1 });
  });

  it('hides Request refund from someone who may only look or only approve', async () => {
    setup({ access: starterAccess('principal') });
    await screen.findByRole('heading', { name: 'Ngozi Okeke' });
    expect(screen.queryByRole('button', { name: 'Request refund' })).toBeNull();
  });

  it('hides Request refund from a super admin acting without a reason, and shows it with one', async () => {
    setup({ access: actingAccess(false) });
    await screen.findByRole('heading', { name: 'Ngozi Okeke' });
    expect(screen.queryByRole('button', { name: 'Request refund' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Record top-up' })).toBeNull();
  });

  it('shows Request refund to a super admin acting with a reason', async () => {
    setup({ access: actingAccess(true) });
    expect(
      await screen.findByRole('button', { name: 'Request refund' })
    ).toBeVisible();
  });

  it('opens the sheet when the address asks for it, only for someone who may ask', async () => {
    setup({ search: { refund: 1 }, access: starterAccess('bursar') });
    expect(
      await screen.findByRole('dialog', { name: 'Request a refund' })
    ).toBeVisible();
  });

  it('keeps the sheet shut for a reader even if the address asks for it', async () => {
    setup({ search: { refund: 1 }, access: starterAccess('principal') });
    await screen.findByRole('heading', { name: 'Ngozi Okeke' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

const topUpWith = (cancellation: 'submitted' | 'approved') =>
  movement({
    reference: `CSH-${cancellation}`,
    source: {
      type: 'topup',
      id: WALLET_ID,
      method: 'cash',
      depositorName: null,
      proofFileId: RECEIPT_FILE_ID,
      cancellation,
    },
  });

describe('WalletPage Cancel top-up', () => {
  it('offers Cancel top-up on a staff top-up to someone who may ask, and opens the dialog', async () => {
    const { api } = setup({ access: starterAccess('bursar') });
    const topUp = await screen.findByRole('row', {
      name: /Top-up from Uncle Bode/,
    });
    await user.click(
      within(topUp).getByRole('button', {
        name: 'Cancel top-up CSH-20261007-K3Q7ZA',
      })
    );
    const dialog = await screen.findByRole('dialog', {
      name: 'Cancel this top-up?',
    });
    await user.type(
      within(dialog).getByLabelText('Reason'),
      'Keyed against the wrong family'
    );
    await user.click(
      within(dialog).getByRole('button', { name: 'Request cancellation' })
    );
    await waitFor(() => {
      expect(api.wallets.requestCancellation).toHaveBeenCalledTimes(1);
    });
    expect(api.wallets.requestCancellation.mock.calls[0]?.[0]).toMatchObject({
      params: { walletId: WALLET_ID },
    });
  });

  it('does not offer it on a Monnify credit, a spend or a refund', async () => {
    setup({
      access: starterAccess('bursar'),
      movements: movementList([
        monnifyMovement(),
        spendMovement(),
        refundMovement(),
      ]),
    });
    await screen.findByRole('row', { name: /Online top-up · Monnify/ });
    expect(screen.queryByRole('button', { name: /^Cancel top-up/ })).toBeNull();
    expect(
      within(screen.getByRole('row', { name: /Refund paid out/ })).getByText(
        '−₦15,000.00'
      )
    ).toBeVisible();
  });

  it('shows a waiting or done cancellation as a badge instead of the button', async () => {
    setup({
      access: starterAccess('bursar'),
      movements: movementList([topUpWith('submitted'), topUpWith('approved')]),
    });
    expect(await screen.findByText('Cancellation waiting')).toBeVisible();
    expect(screen.getByText('Cancelled')).toBeVisible();
    expect(screen.queryByRole('button', { name: /^Cancel top-up/ })).toBeNull();
  });

  it('hides the button from someone who may only look', async () => {
    setup({ access: starterAccess('principal') });
    await screen.findByRole('row', { name: /Top-up from Uncle Bode/ });
    expect(screen.queryByRole('button', { name: /^Cancel top-up/ })).toBeNull();
  });

  it('hides the button while acting without a reason', async () => {
    setup({ access: actingAccess(false) });
    await screen.findByRole('row', { name: /Top-up from Uncle Bode/ });
    expect(screen.queryByRole('button', { name: /^Cancel top-up/ })).toBeNull();
  });
});
