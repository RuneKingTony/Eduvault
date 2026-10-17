import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { ApiError } from '@eduvault/api-contract';
import { toast } from '@eduvault/ui';
import { renderPayments } from '../test-payments';
import { settings } from '../test-school';
import { actingAccess, starterAccess } from '../test-utils';
import { ApprovalRulesPage } from './approval-rules-page';

vi.mock('@eduvault/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@eduvault/ui')>()),
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

const LABELS = [
  'Refunds',
  'Cancelling a balance',
  'Reducing a fee',
  'Discounts',
  'Cancelling a payment',
];

function setup(
  options: {
    current?: ReturnType<typeof settings>;
    access?: ReturnType<typeof starterAccess>;
    failWith?: Error;
  } = {}
) {
  const current = options.current ?? settings();
  const api = {
    schoolSettings: {
      get: vi.fn().mockResolvedValue(current),
      updateApprovalRules: vi
        .fn()
        .mockImplementation(() =>
          options.failWith === undefined
            ? Promise.resolve(current.approvalRules)
            : Promise.reject(options.failWith)
        ),
    },
  };
  renderPayments(<ApprovalRulesPage />, api, {
    access: options.access,
    path: '/settings/approvals',
  });
  return api;
}

describe('ApprovalRulesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('titles the page and lists the five requests, all switched on by default', async () => {
    setup();
    expect(
      await screen.findByRole('heading', { name: 'Approval rules' })
    ).toBeVisible();
    expect(
      screen.getByText(
        'Choose which money changes need a boss to say yes first.'
      )
    ).toBeVisible();
    expect(
      screen.getByText(
        'Switched on, the request waits in Approvals until a boss says yes. Switched off, it goes through straight away. Payments received never wait.'
      )
    ).toBeVisible();
    for (const label of LABELS) {
      expect(screen.getByRole('switch', { name: label })).toBeChecked();
    }
    expect(
      screen.getByText('Paying money back to a family that overpaid')
    ).toBeVisible();
    expect(
      screen.getByText('Undoing a receipt that was recorded wrongly')
    ).toBeVisible();
  });

  it('shows a switch that is off as off', async () => {
    setup({
      current: settings({
        approvalRules: {
          refund: false,
          writeOff: true,
          creditNote: true,
          discount: true,
          paymentVoid: true,
        },
      }),
    });
    expect(
      await screen.findByRole('switch', { name: 'Refunds' })
    ).not.toBeChecked();
    expect(screen.getByRole('switch', { name: 'Discounts' })).toBeChecked();
  });

  it('switches a request off and says it now goes through straight away', async () => {
    const api = setup();
    fireEvent.click(await screen.findByRole('switch', { name: 'Refunds' }));

    await waitFor(() => {
      expect(api.schoolSettings.updateApprovalRules).toHaveBeenCalledWith({
        body: { refund: false },
      });
    });
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(
        'These requests now go through straight away.'
      );
    });
  });

  it('switches a request on and says it now waits for a boss', async () => {
    const api = setup({
      current: settings({
        approvalRules: {
          refund: true,
          writeOff: true,
          creditNote: true,
          discount: false,
          paymentVoid: true,
        },
      }),
    });
    fireEvent.click(await screen.findByRole('switch', { name: 'Discounts' }));

    await waitFor(() => {
      expect(api.schoolSettings.updateApprovalRules).toHaveBeenCalledWith({
        body: { discount: true },
      });
    });
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(
        'These requests now wait for a boss to approve.'
      );
    });
  });

  it('toasts the refusal and keeps the switch as it was when the change is refused', async () => {
    setup({
      failWith: new ApiError(403, {
        code: 'Forbidden',
        message: 'Missing permission',
      }),
    });
    fireEvent.click(await screen.findByRole('switch', { name: 'Refunds' }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        'You need permission to change school settings.'
      );
    });
    expect(screen.getByRole('switch', { name: 'Refunds' })).toBeChecked();
  });

  it('disables every switch for a member without schoolAccount:update', async () => {
    setup({ access: starterAccess('administrator') });
    await screen.findByRole('switch', { name: 'Refunds' });
    for (const label of LABELS) {
      expect(screen.getByRole('switch', { name: label })).toBeDisabled();
    }
  });

  it('disables every switch for a super admin acting read-only', async () => {
    setup({ access: actingAccess(false) });
    await screen.findByRole('switch', { name: 'Refunds' });
    for (const label of LABELS) {
      expect(screen.getByRole('switch', { name: label })).toBeDisabled();
    }
  });

  it('says who can approve, with the owner and each role that holds the permission', async () => {
    setup();
    const section = (await screen.findByText('Who can approve')).closest(
      'div[data-slot="card"]'
    );
    expect(section).not.toBeNull();
    const card = within(section as HTMLElement);
    expect(
      card.getByText('Nobody can approve their own request.')
    ).toBeVisible();
    expect(card.getByText('Owner')).toBeVisible();
    expect(card.getByText('Principal')).toBeVisible();
    expect(
      card.getByText('Anyone with one of these roles can approve.')
    ).toBeVisible();
  });

  it('offers Change roles only to someone who can see roles', async () => {
    setup();
    expect(
      await screen.findByRole('link', { name: /Change roles/ })
    ).toHaveAttribute('href', '/roles');
  });
});
