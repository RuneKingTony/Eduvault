import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { ApiError } from '@eduvault/api-contract';
import { toast } from '@eduvault/ui';
import {
  ADJUSTMENT_ID,
  VOID_ID,
  approvalItem,
  approvalList,
  discountApproval,
  storeWriteOffApproval,
  voidApproval,
  COUNT_APPROVAL_ID,
} from '../test-approvals';
import { APPROVAL_KIND_UI } from '../components/approvals/approval-copy';
import { renderPayments } from '../test-payments';
import { actingAccess, starterAccess } from '../test-utils';
import { ApprovalsPage } from './approvals-page';

vi.mock('@eduvault/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@eduvault/ui')>()),
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

function setup(
  options: {
    list?: ReturnType<typeof approvalList>;
    listFor?: (page: number) => ReturnType<typeof approvalList>;
    access?: ReturnType<typeof starterAccess>;
    approveFails?: Error;
  } = {}
) {
  const done = { id: 'x', status: 'approved' };
  const api = {
    approvals: {
      list: vi
        .fn()
        .mockImplementation(({ query }: { query: { page: number } }) =>
          Promise.resolve(
            options.listFor?.(query.page) ?? options.list ?? approvalList()
          )
        ),
    },
    paymentVoids: {
      approve: vi
        .fn()
        .mockImplementation(() =>
          options.approveFails === undefined
            ? Promise.resolve(done)
            : Promise.reject(options.approveFails)
        ),
      decline: vi.fn().mockResolvedValue(done),
    },
    adjustments: {
      approve: vi.fn().mockResolvedValue(done),
      decline: vi.fn().mockResolvedValue(done),
    },
    studentDiscounts: {
      approve: vi.fn().mockResolvedValue(done),
      decline: vi.fn().mockResolvedValue(done),
    },
    stockCounts: {
      approve: vi.fn().mockResolvedValue(done),
      decline: vi.fn().mockResolvedValue(done),
    },
  };
  renderPayments(<ApprovalsPage />, api, {
    access: options.access ?? starterAccess('principal'),
    path: '/approvals',
  });
  return api;
}

describe('ApprovalsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows a member who cannot approve the empty state and asks nothing', async () => {
    const api = setup({ access: starterAccess('bursar') });
    expect(await screen.findByText('Nothing to approve')).toBeVisible();
    expect(api.approvals.list).not.toHaveBeenCalled();
  });

  it('lists each waiting request with its kind, details, amount, who asked and both actions', async () => {
    setup();

    const row = (await screen.findByText('Cancel a payment')).closest('tr');
    expect(row).not.toBeNull();
    const cells = within(row as HTMLElement);
    expect(
      cells.getByText('RCT-2026-00098 from Mrs Danjuma: Keyed the wrong child')
    ).toBeVisible();
    expect(cells.getByText('₦20,000')).toBeVisible();
    expect(cells.getByText('Chika Eze')).toBeVisible();
    expect(cells.getByRole('button', { name: /^Approve/ })).toBeVisible();
    expect(cells.getByRole('button', { name: /^Decline/ })).toBeVisible();
    expect(screen.getByText('Cancel a balance')).toBeVisible();
  });

  it('shows a discount’s text instead of an amount', async () => {
    setup({ list: approvalList([discountApproval()]) });
    expect(await screen.findByText('50% off')).toBeVisible();
  });

  it('marks the viewer’s own request "Your own" and gives it no buttons', async () => {
    setup({
      list: approvalList([approvalItem({ decide: 'own' })]),
    });
    const row = (await screen.findByText('Cancel a balance')).closest('tr');
    expect(within(row as HTMLElement).getByText('Your own')).toBeVisible();
    expect(
      within(row as HTMLElement).queryByRole('button', { name: /Approve/ })
    ).toBeNull();
  });

  it('says nothing waits when the queue is empty', async () => {
    setup({ list: approvalList([]) });
    expect(await screen.findByText('Nothing waiting for you')).toBeVisible();
    expect(
      screen.getByText(
        'When staff ask for leave, or to refund, discount, write off or void a payment, the request appears here.'
      )
    ).toBeVisible();
  });

  it('shows a super admin acting read-only the rows but no buttons', async () => {
    setup({ access: actingAccess(false) });
    expect(await screen.findByText('Cancel a payment')).toBeVisible();
    expect(screen.queryByRole('button', { name: /^Approve/ })).toBeNull();
  });

  it('approves a cancellation after saying what approving does, then toasts with a Payments action', async () => {
    const api = setup({ list: approvalList([voidApproval()]) });

    fireEvent.click(await screen.findByRole('button', { name: /^Approve/ }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Approve this request?')).toBeVisible();
    expect(
      within(dialog).getByText('Cancel a payment · asked by Chika Eze')
    ).toBeVisible();
    expect(
      within(dialog).getByText(
        'The receipt is kept but marked cancelled, and the family owes that money again.'
      )
    ).toBeVisible();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Approve' }));

    await waitFor(() => {
      expect(api.paymentVoids.approve).toHaveBeenCalledWith({
        params: { id: VOID_ID },
      });
    });
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(
        'Approved. The payment is cancelled and the receipt is kept.',
        expect.objectContaining({
          action: expect.objectContaining({ label: 'Payments' }),
        })
      );
    });
  });

  it('approves a correction through the adjustments route and a discount through its own', async () => {
    const api = setup({
      list: approvalList([approvalItem(), discountApproval()]),
    });
    const buttons = await screen.findAllByRole('button', { name: /^Approve/ });

    fireEvent.click(buttons[0]!);
    fireEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', {
        name: 'Approve',
      })
    );
    await waitFor(() => {
      expect(api.adjustments.approve).toHaveBeenCalledWith({
        params: { id: ADJUSTMENT_ID },
      });
    });
    expect(toast.success).toHaveBeenCalledWith(
      'Approved. The student’s fees have been updated.',
      expect.objectContaining({
        action: expect.objectContaining({ label: 'Who owes' }),
      })
    );
  });

  it('lists a store write-off and approves it through the stock counts route, toasting with a Store action', async () => {
    const api = setup({ list: approvalList([storeWriteOffApproval()]) });

    const row = (await screen.findByText('Store write-off')).closest('tr');
    expect(
      within(row as HTMLElement).getByText(
        'Lekki stock count: School shirt, Size 14: 2 missing; School tie: 1 missing'
      )
    ).toBeVisible();
    expect(within(row as HTMLElement).getByText('₦8,200')).toBeVisible();
    fireEvent.click(await screen.findByRole('button', { name: /^Approve/ }));
    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByText('Store write-off · asked by Chika Eze')
    ).toBeVisible();
    expect(
      within(dialog).getByText(
        'Brings store stock in line with the count and records the missing items as a loss at their average cost.'
      )
    ).toBeVisible();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Approve' }));

    await waitFor(() => {
      expect(api.stockCounts.approve).toHaveBeenCalledWith({
        params: { id: COUNT_APPROVAL_ID },
      });
    });
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(
        'Approved. Stock now matches the count.',
        expect.objectContaining({
          action: expect.objectContaining({ label: 'Store' }),
        })
      );
    });
  });

  it('declines a store write-off with a reason through the stock counts route', async () => {
    const api = setup({ list: approvalList([storeWriteOffApproval()]) });
    fireEvent.click(await screen.findByRole('button', { name: /^Decline/ }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/Stock stays as it is\./)).toBeVisible();
    fireEvent.change(within(dialog).getByLabelText('Reason'), {
      target: { value: 'Recount first' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Decline' }));

    await waitFor(() => {
      expect(api.stockCounts.decline).toHaveBeenCalledWith({
        params: { id: COUNT_APPROVAL_ID },
        body: { reason: 'Recount first' },
      });
    });
  });

  it('shows the refusal in the dialog when someone else decided first', async () => {
    setup({
      list: approvalList([voidApproval()]),
      approveFails: new ApiError(409, {
        code: 'AlreadyDecided',
        message: 'This has already been decided.',
      }),
    });
    fireEvent.click(await screen.findByRole('button', { name: /^Approve/ }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Approve' }));
    expect(
      await within(dialog).findByText('This has already been decided.')
    ).toBeVisible();
  });

  it('goes back a page when the last request on the last page is decided', async () => {
    let decided = false;
    const first = Array.from({ length: 10 }, (_, index) =>
      approvalItem({ id: `first-${index}`, details: `Request ${index}` })
    );
    const second = () => (decided ? [] : [voidApproval()]);
    const api = setup({
      listFor: (page) =>
        approvalList(page === 1 ? first : second(), {
          total: decided ? 10 : 11,
        }),
    });
    api.paymentVoids.approve.mockImplementation(() => {
      decided = true;
      return Promise.resolve({ id: VOID_ID, status: 'approved' });
    });

    fireEvent.click(await screen.findByRole('button', { name: 'Page 2' }));
    fireEvent.click(await screen.findByRole('button', { name: /^Approve/ }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Approve' }));

    expect(await screen.findByText('Request 0')).toBeVisible();
    expect(screen.queryByText('Nothing waiting for you')).toBeNull();
  });

  it('says what declining does for the kind of request', async () => {
    setup({ list: approvalList([voidApproval()]) });
    fireEvent.click(await screen.findByRole('button', { name: /^Decline/ }));
    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByText(
        new RegExp(APPROVAL_KIND_UI.payment_void.declineEffect)
      )
    ).toBeVisible();
  });

  it('needs a reason to decline, then declines with it and says the request is kept', async () => {
    const api = setup({ list: approvalList([voidApproval()]) });
    fireEvent.click(await screen.findByRole('button', { name: /^Decline/ }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Decline this request?')).toBeVisible();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Decline' }));
    expect(
      await within(dialog).findByText(
        'Say why you are declining. The person who asked will see it.'
      )
    ).toBeVisible();
    expect(api.paymentVoids.decline).not.toHaveBeenCalled();

    fireEvent.change(within(dialog).getByLabelText('Reason'), {
      target: { value: 'Not agreed with the owner' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Decline' }));

    await waitFor(() => {
      expect(api.paymentVoids.decline).toHaveBeenCalledWith({
        params: { id: VOID_ID },
        body: { reason: 'Not agreed with the owner' },
      });
    });
    await waitFor(() => {
      expect(toast.warning).toHaveBeenCalledWith(
        'Declined. The request is kept with your reason.'
      );
    });
  });
});
