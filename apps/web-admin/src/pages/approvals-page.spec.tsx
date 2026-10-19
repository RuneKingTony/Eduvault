import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { ApiError } from '@eduvault/api-contract';
import { toast } from '@eduvault/ui';
import {
  VOID_ID,
  approvalIdAt,
  approvalItem,
  approvalList,
  decisionApi,
  discountApproval,
  leaveApproval,
  storeWriteOffApproval,
  voidApproval,
  voidRow,
  COUNT_APPROVAL_ID,
} from '../test-approvals';
import { leaveDto, myLeave } from '../test-leave';
import { IKEJA, LEKKI } from '../test-members';
import { renderPayments } from '../test-payments';
import { actingAccess, fakeAccess, starterAccess } from '../test-utils';
import { toPermissionMap, type Permission } from '@eduvault/policy';
import type { ApprovalsSearch } from '../approvals-search';
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
    mine?: ReturnType<typeof myLeave>;
    search?: ApprovalsSearch;
    onSearch?: (next: ApprovalsSearch) => void;
    campuses?: (typeof LEKKI)[];
    listError?: Error;
  } = {}
) {
  const decided = decisionApi();
  const api = {
    campuses: { list: vi.fn().mockResolvedValue(options.campuses ?? [LEKKI]) },
    approvals: {
      list: vi
        .fn()
        .mockImplementation(({ query }: { query: { page: number } }) =>
          options.listError === undefined
            ? Promise.resolve(
                options.listFor?.(query.page) ?? options.list ?? approvalList()
              )
            : Promise.reject(options.listError)
        ),
    },
    ...decided,
    paymentVoids: {
      ...decided.paymentVoids,
      approve: vi
        .fn()
        .mockImplementation(() =>
          options.approveFails === undefined
            ? Promise.resolve(voidRow({ status: 'approved' }))
            : Promise.reject(options.approveFails)
        ),
    },
    leave: {
      ...decided.leave,
      me: vi.fn().mockResolvedValue(options.mine ?? myLeave()),
      create: vi.fn().mockResolvedValue(leaveDto()),
    },
  };
  renderPayments(
    <ApprovalsPage
      search={options.search ?? {}}
      onSearchChange={options.onSearch ?? vi.fn()}
    />,
    api,
    {
      access: options.access ?? starterAccess('principal'),
      path: '/approvals',
    }
  );
  return api;
}

describe('ApprovalsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows a member who cannot approve the leave-only page and asks nothing of the queue', async () => {
    const api = setup({ access: starterAccess('bursar') });
    expect(await screen.findByText('My requests')).toBeVisible();
    expect(screen.getByText('School holidays')).toBeVisible();
    expect(api.approvals.list).not.toHaveBeenCalled();
    expect(api.leave.me).toHaveBeenCalled();
  });

  it('lists each waiting request with its kind, details, amount, who asked and both actions', async () => {
    setup();

    const row = await screen.findByRole('row', { name: /Cancel a payment/ });
    const cells = within(row);
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
    const row = await screen.findByRole('row', { name: /Cancel a balance/ });
    expect(within(row).getByText('Your own')).toBeVisible();
    expect(within(row).queryByRole('button', { name: /Approve/ })).toBeNull();
  });

  it('says nothing waits when the queue is empty', async () => {
    setup({ list: approvalList([]) });
    expect(await screen.findByText('Nothing waiting for you')).toBeVisible();
  });

  it('shows a super admin acting read-only the rows but no buttons', async () => {
    setup({ access: actingAccess(false) });
    expect(await screen.findByText('Cancel a payment')).toBeVisible();
    expect(screen.queryByRole('button', { name: /^Approve/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Decline/ })).toBeNull();
  });

  it('gives a super admin acting with a reason the Approve and Decline buttons', async () => {
    setup({
      access: actingAccess(true),
      list: approvalList([voidApproval()]),
    });
    expect(
      await screen.findByRole('button', { name: /^Approve/ })
    ).toBeEnabled();
    expect(screen.getByRole('button', { name: /^Decline/ })).toBeEnabled();
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

  it('toasts the correction outcome with a Who owes action after approving a write-off', async () => {
    setup({ list: approvalList([approvalItem()]) });
    fireEvent.click(await screen.findByRole('button', { name: /^Approve/ }));
    fireEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', {
        name: 'Approve',
      })
    );
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(
        'Approved. The student’s fees have been updated.',
        expect.objectContaining({
          action: expect.objectContaining({ label: 'Who owes' }),
        })
      );
    });
  });

  it('lists a store write-off and approves it through the stock counts route, toasting with a Store action', async () => {
    const api = setup({ list: approvalList([storeWriteOffApproval()]) });

    const row = await screen.findByRole('row', { name: /Store write-off/ });
    expect(
      within(row).getByText(
        'Lekki stock count: School shirt, Size 14: 2 missing; School tie: 1 missing'
      )
    ).toBeVisible();
    expect(within(row).getByText('₦8,200')).toBeVisible();
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
      approvalItem({ id: approvalIdAt(index), details: `Request ${index}` })
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
      return Promise.resolve(voidRow({ status: 'approved' }));
    });

    fireEvent.click(await screen.findByRole('button', { name: 'Page 2' }));
    fireEvent.click(await screen.findByRole('button', { name: /^Approve/ }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Approve' }));

    expect(await screen.findByText('Request 0')).toBeVisible();
    expect(screen.queryByText('Nothing waiting for you')).toBeNull();
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

const RESOURCES = [
  'paymentVoids',
  'adjustments',
  'studentDiscounts',
  'leave',
  'stockCounts',
] as const;

const KINDS = [
  {
    kind: 'payment_void',
    item: voidApproval(),
    resource: 'paymentVoids',
    declineEffect:
      'The payment stays recorded and nothing is cancelled. A new cancellation can be asked for.',
  },
  {
    kind: 'credit_note',
    item: approvalItem({ kind: 'credit_note', id: approvalIdAt(1) }),
    resource: 'adjustments',
    declineEffect:
      'The fee stays as charged and what the family owes is unchanged.',
  },
  {
    kind: 'write_off',
    item: approvalItem({ kind: 'write_off', id: approvalIdAt(2) }),
    resource: 'adjustments',
    declineEffect: 'The balance stays owed and nothing is cancelled.',
  },
  {
    kind: 'refund',
    item: approvalItem({ kind: 'refund', id: approvalIdAt(3) }),
    resource: 'adjustments',
    declineEffect:
      'No money is paid back and the credit stays with the student.',
  },
  {
    kind: 'discount',
    item: discountApproval(),
    resource: 'studentDiscounts',
    declineEffect:
      'The discount is not applied and later charges stay as they are.',
  },
  {
    kind: 'leave',
    item: leaveApproval(),
    resource: 'leave',
    declineEffect: 'Nothing is changed.',
  },
  {
    kind: 'store_write_off',
    item: storeWriteOffApproval(),
    resource: 'stockCounts',
    declineEffect: 'Stock stays as it is.',
  },
] as const;

describe('ApprovalsPage decisions by kind', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each(KINDS)(
    'approves a $kind request through the $resource route only',
    async ({ item, resource }) => {
      const api = setup({ list: approvalList([item]) });
      fireEvent.click(await screen.findByRole('button', { name: /^Approve/ }));
      fireEvent.click(
        within(await screen.findByRole('dialog')).getByRole('button', {
          name: 'Approve',
        })
      );
      await waitFor(() => {
        expect(api[resource].approve).toHaveBeenCalledWith({
          params: { id: item.id },
        });
      });
      for (const other of RESOURCES.filter((name) => name !== resource)) {
        expect(api[other].approve).not.toHaveBeenCalled();
      }
      for (const name of RESOURCES) {
        expect(api[name].decline).not.toHaveBeenCalled();
      }
    }
  );

  it.each(KINDS)(
    'declines a $kind request with a reason through the $resource route only, saying what declining does',
    async ({ item, resource, declineEffect }) => {
      const api = setup({ list: approvalList([item]) });
      fireEvent.click(await screen.findByRole('button', { name: /^Decline/ }));
      const dialog = await screen.findByRole('dialog');
      expect(dialog).toHaveTextContent(declineEffect);
      fireEvent.change(within(dialog).getByLabelText('Reason'), {
        target: { value: 'Not this term' },
      });
      fireEvent.click(within(dialog).getByRole('button', { name: 'Decline' }));
      await waitFor(() => {
        expect(api[resource].decline).toHaveBeenCalledWith({
          params: { id: item.id },
          body: { reason: 'Not this term' },
        });
      });
      for (const other of RESOURCES.filter((name) => name !== resource)) {
        expect(api[other].decline).not.toHaveBeenCalled();
      }
      for (const name of RESOURCES) {
        expect(api[name].approve).not.toHaveBeenCalled();
      }
    }
  );
});

const accessWith = (...permissions: Permission[]) =>
  fakeAccess({
    roles: [],
    permissions: toPermissionMap(permissions),
    campusScope: 'all',
  });

describe('ApprovalsPage by permission', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('gives a leave-only approver the queue and My leave, not the leave-only page', async () => {
    const api = setup({
      access: accessWith('leave:approve'),
      list: approvalList([leaveApproval()]),
    });
    expect(await screen.findByText('Leave')).toBeVisible();
    expect(await screen.findByText('My leave')).toBeVisible();
    expect(
      screen.queryByText('Ask for leave and see what the school decides.')
    ).toBeNull();
    expect(api.approvals.list).toHaveBeenCalled();
  });

  it('gives a money-only approver the queue too', async () => {
    setup({ access: accessWith('adjustment:approve') });
    expect(await screen.findByText('Cancel a payment')).toBeVisible();
    expect(await screen.findByText('My leave')).toBeVisible();
  });

  it('shows someone holding neither the leave-only body', async () => {
    const api = setup({ access: accessWith('student:read') });
    expect(
      await screen.findByRole('button', { name: 'Request leave' })
    ).toBeVisible();
    expect(api.approvals.list).not.toHaveBeenCalled();
  });

  it('hides My leave and Request leave from a super admin acting', async () => {
    setup({
      access: actingAccess(false),
      list: approvalList([leaveApproval()]),
    });
    expect(await screen.findByText('2 days')).toBeVisible();
    expect(screen.queryByText('My leave')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Request leave' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Approve/ })).toBeNull();
  });
});

describe('ApprovalsPage leave rows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows a leave row with its details and days', async () => {
    setup({ list: approvalList([leaveApproval()]) });
    const row = await screen.findByRole('row', { name: /Sick leave/ });
    const cells = within(row);
    expect(
      cells.getByText(
        'Ayo Bassey · Sick leave · 12 Oct 2026 – 13 Oct 2026. Malaria'
      )
    ).toBeVisible();
    expect(cells.getByText('Leave')).toBeVisible();
    expect(cells.getByRole('button', { name: /^Approve/ })).toBeVisible();
  });

  it('marks someone else’s row and the viewer’s own, with no buttons on either', async () => {
    setup({
      list: approvalList([
        leaveApproval({ decide: 'other' }),
        leaveApproval({ id: approvalIdAt(99), decide: 'own' }),
      ]),
    });
    expect(await screen.findByText('Someone else')).toBeVisible();
    expect(screen.getByText('Your own')).toBeVisible();
    expect(screen.queryByRole('button', { name: /^Approve/ })).toBeNull();
    fireEvent.focus(screen.getByText('Someone else'));
    expect(
      (await screen.findAllByText('Someone with leave approval decides.'))[0]
    ).toBeVisible();
  });

  it('shows the tabs with counts only when both pillars have rows and filters by tab', async () => {
    const onSearch = vi.fn();
    const both = approvalList([voidApproval(), leaveApproval()]);
    const api = setup({ list: both, onSearch });

    expect(await screen.findByRole('tab', { name: /All/ })).toBeVisible();
    expect(screen.getByRole('tab', { name: /Money/ })).toHaveTextContent('1');
    expect(screen.getByRole('tab', { name: /Leave/ })).toHaveTextContent('1');
    fireEvent.mouseDown(screen.getByRole('tab', { name: /Leave/ }));
    fireEvent.click(screen.getByRole('tab', { name: /Leave/ }));
    await waitFor(() => {
      expect(onSearch).toHaveBeenCalledWith({ tab: 'leave' });
    });
    expect(api.approvals.list).toHaveBeenCalledWith({
      query: { page: 1, includeOthers: false },
    });
  });

  it('asks for the leave pillar when the Leave tab is chosen', async () => {
    const api = setup({
      list: approvalList([leaveApproval()], {
        pillars: { money: 1, leave: 1 },
      }),
      search: { tab: 'leave' },
    });
    expect(await screen.findByText('2 days')).toBeVisible();
    expect(api.approvals.list).toHaveBeenCalledWith({
      query: { page: 1, includeOthers: false, pillar: 'leave' },
    });
  });

  it('has no tabs with a single pillar', async () => {
    setup({ list: approvalList([leaveApproval()]) });
    await screen.findByText('2 days');
    expect(screen.queryByRole('tab')).toBeNull();
  });

  it('offers “Include {n} that others approve” and asks for them when it is on', async () => {
    const api = setup({
      list: approvalList([voidApproval()], { othersCount: 1 }),
    });
    const toggle = await screen.findByRole('switch', {
      name: 'Include 1 that others approve',
    });
    fireEvent.click(toggle);
    await waitFor(() => {
      expect(api.approvals.list).toHaveBeenCalledWith({
        query: { page: 1, includeOthers: true },
      });
    });
  });

  it('leaves the switch out when nothing is held back', async () => {
    setup({ list: approvalList([voidApproval()]) });
    await screen.findByText('Cancel a payment');
    expect(screen.queryByRole('switch')).toBeNull();
  });

  it('approves leave after saying what it does, then toasts the requester', async () => {
    const api = setup({ list: approvalList([leaveApproval()]) });
    fireEvent.click(await screen.findByRole('button', { name: /^Approve/ }));
    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByText('Leave · asked by Ayo Bassey')
    ).toBeVisible();
    expect(
      within(dialog).getByText(
        'The staff member is marked on leave for those school days and sees your decision on their Approvals page.'
      )
    ).toBeVisible();
    expect(within(dialog).getByText('2 days')).toBeVisible();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Approve' }));

    await waitFor(() => {
      expect(api.leave.approve).toHaveBeenCalledWith({
        params: { id: leaveApproval().id },
      });
    });
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(
        'Leave approved for Ayo Bassey.',
        undefined
      );
    });
  });

  it('toasts that someone has already decided, and refreshes, on a 409', async () => {
    const api = setup({ list: approvalList([leaveApproval()]) });
    api.leave.approve.mockRejectedValue(
      new ApiError(409, {
        code: 'AlreadyDecided',
        message: 'This has already been decided.',
      })
    );
    fireEvent.click(await screen.findByRole('button', { name: /^Approve/ }));
    fireEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', {
        name: 'Approve',
      })
    );
    await waitFor(() => {
      expect(toast.warning).toHaveBeenCalledWith(
        'Someone has already decided this request.'
      );
    });
    await waitFor(() => {
      expect(api.approvals.list.mock.calls.length).toBeGreaterThan(1);
    });
  });
});

describe('ApprovalsPage campus picker', () => {
  const two = [LEKKI, IKEJA];
  const both = approvalList([voidApproval(), leaveApproval()]);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('hides the Campus select with one campus', async () => {
    setup({ list: both, campuses: [LEKKI] });
    await screen.findByText('Cancel a payment');
    expect(screen.queryByRole('combobox', { name: 'Campus' })).toBeNull();
  });

  it('shows the Campus select with two campuses, All campuses first', async () => {
    setup({ list: both, campuses: two });
    const select = await screen.findByRole('combobox', { name: 'Campus' });
    expect(
      within(select)
        .getAllByRole('option')
        .map((option) => option.textContent)
    ).toEqual(['All campuses', LEKKI.name, IKEJA.name]);
    expect(select).toHaveValue('');
  });

  it('shows the select even when the tabs and the switch are hidden', async () => {
    setup({ list: approvalList([voidApproval()]), campuses: two });
    expect(
      await screen.findByRole('combobox', { name: 'Campus' })
    ).toBeVisible();
    expect(screen.queryByRole('tab')).toBeNull();
    expect(screen.queryByRole('switch')).toBeNull();
  });

  it('keeps the picked tab when a campus is chosen', async () => {
    const onSearch = vi.fn();
    setup({
      list: both,
      campuses: two,
      search: { tab: 'leave' },
      onSearch,
    });
    fireEvent.change(await screen.findByRole('combobox', { name: 'Campus' }), {
      target: { value: IKEJA.id },
    });
    expect(onSearch).toHaveBeenCalledWith({ tab: 'leave', campus: IKEJA.id });
  });

  it('starts over on page 1 when a campus is chosen', async () => {
    const first = Array.from({ length: 10 }, (_, index) =>
      approvalItem({ id: approvalIdAt(index), details: `Request ${index}` })
    );
    setup({
      listFor: (page) =>
        approvalList(page === 1 ? first : [voidApproval()], { total: 11 }),
      campuses: two,
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Page 2' }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Page 2' })).toHaveAttribute(
        'aria-current',
        'page'
      );
    });
    fireEvent.change(screen.getByRole('combobox', { name: 'Campus' }), {
      target: { value: IKEJA.id },
    });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Page 1' })).toHaveAttribute(
        'aria-current',
        'page'
      );
    });
  });

  it('keeps the Campus select when the picked campus is refused, so All campuses is one pick away', async () => {
    const onSearch = vi.fn();
    setup({
      campuses: two,
      search: { campus: approvalIdAt(500) },
      listError: new Error('Campus not found'),
      onSearch,
    });
    expect(await screen.findByText('Campus not found')).toBeVisible();
    expect(screen.getByRole('combobox', { name: 'Campus' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Show all campuses' }));
    expect(onSearch).toHaveBeenCalledWith({ campus: undefined });
  });

  it('gives a single-campus viewer a way back to All campuses when the picked campus is refused', async () => {
    const onSearch = vi.fn();
    setup({
      campuses: [LEKKI],
      search: { campus: approvalIdAt(500) },
      listError: new Error('Campus not found'),
      onSearch,
    });
    expect(await screen.findByText('Campus not found')).toBeVisible();
    expect(screen.queryByRole('combobox', { name: 'Campus' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Show all campuses' }));
    expect(onSearch).toHaveBeenCalledWith({ campus: undefined });
  });

  it('asks for the picked campus', async () => {
    const api = setup({
      list: both,
      campuses: two,
      search: { campus: IKEJA.id },
    });
    expect(await screen.findByRole('combobox', { name: 'Campus' })).toHaveValue(
      IKEJA.id
    );
    expect(api.approvals.list).toHaveBeenCalledWith({
      query: { page: 1, includeOthers: false, campusId: IKEJA.id },
    });
  });

  it('clears the campus with All campuses and keeps the tab', async () => {
    const onSearch = vi.fn();
    setup({
      list: both,
      campuses: two,
      search: { tab: 'money', campus: IKEJA.id },
      onSearch,
    });
    fireEvent.change(await screen.findByRole('combobox', { name: 'Campus' }), {
      target: { value: '' },
    });
    expect(onSearch).toHaveBeenCalledWith({ tab: 'money', campus: undefined });
  });

  it('keeps the campus when a tab is chosen', async () => {
    const onSearch = vi.fn();
    setup({
      list: both,
      campuses: two,
      search: { campus: LEKKI.id },
      onSearch,
    });
    const leave = await screen.findByRole('tab', { name: /Leave/ });
    fireEvent.mouseDown(leave);
    fireEvent.click(leave);
    await waitFor(() => {
      expect(onSearch).toHaveBeenCalledWith({
        tab: 'leave',
        campus: LEKKI.id,
      });
    });
  });
});
