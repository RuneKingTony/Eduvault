import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Permission } from '@eduvault/policy';
import { toast } from '@eduvault/ui';
import { portalWallet, renderWithApi } from '../../test-utils';
import { WalletSection } from './wallet-section';

vi.mock('@eduvault/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@eduvault/ui')>()),
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));

const HELD: Permission[] = ['wallet:readOwn', 'wallet:spend'];
const ACCOUNT = {
  accountNumber: '8012345678',
  bankName: 'Wema Bank',
  accountName: 'Greenfield College - Ngozi Okeke',
};

function setup(
  wallet = portalWallet(),
  options: { held?: Permission[]; setAutoPay?: ReturnType<typeof vi.fn> } = {}
) {
  const api = {
    portalWallet: {
      setAutoPay:
        options.setAutoPay ??
        vi.fn().mockResolvedValue({ ...wallet, autoPay: !wallet.autoPay }),
    },
  };
  const onPay = vi.fn();
  renderWithApi(
    <WalletSection wallet={wallet} onPay={onPay} />,
    api,
    options.held ?? HELD
  );
  return { api, onPay };
}

const group = (name: string) => screen.getByRole('group', { name });

let user: ReturnType<typeof userEvent.setup>;

beforeEach(() => {
  user = userEvent.setup();
  vi.clearAllMocks();
});

describe('WalletSection figures', () => {
  it('shows the balance, what is free to use and what is set aside', () => {
    setup(
      portalWallet({
        balanceMinor: 5_000_000,
        setAsideMinor: 1_000_000,
        freeMinor: 4_000_000,
      })
    );
    expect(
      within(group('Balance')).getByText('₦50,000.00')
    ).toBeInTheDocument();
    expect(
      within(group('Free to use')).getByText('₦40,000.00')
    ).toBeInTheDocument();
    expect(
      within(group('Set aside')).getByText('₦10,000.00')
    ).toBeInTheDocument();
  });

  it('reads ₦0.00 in every figure for an empty wallet', () => {
    setup(portalWallet({ balanceMinor: 0, setAsideMinor: 0, freeMinor: 0 }));
    for (const name of ['Balance', 'Free to use', 'Set aside']) {
      expect(
        within(screen.getByRole('group', { name })).getByText('₦0.00')
      ).toBeInTheDocument();
    }
  });

  it('opens the pay dialog from Pay from wallet, for someone who may spend', async () => {
    const { onPay } = setup();
    await user.click(screen.getByRole('button', { name: 'Pay from wallet' }));
    expect(onPay).toHaveBeenCalledTimes(1);
  });

  it('has no Pay from wallet button without wallet:spend', () => {
    setup(portalWallet(), { held: ['wallet:readOwn'] });
    expect(
      screen.queryByRole('button', { name: 'Pay from wallet' })
    ).not.toBeInTheDocument();
  });
});

describe('WalletSection top up', () => {
  it('shows the family’s account with a button that copies the number', async () => {
    setup(portalWallet({ reservedAccount: ACCOUNT, gatewayConnected: true }));
    await user.click(screen.getByRole('button', { name: 'Top up' }));
    expect(screen.getByText('Wema Bank')).toBeInTheDocument();
    expect(screen.getByText('8012345678')).toBeInTheDocument();
    expect(
      screen.getByText('Greenfield College - Ngozi Okeke')
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: 'Copy account number' })
    );

    expect(await navigator.clipboard.readText()).toBe('8012345678');
    expect(await screen.findByText('Copied')).toBeInTheDocument();
  });

  it('says online payments are not switched on when the school has not connected', async () => {
    setup(portalWallet({ reservedAccount: null, gatewayConnected: false }));
    await user.click(screen.getByRole('button', { name: 'Top up' }));
    expect(
      screen.getByText(/Online payments aren’t switched on at the school/)
    ).toBeInTheDocument();
    expect(screen.queryByText('Account number')).not.toBeInTheDocument();
  });

  it('says the account is not ready when the school is connected but the family has none', async () => {
    setup(portalWallet({ reservedAccount: null, gatewayConnected: true }));
    await user.click(screen.getByRole('button', { name: 'Top up' }));
    expect(
      screen.getByText(/Your family’s account isn’t ready yet/)
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Copy account number' })
    ).not.toBeInTheDocument();
  });
});

describe('WalletSection auto-pay', () => {
  it('is off by default and turns on with a reference, then says so', async () => {
    const { api } = setup(portalWallet({ autoPay: false }));
    const toggle = screen.getByRole('switch', { name: 'Auto-pay' });
    expect(toggle).not.toBeChecked();

    await user.click(toggle);

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Auto-pay is on.');
    });
    expect(api.portalWallet.setAutoPay).toHaveBeenCalledWith({
      body: {
        enabled: true,
        reference: expect.stringMatching(/^WAP-\d{8}-[A-Z2-7]{6}$/) as string,
      },
    });
  });

  it('shows on and turns off', async () => {
    const { api } = setup(portalWallet({ autoPay: true }));
    const toggle = screen.getByRole('switch', { name: 'Auto-pay' });
    expect(toggle).toBeChecked();

    await user.click(toggle);

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Auto-pay is off.');
    });
    expect(api.portalWallet.setAutoPay).toHaveBeenCalledWith({
      body: { enabled: false, reference: expect.any(String) as string },
    });
  });

  it('toasts the refusal and is disabled without wallet:spend', async () => {
    setup(portalWallet(), {
      setAutoPay: vi.fn().mockRejectedValue(new Error('The school is away')),
    });
    await user.click(screen.getByRole('switch', { name: 'Auto-pay' }));
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('The school is away');
    });
  });

  it('cannot be changed without wallet:spend', () => {
    setup(portalWallet(), { held: ['wallet:readOwn'] });
    expect(screen.getByRole('switch', { name: 'Auto-pay' })).toBeDisabled();
  });
});
