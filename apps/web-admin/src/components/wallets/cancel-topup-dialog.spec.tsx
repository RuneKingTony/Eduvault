import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  ApiError,
  WALLET_CANCEL_REASON_MESSAGE,
  walletCancelOverMessage,
} from '@eduvault/api-contract';
import { toast } from '@eduvault/ui';
import {
  TOP_UP_MOVEMENT_ID,
  WALLET_ID,
  movement,
  renderWallets,
  requestedCancellation,
} from '../../test-wallets';
import { CancelTopUpDialog } from './cancel-topup-dialog';

vi.mock('@eduvault/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@eduvault/ui')>()),
  toast: Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  }),
}));

function setup(request?: ReturnType<typeof vi.fn>) {
  const api = {
    wallets: {
      requestCancellation:
        request ?? vi.fn().mockResolvedValue(requestedCancellation()),
    },
  };
  const onClose = vi.fn();
  renderWallets(
    <CancelTopUpDialog
      walletId={WALLET_ID}
      movement={movement()}
      currency="NGN"
      onClose={onClose}
    />,
    api
  );
  return { api, onClose };
}

let user: ReturnType<typeof userEvent.setup>;

const ask = async (reason = 'Keyed against the wrong family') => {
  await user.type(await screen.findByLabelText('Reason'), reason);
  await user.click(
    screen.getByRole('button', { name: 'Request cancellation' })
  );
};

describe('CancelTopUpDialog', () => {
  beforeEach(() => {
    user = userEvent.setup();
    vi.clearAllMocks();
  });

  it('names the top-up and its amount and says a second person decides', async () => {
    setup();
    const dialog = await screen.findByRole('dialog', {
      name: 'Cancel this top-up?',
    });
    expect(within(dialog).getByText('CSH-20261007-K3Q7ZA')).toBeVisible();
    expect(within(dialog).getByText('₦50,000.00')).toBeVisible();
    expect(
      within(dialog).getByText(/A second person has to approve it/)
    ).toBeVisible();
  });

  it('needs a reason and sends nothing without one', async () => {
    const { api } = setup();
    await user.click(
      await screen.findByRole('button', { name: 'Request cancellation' })
    );
    expect(await screen.findByText(WALLET_CANCEL_REASON_MESSAGE)).toBeVisible();
    expect(api.wallets.requestCancellation).not.toHaveBeenCalled();
  });

  it('asks for the cancellation of that top-up with a generated reference, toasts and closes', async () => {
    const { api, onClose } = setup();
    await ask();

    await waitFor(() => {
      expect(api.wallets.requestCancellation).toHaveBeenCalledTimes(1);
    });
    const call = api.wallets.requestCancellation.mock.calls[0]?.[0] as {
      params: object;
      body: { reference: string; reason: string };
    };
    expect(call.params).toEqual({
      walletId: WALLET_ID,
      topUpId: TOP_UP_MOVEMENT_ID,
    });
    expect(call.body.reason).toBe('Keyed against the wrong family');
    expect(call.body.reference).toMatch(/^WTQ-\d{8}-[A-Z2-7]{6}$/);
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(
        'Cancellation of ₦50,000.00 requested. A second person has to approve it.'
      );
    });
    expect(onClose).toHaveBeenCalled();
  });

  it('keeps the same reference on a retry after a refusal, so a repeat replays', async () => {
    const request = vi
      .fn()
      .mockRejectedValueOnce(
        new ApiError(422, {
          code: 'ValidationError',
          message: walletCancelOverMessage(5_000_000, 1_000_000),
        })
      )
      .mockResolvedValue(requestedCancellation());
    const { api } = setup(request);
    await ask();
    expect(
      await screen.findByText(walletCancelOverMessage(5_000_000, 1_000_000))
    ).toBeVisible();

    await user.click(
      screen.getByRole('button', { name: 'Request cancellation' })
    );
    await waitFor(() => {
      expect(api.wallets.requestCancellation).toHaveBeenCalledTimes(2);
    });
    const references = api.wallets.requestCancellation.mock.calls.map(
      (call) => (call[0] as { body: { reference: string } }).body.reference
    );
    expect(references[0]).toBe(references[1]);
  });

  it('warns when the same reference was already recorded', async () => {
    setup(vi.fn().mockResolvedValue(requestedCancellation({ replayed: true })));
    await ask();
    await waitFor(() => {
      expect(toast.warning).toHaveBeenCalledWith(
        'Reference WTQ-20261026-D4E5F6 was already recorded. Nothing was requested twice.'
      );
    });
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('closes without sending on Cancel', async () => {
    const { api, onClose } = setup();
    await user.click(await screen.findByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalled();
    expect(api.wallets.requestCancellation).not.toHaveBeenCalled();
  });

  it('shows nothing when no top-up is chosen', () => {
    renderWallets(
      <CancelTopUpDialog
        walletId={WALLET_ID}
        movement={null}
        currency="NGN"
        onClose={vi.fn()}
      />,
      {}
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
