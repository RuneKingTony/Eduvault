import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  ApiError,
  WALLET_AMOUNT_MESSAGE,
  WALLET_REFUND_EMAIL_MESSAGE,
  WALLET_REFUND_PROOF_REQUIRED_MESSAGE,
  WALLET_REFUND_REASON_MESSAGE,
  walletRefundOverMessage,
} from '@eduvault/api-contract';
import { toast } from '@eduvault/ui';
import {
  BANK,
  WALLET_ID,
  refundOptions,
  renderWallets,
  requestedRefund,
  wallet,
} from '../../test-wallets';
import { RefundSheet } from './refund-sheet';

vi.mock('@eduvault/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@eduvault/ui')>()),
  toast: Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  }),
}));

const EMAIL_FILE_ID = '00000000-0000-4000-8000-0000000e0001';

function setup(
  options: {
    options?: ReturnType<typeof refundOptions>;
    request?: ReturnType<typeof vi.fn>;
    wallet?: ReturnType<typeof wallet>;
  } = {}
) {
  const api = {
    wallets: {
      refundOptions: vi
        .fn()
        .mockResolvedValue(options.options ?? refundOptions()),
      requestRefund:
        options.request ?? vi.fn().mockResolvedValue(requestedRefund()),
    },
    files: {
      upload: vi.fn().mockResolvedValue({
        id: EMAIL_FILE_ID,
        contentType: 'application/pdf',
        byteSize: 8,
        originalName: 'email.pdf',
      }),
    },
  };
  const onOpenChange = vi.fn();
  renderWallets(
    <RefundSheet
      wallet={options.wallet ?? wallet()}
      open
      onOpenChange={onOpenChange}
    />,
    api
  );
  return { api, onOpenChange };
}

let user: ReturnType<typeof userEvent.setup>;

const email = () => new File(['x'], 'email.pdf', { type: 'application/pdf' });
const confirmDialog = () =>
  screen.findByRole('dialog', { name: 'Ask for this refund?' });

async function fill(amount = '15000') {
  await user.type(await screen.findByLabelText('Amount to refund (₦)'), amount);
  await user.type(
    screen.getByLabelText('Parent’s email address'),
    'ngozi@example.com'
  );
  await user.upload(
    screen.getByLabelText('The parent’s email, saved as a file'),
    email()
  );
  await user.type(screen.getByLabelText('Reason'), 'Paid twice by mistake');
  await user.click(screen.getByRole('button', { name: 'Request refund' }));
}

describe('RefundSheet', () => {
  beforeEach(() => {
    user = userEvent.setup();
    vi.clearAllMocks();
  });

  it('opens on the first bank account with a generated reference and the most that is free', async () => {
    setup();
    expect(await screen.findByLabelText('Paid out of')).toHaveValue(BANK);
    expect(screen.getByLabelText('Our reference')).toHaveDisplayValue(
      /^WRQ-\d{8}-[A-Z2-7]{6}$/
    );
    expect(
      screen.getByText('Up to ₦40,000.00 is free to refund.')
    ).toBeVisible();
    expect(
      screen.getByText(/Pay money back to Ngozi Okeke out of the family wallet/)
    ).toBeVisible();
  });

  it('offers bank accounts only, as the options say', async () => {
    setup();
    const account = await screen.findByLabelText('Paid out of');
    expect(
      within(account)
        .getAllByRole('option')
        .map((option) => option.textContent)
    ).toEqual(['GTBank current · ending 4417']);
  });

  it('asks for every field and sends nothing', async () => {
    const { api } = setup();
    await user.click(
      await screen.findByRole('button', { name: 'Request refund' })
    );
    expect(await screen.findByText(WALLET_AMOUNT_MESSAGE)).toBeVisible();
    expect(screen.getByText(WALLET_REFUND_EMAIL_MESSAGE)).toBeVisible();
    expect(
      screen.getByText(WALLET_REFUND_PROOF_REQUIRED_MESSAGE)
    ).toBeVisible();
    expect(screen.getByText(WALLET_REFUND_REASON_MESSAGE)).toBeVisible();
    expect(api.wallets.requestRefund).not.toHaveBeenCalled();
    expect(api.files.upload).not.toHaveBeenCalled();
  });

  it('refuses more than the free money, naming the most', async () => {
    const { api } = setup();
    await fill('40000.01');
    expect(
      await screen.findByText(walletRefundOverMessage(4_000_000))
    ).toBeVisible();
    expect(api.wallets.requestRefund).not.toHaveBeenCalled();
  });

  it('confirms the family, the amount, the account and the email before sending, and Cancel sends nothing', async () => {
    const { api } = setup();
    await fill();
    const dialog = await confirmDialog();
    expect(within(dialog).getByText('Ngozi Okeke')).toBeVisible();
    expect(within(dialog).getByText('₦15,000.00')).toBeVisible();
    expect(
      within(dialog).getByText('GTBank current · ending 4417')
    ).toBeVisible();
    expect(within(dialog).getByText('ngozi@example.com')).toBeVisible();

    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => {
      expect(
        screen.queryByRole('dialog', { name: 'Ask for this refund?' })
      ).toBeNull();
    });
    expect(api.wallets.requestRefund).not.toHaveBeenCalled();
  });

  it('uploads the email as a refund request file, asks for the refund, toasts and closes', async () => {
    const { api, onOpenChange } = setup();
    await fill('15000.50');
    await user.click(
      within(await confirmDialog()).getByRole('button', {
        name: 'Request refund',
      })
    );

    await waitFor(() => {
      expect(api.wallets.requestRefund).toHaveBeenCalledTimes(1);
    });
    const form = (api.files.upload.mock.calls[0]?.[0] as { body: FormData })
      .body;
    expect(form.get('kind')).toBe('wallet_refund_request');
    expect(api.wallets.requestRefund.mock.calls[0]?.[0]).toMatchObject({
      params: { walletId: WALLET_ID },
      body: {
        moneyAccountId: BANK,
        amountMinor: 1_500_050,
        parentEmail: 'ngozi@example.com',
        reason: 'Paid twice by mistake',
        proofFileId: EMAIL_FILE_ID,
      },
    });
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(
        'Refund of ₦15,000.00 requested. A second person has to approve it.'
      );
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('warns instead of celebrating when the same reference was already recorded', async () => {
    setup({
      request: vi.fn().mockResolvedValue(requestedRefund({ replayed: true })),
    });
    await fill();
    await user.click(
      within(await confirmDialog()).getByRole('button', {
        name: 'Request refund',
      })
    );
    await waitFor(() => {
      expect(toast.warning).toHaveBeenCalledWith(
        'Reference WRQ-20261026-A1B2C3 was already recorded. Nothing was requested twice.'
      );
    });
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('shows the refusal, keeps the sheet open and uploads the email only once on a retry', async () => {
    const request = vi
      .fn()
      .mockRejectedValueOnce(
        new ApiError(422, {
          code: 'ValidationError',
          message: walletRefundOverMessage(1_000_000),
        })
      )
      .mockResolvedValue(requestedRefund());
    const { api, onOpenChange } = setup({ request });
    await fill();
    await user.click(
      within(await confirmDialog()).getByRole('button', {
        name: 'Request refund',
      })
    );
    expect(
      await screen.findByText(walletRefundOverMessage(1_000_000))
    ).toBeVisible();
    expect(onOpenChange).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Request refund' }));
    await user.click(
      within(await confirmDialog()).getByRole('button', {
        name: 'Request refund',
      })
    );
    await waitFor(() => {
      expect(api.wallets.requestRefund).toHaveBeenCalledTimes(2);
    });
    expect(api.files.upload).toHaveBeenCalledTimes(1);
  });

  it('says to add an account when the school has no bank account', async () => {
    setup({ options: refundOptions({ accounts: [] }) });
    expect(
      await screen.findByText('Add a bank account before asking for refunds.')
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Request refund' })
    ).toBeDisabled();
  });
});
