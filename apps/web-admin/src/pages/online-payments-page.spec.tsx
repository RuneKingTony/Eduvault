import { screen, waitFor } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { ApiError, type GatewayConnection } from '@eduvault/api-contract';
import { toast } from '@eduvault/ui';
import {
  WEBHOOK_URL,
  connectedGateway,
  unconnectedGateway,
} from '../test-gateway';
import { renderWithApi } from '../test-utils';
import { OnlinePaymentsPage } from './online-payments-page';

vi.mock('@eduvault/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@eduvault/ui')>()),
  toast: { success: vi.fn(), error: vi.fn() },
}));

function setup(current: GatewayConnection = unconnectedGateway()) {
  const api = {
    gateway: {
      get: vi.fn().mockResolvedValue(current),
      save: vi.fn().mockResolvedValue(current),
      test: vi.fn().mockResolvedValue({
        ok: true,
        message: 'Connected to Monnify.',
        testedAt: '2026-10-24T12:00:00.000Z',
        connection: current,
      }),
    },
  };
  renderWithApi(<OnlinePaymentsPage />, api);
  return api;
}

const typeInto = async (user: UserEvent, field: HTMLElement, value: string) => {
  await user.clear(field);
  await user.type(field, value);
};

describe('OnlinePaymentsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('asks for the keys of a school that has not connected, and gives it the webhook URL', async () => {
    setup();

    expect(
      await screen.findByRole('heading', { name: 'Online payments' })
    ).toBeVisible();
    expect(screen.getByLabelText('Mode')).toHaveValue('sandbox');
    expect(screen.getByLabelText('Contract code')).toHaveValue('');
    expect(screen.getByLabelText('API key')).toHaveValue('');
    expect(screen.getByLabelText('Webhook URL')).toHaveValue(WEBHOOK_URL);
    expect(screen.getByLabelText('Webhook URL')).toHaveAttribute('readonly');
    expect(screen.getByText('Save the connection first.')).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Test connection' })
    ).toBeDisabled();
  });

  it('shows a saved connection with masked tails and never the keys themselves', async () => {
    setup(connectedGateway({ mode: 'live' }));

    expect(await screen.findByLabelText('Mode')).toHaveValue('live');
    expect(screen.getByLabelText('Contract code')).toHaveValue('2957982769');
    expect(screen.getByLabelText('API key')).toHaveValue('');
    expect(screen.getByLabelText('API key')).toHaveAttribute(
      'placeholder',
      '••••EFGH'
    );
    expect(screen.getByLabelText('Secret key')).toHaveValue('');
    expect(
      screen.getByText('Saved as ••••EFGH. Leave blank to keep it.')
    ).toBeVisible();
    expect(
      screen.getByText('Saved as ••••1234. Leave blank to keep it.')
    ).toBeVisible();
    expect(screen.getByText('Not tested yet.')).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Test connection' })
    ).toBeEnabled();
  });

  it('keeps both keys as password fields', async () => {
    setup();

    expect(await screen.findByLabelText('API key')).toHaveAttribute(
      'type',
      'password'
    );
    expect(screen.getByLabelText('Secret key')).toHaveAttribute(
      'type',
      'password'
    );
  });

  it('saves what was typed and says to test it', async () => {
    const user = userEvent.setup();
    const api = setup();
    await typeInto(user, await screen.findByLabelText('Contract code'), '555');
    await typeInto(user, screen.getByLabelText('API key'), 'MK_TEST_ABCD');
    await typeInto(user, screen.getByLabelText('Secret key'), 'SECRET-1');
    await user.selectOptions(screen.getByLabelText('Mode'), 'live');
    await user.click(screen.getByRole('button', { name: 'Save connection' }));

    await waitFor(() => {
      expect(api.gateway.save).toHaveBeenCalledWith({
        body: {
          mode: 'live',
          contractCode: '555',
          apiKey: 'MK_TEST_ABCD',
          secretKey: 'SECRET-1',
        },
      });
    });
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(
        'Online payments saved. Test the connection next.'
      );
    });
  });

  it('leaves the keys out when they are left blank, so the saved ones stay', async () => {
    const user = userEvent.setup();
    const api = setup(connectedGateway());
    await typeInto(user, await screen.findByLabelText('Contract code'), '999');
    await user.click(screen.getByRole('button', { name: 'Save connection' }));

    await waitFor(() => {
      expect(api.gateway.save).toHaveBeenCalledWith({
        body: { mode: 'sandbox', contractCode: '999' },
      });
    });
  });

  it('asks for a contract code instead of sending nothing', async () => {
    const user = userEvent.setup();
    const api = setup();
    await user.click(
      await screen.findByRole('button', { name: 'Save connection' })
    );

    expect(await screen.findByText('Enter the contract code.')).toBeVisible();
    expect(api.gateway.save).not.toHaveBeenCalled();
  });

  it('toasts the server’s refusal, such as new keys being needed for another mode', async () => {
    const user = userEvent.setup();
    const api = setup(connectedGateway());
    api.gateway.save.mockRejectedValue(
      new ApiError(400, {
        code: 'BadRequest',
        message:
          'Enter the API key and the secret key to connect, or to change between sandbox and live.',
      })
    );
    await user.selectOptions(await screen.findByLabelText('Mode'), 'live');
    await user.click(screen.getByRole('button', { name: 'Save connection' }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        'Enter the API key and the secret key to connect, or to change between sandbox and live.'
      );
    });
  });

  it('tests the connection and reports a good result', async () => {
    const user = userEvent.setup();
    const api = setup(connectedGateway());
    await user.click(
      await screen.findByRole('button', { name: 'Test connection' })
    );

    await waitFor(() => {
      expect(api.gateway.test).toHaveBeenCalledWith({});
    });
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Connected to Monnify.');
    });
  });

  it('reports a failed test as an error', async () => {
    const user = userEvent.setup();
    const api = setup(connectedGateway());
    api.gateway.test.mockResolvedValue({
      ok: false,
      message:
        'Monnify did not accept these keys. Check the mode, API key and secret key.',
      testedAt: '2026-10-24T12:00:00.000Z',
      connection: connectedGateway({ lastTestOk: false }),
    });
    await user.click(
      await screen.findByRole('button', { name: 'Test connection' })
    );

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        'Monnify did not accept these keys. Check the mode, API key and secret key.'
      );
    });
  });

  it('says when the last test passed and when it failed', async () => {
    const passed = connectedGateway({
      lastTestedAt: '2026-10-24T11:15:00.000Z',
      lastTestOk: true,
    });
    setup(passed);
    expect(await screen.findByText(/Connected when tested on/)).toBeVisible();
  });

  it('says the last test failed', async () => {
    setup(
      connectedGateway({
        lastTestedAt: '2026-10-24T11:15:00.000Z',
        lastTestOk: false,
      })
    );
    expect(await screen.findByText(/The last test failed on/)).toBeVisible();
  });
});
