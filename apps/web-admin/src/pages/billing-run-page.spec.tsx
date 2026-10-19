import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '@eduvault/api-contract';
import { toast } from '@eduvault/ui';
import {
  RUN_ID,
  billingApi,
  billingRun,
  draftRun,
  renderBilling,
} from '../test-billing';
import { fakeAccess, ownerAccess, starterAccess } from '../test-utils';
import { BillingRunPage } from './billing-run-page';

vi.mock('@eduvault/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@eduvault/ui')>()),
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

function setup(api = billingApi({ run: draftRun() }), access = ownerAccess()) {
  const onPage = vi.fn();
  const onBack = vi.fn();
  renderBilling(
    <BillingRunPage runId={RUN_ID} page={1} onPage={onPage} onBack={onBack} />,
    api,
    { access, path: `/finance/billing/${RUN_ID}` }
  );
  return { api, onPage, onBack };
}

describe('BillingRunPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows a prepared round: header, stepper, summary and charges still to be numbered', async () => {
    setup();
    expect(
      await screen.findByRole('heading', { name: /Charges BR-2026-0002/ })
    ).toBeVisible();
    expect(
      screen.getByText(
        'Second term, 2026/2027 · Whole school · created by Chika Eze'
      )
    ).toBeVisible();
    const steps = screen.getByRole('list', { name: 'Progress' });
    expect(
      within(steps).getByRole('listitem', { current: 'step' })
    ).toHaveTextContent('Prepared');
    expect(screen.getByText(/2 charges · ₦452,000 in total/)).toBeVisible();
    expect(screen.getByText('Check these charges')).toBeVisible();
    expect(screen.getAllByText('Given when sent')).toHaveLength(2);
    expect(screen.getAllByText('3 fees')).toHaveLength(2);
    expect(screen.getByText('GF-0123 · JSS 2 Gold')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Send charges' })).toBeVisible();
  });

  it('warns when the fees changed after the round was prepared', async () => {
    setup(billingApi({ run: draftRun({ feesChangedSincePrepared: true }) }));
    expect(
      await screen.findByText(
        'Fees changed after these charges were prepared. Cancel and prepare again to use the new amounts.'
      )
    ).toBeVisible();
  });

  it('sends the round from the dialog and toasts with a link to the charges', async () => {
    const user = userEvent.setup();
    const { api } = setup();
    await user.click(
      await screen.findByRole('button', { name: 'Send charges' })
    );
    const dialog = await screen.findByRole('dialog', {
      name: 'Send 2 charges?',
    });
    expect(
      within(dialog).getByText('₦452,000 for Second term, 2026/2027')
    ).toBeVisible();
    expect(
      within(dialog).getByText(/Charges that are sent can’t be edited/)
    ).toBeVisible();
    await user.click(
      within(dialog).getByRole('button', { name: 'Send 2 charges' })
    );
    await waitFor(() => {
      expect(api.billingRuns.issue).toHaveBeenCalledWith({
        params: { id: RUN_ID },
      });
    });
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(
        '2 charges sent.',
        expect.objectContaining({
          action: expect.objectContaining({ label: 'See charges' }),
        })
      );
    });
  });

  it('toasts the refusal when the round was already sent', async () => {
    const user = userEvent.setup();
    const api = billingApi({ run: draftRun() });
    api.billingRuns.issue.mockRejectedValue(
      new ApiError(409, {
        code: 'Conflict',
        message: 'This round has already been sent.',
      })
    );
    setup(api);
    await user.click(
      await screen.findByRole('button', { name: 'Send charges' })
    );
    const dialog = await screen.findByRole('dialog');
    await user.click(
      within(dialog).getByRole('button', { name: 'Send 2 charges' })
    );
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        'This round has already been sent.'
      );
    });
  });

  it('asks before cancelling and cancels from the menu', async () => {
    const user = userEvent.setup();
    const { api } = setup();
    await user.click(
      await screen.findByRole('button', { name: 'Actions for BR-2026-0002' })
    );
    await user.click(
      await screen.findByRole('menuitem', { name: 'Cancel these charges' })
    );
    const dialog = await screen.findByRole('dialog', {
      name: 'Cancel BR-2026-0002?',
    });
    expect(
      within(dialog).getByText(/Nothing was recorded in the books/)
    ).toBeVisible();
    expect(api.billingRuns.cancel).not.toHaveBeenCalled();
    await user.click(
      within(dialog).getByRole('button', { name: 'Cancel these charges' })
    );
    await waitFor(() => {
      expect(api.billingRuns.cancel).toHaveBeenCalledWith({
        params: { id: RUN_ID },
      });
    });
    await waitFor(() => {
      expect(toast.warning).toHaveBeenCalledWith(
        'BR-2026-0002 cancelled. Only drafts can be cancelled.'
      );
    });
  });

  it('keeps the round when Keep them is pressed', async () => {
    const user = userEvent.setup();
    const { api } = setup();
    await user.click(
      await screen.findByRole('button', { name: 'Actions for BR-2026-0002' })
    );
    await user.click(
      await screen.findByRole('menuitem', { name: 'Cancel these charges' })
    );
    await user.click(await screen.findByRole('button', { name: 'Keep them' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(api.billingRuns.cancel).not.toHaveBeenCalled();
  });

  it('hides Send and Cancel from a reader', async () => {
    setup(billingApi({ run: draftRun() }), starterAccess('administrator'));
    await screen.findByRole('heading', { name: /Charges BR-2026-0002/ });
    expect(
      screen.queryByRole('button', { name: 'Send charges' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Actions for/ })
    ).not.toBeInTheDocument();
  });

  it('hides Send and Cancel from a read-only acting admin', async () => {
    setup(
      billingApi({ run: draftRun() }),
      fakeAccess({ permissions: { invoice: ['read'] }, campusScope: 'all' })
    );
    await screen.findByRole('heading', { name: /Charges BR-2026-0002/ });
    expect(
      screen.queryByRole('button', { name: 'Send charges' })
    ).not.toBeInTheDocument();
  });

  it('shows a sent round with its numbers, a filled stepper and no actions', async () => {
    setup(billingApi({ run: billingRun() }));
    expect(
      await screen.findByRole('heading', { name: /Charges BR-2026-0001/ })
    ).toBeVisible();
    expect(
      screen.getByText('Charges', { selector: 'div,h3,[data-slot]' })
    ).toBeVisible();
    expect(screen.getByText('CHG-2026-00001')).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Send charges' })
    ).not.toBeInTheDocument();
    const steps = screen.getByRole('list', { name: 'Progress' });
    expect(
      within(steps).getByRole('listitem', { current: 'step' })
    ).toHaveTextContent('Sent');
  });

  it('explains a cancelled round', async () => {
    setup(
      billingApi({
        run: draftRun({
          status: 'cancelled',
          cancelledBy: 'Chika Eze',
          cancelledAt: '2026-10-15T09:00:00.000Z',
        }),
      })
    );
    expect(
      await screen.findByText(
        'This round was cancelled, so these students can be charged again.'
      )
    ).toBeVisible();
    expect(
      screen.queryByRole('list', { name: 'Progress' })
    ).not.toBeInTheDocument();
  });

  it('shows the not found state for a round out of scope', async () => {
    const user = userEvent.setup();
    const api = billingApi();
    api.billingRuns.get.mockRejectedValue(
      new ApiError(404, { code: 'NotFound', message: 'Charge round not found' })
    );
    const { onBack } = setup(api);
    expect(await screen.findByText('No charge round here')).toBeVisible();
    expect(
      screen.getByText(
        'It may have been moved, or it may belong to a campus you don’t look after.'
      )
    ).toBeVisible();
    await user.click(
      screen.getByRole('button', { name: 'Back to charge students' })
    );
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('heading', { name: 'Not found' })).toBeVisible();
  });
});
