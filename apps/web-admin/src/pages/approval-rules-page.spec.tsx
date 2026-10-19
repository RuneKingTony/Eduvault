import { fireEvent, screen, waitFor } from '@testing-library/react';
import { ApiError, type ApprovalRules } from '@eduvault/api-contract';
import { ALL_PERMISSIONS, toPermissionMap } from '@eduvault/policy';
import { toast } from '@eduvault/ui';
import { renderPayments } from '../test-payments';
import { settings } from '../test-school';
import {
  actingAccess,
  fakeAccess,
  ownerAccess,
  starterAccess,
} from '../test-utils';
import { ApprovalRulesPage } from './approval-rules-page';

vi.mock('@eduvault/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@eduvault/ui')>()),
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

const RULES = [
  { key: 'refund', label: 'Refunds' },
  { key: 'writeOff', label: 'Cancelling a balance' },
  { key: 'creditNote', label: 'Reducing a fee' },
  { key: 'discount', label: 'Discounts' },
  { key: 'paymentVoid', label: 'Cancelling a payment' },
] as const;

const LABELS = RULES.map((rule) => rule.label);

const allOn: ApprovalRules = {
  refund: true,
  writeOff: true,
  creditNote: true,
  discount: true,
  paymentVoid: true,
};

function setup(
  options: {
    rules?: ApprovalRules;
    approvers?: string[];
    access?: ReturnType<typeof starterAccess>;
    failWith?: Error;
  } = {}
) {
  let rules = options.rules ?? allOn;
  const api = {
    schoolSettings: {
      get: vi.fn().mockImplementation(() =>
        Promise.resolve(
          settings({
            approvalRules: rules,
            approvers: options.approvers ?? ['Owner', 'Principal'],
          })
        )
      ),
      updateApprovalRules: vi
        .fn()
        .mockImplementation(({ body }: { body: Partial<ApprovalRules> }) => {
          if (options.failWith !== undefined) {
            return Promise.reject(options.failWith);
          }
          rules = { ...rules, ...body };
          return Promise.resolve(rules);
        }),
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

  it('lists the five requests, all switched on by default', async () => {
    setup();
    await screen.findByRole('switch', { name: 'Refunds' });
    expect(screen.getAllByRole('switch')).toHaveLength(RULES.length);
    for (const label of LABELS) {
      expect(screen.getByRole('switch', { name: label })).toBeChecked();
    }
  });

  it.each(RULES)(
    'shows only $label as off when the API says $key is off',
    async ({ key, label }) => {
      setup({ rules: { ...allOn, [key]: false } });
      expect(
        await screen.findByRole('switch', { name: label })
      ).not.toBeChecked();
      for (const other of LABELS.filter((name) => name !== label)) {
        expect(screen.getByRole('switch', { name: other })).toBeChecked();
      }
    }
  );

  it.each(RULES)(
    'switches $label off, sends only $key and shows it off',
    async ({ key, label }) => {
      const api = setup();
      fireEvent.click(await screen.findByRole('switch', { name: label }));

      await waitFor(() => {
        expect(api.schoolSettings.updateApprovalRules).toHaveBeenCalledWith({
          body: { [key]: false },
        });
      });
      await waitFor(() => {
        expect(screen.getByRole('switch', { name: label })).not.toBeChecked();
      });
      expect(toast.success).toHaveBeenCalledWith(
        'These requests now go through straight away.'
      );
      for (const other of LABELS.filter((name) => name !== label)) {
        expect(screen.getByRole('switch', { name: other })).toBeChecked();
      }
    }
  );

  it.each(RULES)(
    'switches $label back on, sends only $key and shows it on',
    async ({ key, label }) => {
      const api = setup({ rules: { ...allOn, [key]: false } });
      fireEvent.click(await screen.findByRole('switch', { name: label }));

      await waitFor(() => {
        expect(api.schoolSettings.updateApprovalRules).toHaveBeenCalledWith({
          body: { [key]: true },
        });
      });
      await waitFor(() => {
        expect(screen.getByRole('switch', { name: label })).toBeChecked();
      });
      expect(toast.success).toHaveBeenCalledWith(
        'These requests now wait for a boss to approve.'
      );
    }
  );

  it('toasts the refusal when the change is refused', async () => {
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
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('disables every switch for a member without schoolAccount:update', async () => {
    setup({ access: starterAccess('administrator') });
    await screen.findByRole('switch', { name: 'Refunds' });
    for (const label of LABELS) {
      expect(screen.getByRole('switch', { name: label })).toBeDisabled();
    }
  });

  it('disables every switch when acting read-only, which holds no schoolAccount:update', async () => {
    setup({ access: actingAccess(false) });
    await screen.findByRole('switch', { name: 'Refunds' });
    for (const label of LABELS) {
      expect(screen.getByRole('switch', { name: label })).toBeDisabled();
    }
  });

  it('enables the switches for a super admin acting with a reason', async () => {
    setup({ access: actingAccess(true) });
    await screen.findByRole('switch', { name: 'Refunds' });
    for (const label of LABELS) {
      expect(screen.getByRole('switch', { name: label })).toBeEnabled();
    }
  });

  it('lists the approvers the API returns', async () => {
    setup({ approvers: ['Owner', 'Cashier'] });
    expect(await screen.findByText('Cashier')).toBeVisible();
    expect(screen.getByText('Owner')).toBeVisible();
    expect(screen.queryByText('Principal')).toBeNull();
  });

  it('offers Change roles to someone who can see roles', async () => {
    setup();
    expect(
      await screen.findByRole('link', { name: /Change roles/ })
    ).toHaveAttribute('href', '/roles');
  });

  it('leaves Change roles out for a member without ac:read', async () => {
    setup({
      access: fakeAccess({
        ...ownerAccess(),
        permissions: toPermissionMap(
          ALL_PERMISSIONS.filter((permission) => permission !== 'ac:read')
        ),
      }),
    });
    await screen.findByRole('switch', { name: 'Refunds' });
    expect(screen.queryByRole('link', { name: /Change roles/ })).toBeNull();
  });
});
