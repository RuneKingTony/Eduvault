import { screen, waitFor } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { ApiError } from '@eduvault/api-contract';
import { toast } from '@eduvault/ui';
import { settings } from '../test-school';
import { renderWithApi, starterAccess } from '../test-utils';
import { PaymentRulesPage } from './payment-rules-page';

vi.mock('@eduvault/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@eduvault/ui')>()),
  toast: { success: vi.fn(), error: vi.fn() },
}));

function setup(
  options: {
    current?: ReturnType<typeof settings>;
    access?: 'owner' | 'admin';
    failWith?: Error;
  } = {}
) {
  const current = options.current ?? settings();
  const api = {
    schoolSettings: {
      get: vi.fn().mockResolvedValue(current),
      update: vi.fn().mockResolvedValue(current),
      updatePaymentRules: vi
        .fn()
        .mockImplementation(() =>
          options.failWith === undefined
            ? Promise.resolve(current.paymentMethods)
            : Promise.reject(options.failWith)
        ),
    },
  };
  renderWithApi(
    <PaymentRulesPage />,
    api,
    options.access === 'admin' ? starterAccess('administrator') : undefined
  );
  return api;
}

const typeInto = async (user: UserEvent, field: HTMLElement, value: string) => {
  await user.clear(field);
  await user.type(field, value);
};

describe('PaymentRulesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists the three ways to pay, all on by default, with the receipt footer', async () => {
    setup();

    expect(
      await screen.findByRole('heading', { name: 'Payment rules' })
    ).toBeInTheDocument();
    for (const label of ['Cash', 'Bank transfer', 'POS']) {
      expect(screen.getByRole('switch', { name: label })).toBeChecked();
    }
    expect(screen.getByText('Paid in person at the bursary.')).toBeVisible();
    expect(screen.getByLabelText('Receipt footer')).toHaveValue(
      'Thank you for your payment.'
    );
  });

  it('switches a method off and says so', async () => {
    const user = userEvent.setup();
    const api = setup();
    await user.click(await screen.findByRole('switch', { name: 'POS' }));

    await waitFor(() => {
      expect(api.schoolSettings.updatePaymentRules).toHaveBeenCalledWith({
        body: { pos: false },
      });
    });
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(
        'POS is no longer an option when recording a payment.'
      );
    });
  });

  it('switches a method on and says so', async () => {
    const user = userEvent.setup();
    const api = setup({
      current: settings({
        paymentMethods: { cash: true, transfer: false, pos: true },
      }),
    });
    await user.click(
      await screen.findByRole('switch', { name: 'Bank transfer' })
    );

    await waitFor(() => {
      expect(api.schoolSettings.updatePaymentRules).toHaveBeenCalledWith({
        body: { transfer: true },
      });
    });
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(
        'Bank transfer is now an option when recording a payment.'
      );
    });
  });

  it('springs the switch back and shows the refusal when the last way is switched off', async () => {
    const user = userEvent.setup();
    setup({
      current: settings({
        paymentMethods: { cash: true, transfer: false, pos: false },
      }),
      failWith: new ApiError(400, {
        code: 'BadRequest',
        message: 'Keep at least one way to record a payment.',
      }),
    });
    const cash = await screen.findByRole('switch', { name: 'Cash' });
    await user.click(cash);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        'Keep at least one way to record a payment.'
      );
    });
    expect(screen.getByRole('switch', { name: 'Cash' })).toBeChecked();
  });

  it('saves the footer and says so', async () => {
    const user = userEvent.setup();
    const api = setup();
    const footer = await screen.findByLabelText('Receipt footer');
    await typeInto(user, footer, 'Thank God for your payment.');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => {
      expect(api.schoolSettings.update).toHaveBeenCalledWith({
        body: { receiptFooter: 'Thank God for your payment.' },
      });
    });
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Receipt wording saved.');
    });
  });

  it('refuses a footer over 120 characters before asking the server', async () => {
    const user = userEvent.setup();
    const api = setup();
    await typeInto(
      user,
      await screen.findByLabelText('Receipt footer'),
      'a'.repeat(121)
    );
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(
      await screen.findByText('Use 120 characters or fewer.')
    ).toBeVisible();
    expect(api.schoolSettings.update).not.toHaveBeenCalled();
  });

  it('is read-only without schoolAccount:update', async () => {
    setup({ access: 'admin' });

    expect(await screen.findByRole('switch', { name: 'Cash' })).toBeDisabled();
    expect(screen.getByLabelText('Receipt footer')).toBeDisabled();
    expect(
      screen.queryByRole('button', { name: 'Save changes' })
    ).not.toBeInTheDocument();
  });
});
