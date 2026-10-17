import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { toast } from '@eduvault/ui';
import { ApprovalsPage } from '../../pages/approvals-page';
import {
  approvalList,
  approvalSummary,
  storeWriteOffApproval,
  voidApproval,
} from '../../test-approvals';
import { renderPayments } from '../../test-payments';
import { starterAccess } from '../../test-utils';
import {
  approvalsSummaryQueryOptions,
  APPROVALS_REFRESH_MS,
} from '../../queries';
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
      approve: vi.fn().mockResolvedValue({ id: 'x', status: 'approved' }),
    },
  };
  const { router } = renderPayments(
    <>
      <ApprovalsBell />
      {options.withQueue === true ? <ApprovalsPage /> : null}
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
    expect(await within(bell).findByText('2')).toBeVisible();
  });

  it('lists the first requests with kind, details and amount, and offers Open approvals', async () => {
    setup();
    fireEvent.click(await screen.findByRole('button', { name: 'Approvals' }));

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
  });

  it('opens the page of the request that was chosen', async () => {
    const { router } = setup();
    fireEvent.click(await screen.findByRole('button', { name: 'Approvals' }));
    fireEvent.click(await screen.findByText('Cancel a payment'));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/finance/adjustments');
    });
    expect(router.state.location.search).toMatchObject({ tab: 'voids' });
  });

  it('opens the Stock counts tab for a store write-off', async () => {
    const { router } = setup({
      summary: approvalSummary({
        waitingForMe: 1,
        byNav: { approvals: 1, payments: 0, store: 1 },
        preview: [storeWriteOffApproval()],
      }),
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Approvals' }));
    fireEvent.click(await screen.findByText('Store write-off'));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/finance/store');
    });
    expect(router.state.location.search).toMatchObject({ tab: 'counts' });
  });

  it('says All clear with no count when nothing waits', async () => {
    setup({
      summary: approvalSummary({
        waitingForMe: 0,
        byNav: { approvals: 0, payments: 0, store: 0 },
        preview: [],
      }),
    });
    const bell = await screen.findByRole('button', { name: 'Approvals' });
    fireEvent.click(bell);

    expect(await screen.findByText('All clear')).toBeVisible();
    expect(
      screen.getByText('Nothing is waiting for your approval.')
    ).toBeVisible();
    expect(screen.queryByRole('button', { name: /Open approvals/ })).toBeNull();
    expect(within(bell).queryByText('0')).toBeNull();
  });

  it('asks nothing of a member who cannot approve and says All clear', async () => {
    const { api } = setup({ access: starterAccess('bursar') });
    fireEvent.click(await screen.findByRole('button', { name: 'Approvals' }));
    expect(await screen.findByText('All clear')).toBeVisible();
    expect(api.approvals.summary).not.toHaveBeenCalled();
  });

  it('counts again after a decision is made on the Approvals page', async () => {
    const { api } = setup({ withQueue: true });
    await screen.findByText('2');
    const before = api.approvals.summary.mock.calls.length;

    fireEvent.click(await screen.findByRole('button', { name: /^Approve:/ }));
    fireEvent.click(
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

describe('approvalsSummaryQueryOptions', () => {
  it('refetches every minute so the bell stays fresh', () => {
    const options = approvalsSummaryQueryOptions({} as never);
    expect(options.refetchInterval).toBe(APPROVALS_REFRESH_MS);
    expect(APPROVALS_REFRESH_MS).toBe(60_000);
  });
});
