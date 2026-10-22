import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from '@eduvault/ui';
import { ApprovalsPage } from '../../pages/approvals-page';
import {
  approvalList,
  approvalSummary,
  leaveApproval,
  storeWriteOffApproval,
  voidApproval,
  voidRow,
} from '../../test-approvals';
import { myLeave } from '../../test-leave';
import { renderPayments } from '../../test-payments';
import { starterAccess } from '../../test-utils';
import { ApprovalsBell } from './approvals-bell';

vi.mock('@eduvault/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@eduvault/ui')>()),
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

function setup(
  options: {
    summary?: ReturnType<typeof approvalSummary>;
    access?: ReturnType<typeof starterAccess>;
    withQueue?: boolean;
  } = {}
) {
  const api = {
    approvals: {
      summary: vi.fn().mockResolvedValue(options.summary ?? approvalSummary()),
      list: vi.fn().mockResolvedValue(approvalList([voidApproval()])),
    },
    paymentVoids: {
      approve: vi.fn().mockResolvedValue(voidRow({ status: 'approved' })),
    },
    leave: { me: vi.fn().mockResolvedValue(myLeave()) },
  };
  const { router } = renderPayments(
    <>
      <ApprovalsBell />
      {options.withQueue === true ? (
        <ApprovalsPage search={{}} onSearchChange={vi.fn()} />
      ) : null}
    </>,
    api,
    { access: options.access ?? starterAccess('principal'), path: '/approvals' }
  );
  return { api, router };
}

describe('ApprovalsBell', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows how many requests the viewer can decide', async () => {
    setup();
    const bell = await screen.findByRole('button', { name: 'Approvals' });
    expect(await within(bell).findByText('7')).toBeVisible();
  });

  it('lists the first requests with kind, details and amount, and offers Open approvals', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(await screen.findByRole('button', { name: 'Approvals' }));

    expect(await screen.findByText('Waiting for you')).toBeVisible();
    expect(
      screen.getByRole('button', { name: /Open approvals/ })
    ).toBeVisible();
    expect(screen.getByText('Cancel a payment')).toBeVisible();
    expect(
      screen.getByText('RCT-2026-00098 from Mrs Danjuma: Keyed the wrong child')
    ).toBeVisible();
    expect(screen.getByText('₦20,000')).toBeVisible();
    expect(screen.getByText('Cancel a balance')).toBeVisible();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it('opens the page of the request that was chosen', async () => {
    const user = userEvent.setup();
    const { router } = setup();
    await user.click(await screen.findByRole('button', { name: 'Approvals' }));
    await user.click(await screen.findByText('Cancel a payment'));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/finance/adjustments');
    });
    expect(router.state.location.search).toMatchObject({ tab: 'voids' });
  });

  it('opens the Leave tab of Approvals for a leave request', async () => {
    const user = userEvent.setup();
    const { router } = setup({
      summary: approvalSummary({
        waitingForMe: 1,
        byNav: { approvals: 1, payments: 0, store: 0 },
        preview: [leaveApproval()],
      }),
    });
    await user.click(await screen.findByRole('button', { name: 'Approvals' }));
    expect(await screen.findByText('2 days')).toBeVisible();
    await user.click(await screen.findByText('Leave'));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/approvals');
    });
    expect(router.state.location.search).toMatchObject({ tab: 'leave' });
  });

  it('counts a leave-only approver’s waiting leave', async () => {
    const { api } = setup({
      access: starterAccess('principal'),
      summary: approvalSummary({
        waitingForMe: 1,
        byNav: { approvals: 1, payments: 0, store: 0 },
        preview: [leaveApproval()],
      }),
    });
    const bell = await screen.findByRole('button', { name: 'Approvals' });
    expect(await within(bell).findByText('1')).toBeVisible();
    expect(api.approvals.summary).toHaveBeenCalled();
  });

  it('opens the Stock counts tab for a store write-off', async () => {
    const user = userEvent.setup();
    const { router } = setup({
      summary: approvalSummary({
        waitingForMe: 1,
        byNav: { approvals: 1, payments: 0, store: 1 },
        preview: [storeWriteOffApproval()],
      }),
    });
    await user.click(await screen.findByRole('button', { name: 'Approvals' }));
    await user.click(await screen.findByText('Store write-off'));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/finance/store');
    });
    expect(router.state.location.search).toMatchObject({ tab: 'counts' });
  });

  it('says All clear with no count when nothing waits', async () => {
    const user = userEvent.setup();
    setup({
      summary: approvalSummary({
        waitingForMe: 0,
        byNav: { approvals: 0, payments: 0, store: 0 },
        preview: [],
      }),
    });
    const bell = await screen.findByRole('button', { name: 'Approvals' });
    await user.click(bell);

    expect(await screen.findByText('All clear')).toBeVisible();
    expect(
      screen.getByText('Nothing is waiting for your approval.')
    ).toBeVisible();
    expect(screen.queryByRole('button', { name: /Open approvals/ })).toBeNull();
    expect(within(bell).queryByText('0')).toBeNull();
  });

  it('asks nothing of a member who cannot approve and says All clear', async () => {
    const user = userEvent.setup();
    const { api } = setup({ access: starterAccess('bursar') });
    await user.click(await screen.findByRole('button', { name: 'Approvals' }));
    expect(await screen.findByText('All clear')).toBeVisible();
    expect(api.approvals.summary).not.toHaveBeenCalled();
  });

  it('counts again after a decision is made on the Approvals page', async () => {
    const user = userEvent.setup();
    const { api } = setup({ withQueue: true });
    const bell = await screen.findByRole('button', { name: 'Approvals' });
    expect(await within(bell).findByText('7')).toBeVisible();
    const before = api.approvals.summary.mock.calls.length;

    await user.click(await screen.findByRole('button', { name: /^Approve:/ }));
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', {
        name: 'Approve',
      })
    );

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(api.approvals.summary.mock.calls.length).toBeGreaterThan(before);
    });
  });
});
