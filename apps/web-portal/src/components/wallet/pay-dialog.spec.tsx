import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError, walletSpendOverMessage } from '@eduvault/api-contract';
import type { Permission } from '@eduvault/policy';
import { toast } from '@eduvault/ui';
import {
  ADA_ID,
  TOBI_ID,
  portalWallet,
  renderWithApi,
  testId,
  walletChild,
} from '../../test-utils';
import { PayFromWalletDialog } from './pay-dialog';

vi.mock('@eduvault/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@eduvault/ui')>()),
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));

const HELD: Permission[] = ['wallet:readOwn', 'wallet:spend'];

const ada = (over = {}) =>
  walletChild({
    studentId: ADA_ID,
    name: 'Ada Okeke',
    owedMinor: 2_000_000,
    oldestUnpaidOn: '2026-09-07',
    ...over,
  });
const tobi = (over = {}) =>
  walletChild({
    studentId: TOBI_ID,
    name: 'Tobi Okeke',
    owedMinor: 1_500_000,
    oldestUnpaidOn: '2026-03-01',
    ...over,
  });

const spent = (totalMinor: number, replayed = false) => ({
  id: testId(9),
  reference: 'WSP-1',
  totalMinor,
  lines: [{ studentId: ADA_ID, amountMinor: totalMinor }],
  replayed,
  wallet: portalWallet(),
});

function setup(
  options: {
    wallet?: ReturnType<typeof portalWallet>;
    spend?: ReturnType<typeof vi.fn>;
  } = {}
) {
  const api = {
    portalWallet: {
      spend: options.spend ?? vi.fn().mockResolvedValue(spent(1_000_000)),
    },
  };
  const onClose = vi.fn();
  renderWithApi(
    <PayFromWalletDialog
      wallet={options.wallet ?? portalWallet({ children: [ada(), tobi()] })}
      open
      onClose={onClose}
    />,
    api,
    HELD
  );
  return { api, onClose };
}

const amountFor = (name: string) =>
  screen.getByRole('textbox', { name: `Amount for ${name}` });

let user: ReturnType<typeof userEvent.setup>;

beforeEach(() => {
  user = userEvent.setup();
  vi.clearAllMocks();
});

describe('PayFromWalletDialog table', () => {
  it('lists the child owing longest first with what they owe and the most they can use', () => {
    setup({
      wallet: portalWallet({ freeMinor: 1_000_000, children: [ada(), tobi()] }),
    });
    const rows = screen.getAllByRole('row');
    expect(within(rows[1]!).getByText('Tobi Okeke')).toBeInTheDocument();
    expect(within(rows[1]!).getByText('₦15,000.00')).toBeInTheDocument();
    expect(within(rows[1]!).getByText('₦10,000.00')).toBeInTheDocument();
    expect(within(rows[2]!).getByText('Ada Okeke')).toBeInTheDocument();
  });

  it('reads ₦0.00 for the total, the cap of a child who owes nothing and an empty wallet', () => {
    setup({
      wallet: portalWallet({
        freeMinor: 0,
        balanceMinor: 0,
        children: [ada({ owedMinor: 0, spendableMinor: 0 })],
      }),
    });
    const row = screen.getAllByRole('row')[1]!;
    expect(within(row).getAllByText('₦0.00')).toHaveLength(2);
    expect(
      within(screen.getAllByRole('row')[2]!).getByText('₦0.00')
    ).toBeInTheDocument();
    expect(amountFor('Ada Okeke')).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Review payment' })
    ).toBeDisabled();
  });

  it('uses set-aside money first, leaving the free money for the other child', async () => {
    setup({
      wallet: portalWallet({
        freeMinor: 1_000_000,
        setAsideMinor: 1_500_000,
        children: [tobi({ earmarkMinor: 1_500_000 }), ada()],
      }),
    });
    await user.type(amountFor('Tobi Okeke'), '15000');
    await user.type(amountFor('Ada Okeke'), '10000');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Review payment' })
    ).toBeEnabled();
    const footer = screen.getAllByRole('row').at(-1)!;
    expect(within(footer).getByText('₦25,000.00')).toBeInTheDocument();
  });

  it('shows the limit for an amount over the cap and holds the payment back', async () => {
    setup({
      wallet: portalWallet({ freeMinor: 1_000_000, children: [ada()] }),
    });
    await user.type(amountFor('Ada Okeke'), '10000.01');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      walletSpendOverMessage('Ada Okeke', 1_000_000)
    );
    expect(
      screen.getByRole('button', { name: 'Review payment' })
    ).toBeDisabled();
  });

  it('fills the amounts with Pay all I can, oldest first', async () => {
    setup({
      wallet: portalWallet({ freeMinor: 2_000_000, children: [ada(), tobi()] }),
    });
    await user.click(screen.getByRole('button', { name: 'Pay all I can' }));
    expect(amountFor('Tobi Okeke')).toHaveValue('15000');
    expect(amountFor('Ada Okeke')).toHaveValue('5000');
  });
});

describe('PayFromWalletDialog paying', () => {
  it('asks to confirm, then pays once with a reference and a line per child', async () => {
    const { api, onClose } = setup({
      wallet: portalWallet({ freeMinor: 5_000_000, children: [ada(), tobi()] }),
    });
    await user.type(amountFor('Ada Okeke'), '10000');
    await user.type(amountFor('Tobi Okeke'), '5000');
    await user.click(screen.getByRole('button', { name: 'Review payment' }));

    const confirm = await screen.findByRole('dialog', {
      name: 'Pay these fees from the wallet?',
    });
    expect(within(confirm).getByText('₦15,000.00')).toBeInTheDocument();
    expect(api.portalWallet.spend).not.toHaveBeenCalled();

    await user.click(within(confirm).getByRole('button', { name: 'Pay now' }));

    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
    expect(api.portalWallet.spend).toHaveBeenCalledTimes(1);
    expect(api.portalWallet.spend).toHaveBeenCalledWith({
      body: {
        reference: expect.stringMatching(/^WSP-\d{8}-[A-Z2-7]{6}$/) as string,
        lines: [
          { studentId: TOBI_ID, amountMinor: 500_000 },
          { studentId: ADA_ID, amountMinor: 1_000_000 },
        ],
      },
    });
    expect(toast.success).toHaveBeenCalledWith(
      '₦10,000.00 paid from the wallet.'
    );
  });

  it('keeps the same reference when the payment is retried after a refusal', async () => {
    const spend = vi
      .fn()
      .mockRejectedValueOnce(new Error('The school is away'))
      .mockResolvedValueOnce(spent(1_000_000));
    setup({ wallet: portalWallet({ children: [ada()] }), spend });
    await user.type(amountFor('Ada Okeke'), '10000');
    await user.click(screen.getByRole('button', { name: 'Review payment' }));
    await user.click(await screen.findByRole('button', { name: 'Pay now' }));
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalled();
    });
    await user.click(screen.getByRole('button', { name: 'Review payment' }));
    await user.click(await screen.findByRole('button', { name: 'Pay now' }));
    await waitFor(() => {
      expect(spend).toHaveBeenCalledTimes(2);
    });
    const [first, second] = spend.mock.calls as [
      { body: { reference: string } }[],
      { body: { reference: string } }[],
    ];
    expect(second[0]?.body.reference).toBe(first[0]?.body.reference);
  });

  it('shows the API’s limit when the payment is refused with 422', async () => {
    const message = walletSpendOverMessage('Ada Okeke', 400_000);
    const spend = vi
      .fn()
      .mockRejectedValue(
        new ApiError(422, { code: 'ValidationError', message })
      );
    const { onClose } = setup({
      wallet: portalWallet({ children: [ada()] }),
      spend,
    });
    await user.type(amountFor('Ada Okeke'), '10000');
    await user.click(screen.getByRole('button', { name: 'Review payment' }));
    await user.click(await screen.findByRole('button', { name: 'Pay now' }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(message);
    });
    expect(onClose).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('says nothing was paid twice on a replay', async () => {
    setup({
      wallet: portalWallet({ children: [ada()] }),
      spend: vi.fn().mockResolvedValue(spent(1_000_000, true)),
    });
    await user.type(amountFor('Ada Okeke'), '10000');
    await user.click(screen.getByRole('button', { name: 'Review payment' }));
    await user.click(await screen.findByRole('button', { name: 'Pay now' }));
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(
        'That payment was already made. Nothing was paid twice.'
      );
    });
  });
});
