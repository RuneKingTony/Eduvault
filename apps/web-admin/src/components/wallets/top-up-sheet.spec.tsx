import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  ApiError,
  PAYMENT_PROOF_TYPE_MESSAGE,
  WALLET_AMOUNT_MESSAGE,
  WALLET_PROOF_REQUIRED_MESSAGE,
} from '@eduvault/api-contract';
import { toast } from '@eduvault/ui';
import {
  BANK,
  RECEIPT_FILE_ID,
  TILL,
  WALLET_ID,
  renderWallets,
  toppedUp,
  topUpOptions,
  wallet,
} from '../../test-wallets';
import { TopUpSheet } from './top-up-sheet';

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
    options?: ReturnType<typeof topUpOptions>;
    topUp?: ReturnType<typeof vi.fn>;
  } = {}
) {
  const api = {
    wallets: {
      topUpOptions: vi
        .fn()
        .mockResolvedValue(options.options ?? topUpOptions()),
      topUp: options.topUp ?? vi.fn().mockResolvedValue(toppedUp()),
    },
    files: {
      upload: vi.fn().mockResolvedValue({
        id: RECEIPT_FILE_ID,
        contentType: 'application/pdf',
        byteSize: 8,
        originalName: 'slip.pdf',
      }),
    },
  };
  const onOpenChange = vi.fn();
  const view = renderWallets(
    <TopUpSheet wallet={wallet()} open onOpenChange={onOpenChange} />,
    api
  );
  return { api, onOpenChange, ...view };
}

let user: ReturnType<typeof userEvent.setup>;

const amount = () => screen.getByLabelText('Amount received (₦)');
const slip = () => new File(['x'], 'slip.pdf', { type: 'application/pdf' });
const confirmDialog = () =>
  screen.findByRole('dialog', { name: 'Add this to the wallet?' });

async function recordWith(amountText = '50000') {
  await user.type(
    await screen.findByLabelText('Amount received (₦)'),
    amountText
  );
  await user.upload(
    screen.getByLabelText('Receipt or proof of payment'),
    slip()
  );
  await user.click(screen.getByRole('button', { name: 'Record top-up' }));
}

describe('TopUpSheet', () => {
  beforeEach(() => {
    user = userEvent.setup();
    vi.clearAllMocks();
  });

  it('opens on cash, today and the first account, with a generated reference', async () => {
    setup();
    expect(await screen.findByLabelText('How they paid')).toHaveValue('cash');
    expect(screen.getByLabelText('Into')).toHaveValue(TILL);
    expect(screen.getByLabelText('Received on')).toHaveValue('2026-10-07');
    expect(amount()).toHaveValue('');
    expect(screen.getByLabelText('Our reference')).toHaveDisplayValue(
      /^CSH-20261007-[A-Z2-7]{6}$/
    );
    expect(
      screen.getByText('Money Ngozi Okeke has paid into the family wallet.')
    ).toBeVisible();
  });

  it('offers only the ways of paying that are switched on, and the accounts that take the chosen one', async () => {
    setup({
      options: topUpOptions({
        methods: { cash: true, transfer: true, pos: false },
      }),
    });
    const how = await screen.findByLabelText('How they paid');
    expect(
      within(how)
        .getAllByRole('option')
        .map((option) => option.textContent)
    ).toEqual(['Cash', 'Bank transfer']);
    await user.selectOptions(how, 'transfer');
    expect(screen.getByLabelText('Into')).toHaveValue(BANK);
    expect(
      within(screen.getByLabelText('Into'))
        .getAllByRole('option')
        .map((option) => option.textContent)
    ).toEqual(['GTBank current · ending 4417']);
    expect(screen.getByLabelText('Our reference')).toHaveDisplayValue(/^TRF-/);
  });

  it('keeps a reference the person typed when the way of paying changes', async () => {
    setup();
    const reference = await screen.findByLabelText('Our reference');
    await user.clear(reference);
    await user.type(reference, 'MY-OWN-1');
    await user.selectOptions(screen.getByLabelText('How they paid'), 'pos');
    expect(screen.getByLabelText('Our reference')).toHaveValue('MY-OWN-1');
  });

  it('asks for the amount and the receipt, and sends nothing', async () => {
    const { api } = setup();
    await user.click(
      await screen.findByRole('button', { name: 'Record top-up' })
    );
    expect(await screen.findByText(WALLET_AMOUNT_MESSAGE)).toBeVisible();
    expect(screen.getByText(WALLET_PROOF_REQUIRED_MESSAGE)).toBeVisible();
    expect(api.wallets.topUp).not.toHaveBeenCalled();
    expect(api.files.upload).not.toHaveBeenCalled();
  });

  it('refuses a receipt that is not a photo, a screenshot or a PDF', async () => {
    const { api } = setup();
    const word = new File(['x'], 'slip.docx', {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    await user.type(
      await screen.findByLabelText('Amount received (₦)'),
      '1000'
    );
    const anyFile = userEvent.setup({ applyAccept: false });
    await anyFile.upload(
      screen.getByLabelText('Receipt or proof of payment'),
      word
    );
    await user.click(screen.getByRole('button', { name: 'Record top-up' }));
    expect(await screen.findByText(PAYMENT_PROOF_TYPE_MESSAGE)).toBeVisible();
    expect(api.wallets.topUp).not.toHaveBeenCalled();
  });

  it('confirms with the family, the amount and the account before posting', async () => {
    const { api } = setup();
    await recordWith('50000');
    const dialog = await confirmDialog();
    expect(within(dialog).getByText('Ngozi Okeke')).toBeVisible();
    expect(within(dialog).getByText('₦50,000.00')).toBeVisible();
    expect(within(dialog).getByText('Lekki cash till')).toBeVisible();
    expect(api.wallets.topUp).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => {
      expect(
        screen.queryByRole('dialog', { name: 'Add this to the wallet?' })
      ).toBeNull();
    });
    expect(api.wallets.topUp).not.toHaveBeenCalled();
  });

  it('uploads the receipt as a wallet proof, records the top-up, toasts and closes', async () => {
    const { api, onOpenChange } = setup();
    await recordWith('50000.50');
    const dialog = await confirmDialog();
    await user.click(
      within(dialog).getByRole('button', { name: 'Record top-up' })
    );

    await waitFor(() => {
      expect(api.wallets.topUp).toHaveBeenCalledTimes(1);
    });
    const form = (api.files.upload.mock.calls[0]?.[0] as { body: FormData })
      .body;
    expect(form.get('kind')).toBe('wallet_proof');
    expect(api.wallets.topUp.mock.calls[0]?.[0]).toMatchObject({
      params: { walletId: WALLET_ID },
      body: {
        moneyAccountId: TILL,
        method: 'cash',
        amountMinor: 5_000_050,
        receivedOn: '2026-10-07',
        proofFileId: RECEIPT_FILE_ID,
      },
    });
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(
        '₦50,000.00 added to Ngozi Okeke’s wallet.'
      );
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('warns instead of celebrating when the same reference was already recorded', async () => {
    setup({
      topUp: vi.fn().mockResolvedValue(toppedUp({ replayed: true })),
    });
    await recordWith();
    await user.click(
      within(await confirmDialog()).getByRole('button', {
        name: 'Record top-up',
      })
    );
    await waitFor(() => {
      expect(toast.warning).toHaveBeenCalledWith(
        'Reference CSH-20261007-K3Q7ZA was already recorded. Nothing was added twice.'
      );
    });
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('shows the refusal, keeps the sheet open and uploads the receipt only once on a retry', async () => {
    const topUp = vi
      .fn()
      .mockRejectedValueOnce(
        new ApiError(409, {
          code: 'Conflict',
          message: 'That reference is already used by another record.',
        })
      )
      .mockResolvedValue(toppedUp());
    const { api, onOpenChange } = setup({ topUp });
    await recordWith();
    await user.click(
      within(await confirmDialog()).getByRole('button', {
        name: 'Record top-up',
      })
    );
    expect(
      await screen.findByText(
        'That reference is already used by another record.'
      )
    ).toBeVisible();
    expect(onOpenChange).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Record top-up' }));
    await user.click(
      within(await confirmDialog()).getByRole('button', {
        name: 'Record top-up',
      })
    );
    await waitFor(() => {
      expect(api.wallets.topUp).toHaveBeenCalledTimes(2);
    });
    expect(api.files.upload).toHaveBeenCalledTimes(1);
  });

  it('says to add an account when none can take money', async () => {
    setup({ options: topUpOptions({ accounts: [] }) });
    expect(
      await screen.findByText(
        'Add a bank or cash account before recording top-ups.'
      )
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Record top-up' })
    ).toBeDisabled();
  });
});
