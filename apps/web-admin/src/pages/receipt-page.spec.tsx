import { screen, waitFor, within } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { ApiError } from '@eduvault/api-contract';
import { toast } from '@eduvault/ui';
import { VOID_ID, voidRow } from '../test-approvals';
import { PAYMENT_ID, payment, renderPayments } from '../test-payments';
import { starterAccess } from '../test-utils';
import { SALE_ID } from '../test-store';
import { ReceiptPage } from './receipt-page';

vi.mock('@eduvault/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@eduvault/ui')>()),
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

function setup(
  options: {
    payment?: ReturnType<typeof payment>;
    failWith?: Error;
    recorded?: boolean;
  } = {}
) {
  const api = {
    payments: {
      get: vi
        .fn()
        .mockImplementation(() =>
          options.failWith === undefined
            ? Promise.resolve(options.payment ?? payment())
            : Promise.reject(options.failWith)
        ),
    },
  };
  renderPayments(
    <ReceiptPage paymentId={PAYMENT_ID} recorded={options.recorded} />,
    api,
    { path: `/finance/payments/${PAYMENT_ID}` }
  );
  return api;
}

const typeInto = async (user: UserEvent, field: HTMLElement, value: string) => {
  await user.clear(field);
  await user.type(field, value);
};

describe('ReceiptPage', () => {
  it('titles the receipt with its status, amount, payer and date', async () => {
    setup();

    expect(
      await screen.findByRole('heading', { name: /Receipt RCT-2026-00088/ })
    ).toBeVisible();
    expect(screen.getByText('Recorded')).toBeVisible();
    expect(
      screen.getByText('₦240,000 from Ngozi Okeke on 7 Oct 2026')
    ).toBeVisible();
    expect(screen.getByRole('link', { name: 'Print receipt' })).toBeVisible();
  });

  it('shows the success callout only right after recording', async () => {
    setup({ recorded: true });
    expect(
      await screen.findByText(
        'Payment recorded. Entering it again by mistake will not record it twice.'
      )
    ).toBeVisible();
  });

  it('has no callout when the receipt is opened later', async () => {
    setup();
    await screen.findByRole('heading', { name: /Receipt RCT-2026-00088/ });
    expect(screen.queryByText(/Payment recorded/)).not.toBeInTheDocument();
  });

  it('lists each student’s share with their balance now, and the total', async () => {
    setup();
    const ada = await screen.findByRole('row', { name: /Ada Okeke/ });
    expect(within(ada).getByText('JSS 1 Gold')).toBeVisible();
    expect(within(ada).getByText('₦180,000')).toBeVisible();
    expect(within(ada).getByText('Paid up')).toBeVisible();
    expect(
      within(ada).getByRole('link', { name: 'Ada Okeke' })
    ).toHaveAttribute('href', expect.stringMatching(/\/finance\/accounts\/.+/));
    expect(screen.getAllByText('₦240,000').length).toBeGreaterThan(0);
  });

  it('names a student out of scope with no balance and no link', async () => {
    setup();
    const chidi = await screen.findByRole('row', { name: /Chidi Okeke/ });
    expect(within(chidi).queryByRole('link')).toBeNull();
    expect(within(chidi).getByText('₦60,000')).toBeVisible();
    expect(within(chidi).queryByText('Paid up')).toBeNull();
  });

  it('shows an owing student in red and a student in credit as extra paid', async () => {
    setup({
      payment: payment({
        allocations: [
          {
            studentId: '00000000-0000-4000-8000-0000000d0001',
            studentName: 'Ada Okeke',
            className: 'JSS 1',
            amountMinor: 100,
            inScope: true,
            balanceMinor: 6_000_000,
          },
          {
            studentId: '00000000-0000-4000-8000-0000000d0002',
            studentName: 'Chidi Okeke',
            className: 'JSS 2',
            amountMinor: 100,
            inScope: true,
            balanceMinor: -500_000,
          },
        ],
      }),
    });
    expect(await screen.findByText('₦60,000')).toBeVisible();
    expect(screen.getByText('₦5,000 extra paid')).toBeVisible();
  });

  it('keeps the accountant’s entry in a collapsed card', async () => {
    setup();
    expect(
      await screen.findByText('For your accountant: TRF-20261007-K3Q7ZA')
    ).toBeVisible();
  });

  it('shows the receipt card with the reference, provider ref, method, account, recorder and proof link', async () => {
    setup();
    await screen.findByText('Receipt no.');
    expect(screen.getByText('GTB/FT/2610070031')).toBeVisible();
    expect(screen.getByText('Bank transfer')).toBeVisible();
    expect(screen.getByText('Chika Eze')).toBeVisible();
    expect(screen.getByRole('link', { name: /alert\.pdf/ })).toHaveAttribute(
      'href',
      expect.stringMatching(/\/files\/00000000-0000-4000-8000-0000000a0a01$/)
    );
  });

  it('dates the receipt by the Lagos day it was recorded, not the UTC one', async () => {
    setup({ payment: payment({ recordedAt: '2026-10-06T23:30:00.000Z' }) });
    expect(await screen.findByText('Recorded 7 Oct 2026')).toBeVisible();
  });

  it('shows the store sale a receipt belongs to, linked to Items sold, and a POS slip', async () => {
    setup({
      payment: payment({
        method: 'pos',
        storeSale: { id: SALE_ID, number: 'ISS-2026-0001' },
      }),
    });

    const link = await screen.findByRole('link', { name: 'ISS-2026-0001' });
    expect(link).toHaveAttribute(
      'href',
      expect.stringContaining(`/finance/store?tab=sold&sale=${SALE_ID}`)
    );
    expect(screen.getByText('Store sale')).toBeVisible();
    expect(screen.getByText('POS slip')).toBeVisible();
  });

  it('has no Store sale row for an ordinary receipt', async () => {
    setup();
    await screen.findByText('Receipt no.');
    expect(screen.queryByText('Store sale')).not.toBeInTheDocument();
  });

  it('shows a dash for a missing provider reference and says when a transfer has no proof', async () => {
    setup({ payment: payment({ providerReference: null, proof: null }) });
    await screen.findByText('Provider ref.');
    expect(screen.getByText('—')).toBeVisible();
    expect(
      screen.getByText('Not uploaded (recorded before uploads were required)')
    ).toBeVisible();
  });

  it('says No receipt here for a receipt that is out of reach', async () => {
    setup({
      failWith: new ApiError(404, {
        code: 'NotFound',
        message: 'Receipt not found',
      }),
    });
    expect(await screen.findByText('No receipt here')).toBeVisible();
    expect(
      screen.getByText(
        'It may have been moved, or it may belong to a campus you don’t look after.'
      )
    ).toBeVisible();
    expect(
      screen.getByRole('link', { name: 'Back to payments' })
    ).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Not found' })).toBeVisible();
  });
});

const entry = (reference: string) => ({
  reference,
  balanced: true,
  lines: [
    {
      accountCode: 1100,
      accountName: 'Fees owed to the school',
      studentName: 'Ada Okeke',
      campusName: 'Lekki',
      debitMinor: 24_000_000,
      creditMinor: 0,
    },
    {
      accountCode: 1210,
      accountName: 'GTBank current',
      studentName: null,
      campusName: null,
      debitMinor: 0,
      creditMinor: 24_000_000,
    },
  ],
});

const waiting = () =>
  payment({
    status: 'void_pending',
    void: {
      id: VOID_ID,
      status: 'submitted',
      reason: 'Keyed the wrong amount',
      createdBy: 'Chika Eze',
      approvedBy: null,
      rejectionReason: null,
    },
  });

const cancelled = (approvedBy: string | null) =>
  payment({
    status: 'voided',
    void: {
      id: VOID_ID,
      status: 'approved',
      reason: 'Keyed the wrong amount',
      createdBy: 'Chika Eze',
      approvedBy,
      rejectionReason: null,
    },
    voidEntry: entry('VOID-TRF-20261007-K3Q7ZA'),
  });

function setupVoid(
  options: {
    payment?: ReturnType<typeof payment>;
    access?: ReturnType<typeof starterAccess>;
    autoApproved?: boolean;
    failWith?: Error;
  } = {}
) {
  const api = {
    payments: {
      get: vi.fn().mockResolvedValue(options.payment ?? payment()),
      requestVoid: vi.fn().mockImplementation(() =>
        options.failWith === undefined
          ? Promise.resolve({
              void: voidRow({ status: 'submitted' }),
              autoApproved: options.autoApproved === true,
            })
          : Promise.reject(options.failWith)
      ),
    },
  };
  renderPayments(<ReceiptPage paymentId={PAYMENT_ID} />, api, {
    access: options.access ?? starterAccess('bursar'),
    path: `/finance/payments/${PAYMENT_ID}`,
  });
  return api;
}

describe('ReceiptPage cancellation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('offers Request void on a Recorded receipt to someone who may ask', async () => {
    setupVoid();
    expect(
      await screen.findByRole('button', { name: 'Request void' })
    ).toBeVisible();
  });

  it('hides Request void from a member without payment:void', async () => {
    setupVoid({ access: starterAccess('principal') });
    await screen.findByRole('heading', { name: /Receipt RCT-2026-00088/ });
    expect(screen.queryByRole('button', { name: 'Request void' })).toBeNull();
  });

  it('hides Request void once the receipt is cancelled', async () => {
    setupVoid({ payment: cancelled('Grace Nwosu') });
    await screen.findByText('Cancelled');
    expect(screen.queryByRole('button', { name: 'Request void' })).toBeNull();
  });

  it('hides Request void while a cancellation is waiting', async () => {
    setupVoid({ payment: waiting() });
    await screen.findByText('Cancellation waiting');
    expect(screen.queryByRole('button', { name: 'Request void' })).toBeNull();
  });

  it('hides Request void for the payment of a store sale', async () => {
    setupVoid({
      payment: payment({
        storeSale: { id: SALE_ID, number: 'ISS-2026-0001' },
      }),
    });
    await screen.findByRole('heading', { name: /Receipt RCT-2026-00088/ });
    expect(screen.queryByRole('button', { name: 'Request void' })).toBeNull();
  });

  it('asks for a reason, then requests the void and toasts that it needs a second person’s approval', async () => {
    const user = userEvent.setup();
    const api = setupVoid();
    await user.click(
      await screen.findByRole('button', { name: 'Request void' })
    );
    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByText('Void receipt RCT-2026-00088?')
    ).toBeVisible();
    expect(within(dialog).getByText('₦240,000 from Ngozi Okeke')).toBeVisible();
    expect(
      within(dialog).getByText(
        'The receipt is kept. Once a boss approves, the payment is cancelled and the family owes that money again.'
      )
    ).toBeVisible();

    await user.click(
      within(dialog).getByRole('button', { name: 'Request void' })
    );
    expect(
      await within(dialog).findByText(
        'Say why this receipt is being cancelled.'
      )
    ).toBeVisible();
    expect(api.payments.requestVoid).not.toHaveBeenCalled();

    await typeInto(
      user,
      within(dialog).getByLabelText('Reason'),
      'Keyed the wrong amount'
    );
    await user.click(
      within(dialog).getByRole('button', { name: 'Request void' })
    );

    await waitFor(() => {
      expect(api.payments.requestVoid).toHaveBeenCalledWith({
        params: { id: PAYMENT_ID },
        body: { reason: 'Keyed the wrong amount' },
      });
    });
    await waitFor(() => {
      expect(toast.warning).toHaveBeenCalledWith(
        'Void requested. It needs a second person’s approval.',
        expect.anything()
      );
    });
  });

  it('adds an Open voids action for a member who can see the voids list', async () => {
    const user = userEvent.setup();
    setupVoid({ access: starterAccess('bursar') });
    await user.click(
      await screen.findByRole('button', { name: 'Request void' })
    );
    const dialog = await screen.findByRole('dialog');
    await typeInto(
      user,
      within(dialog).getByLabelText('Reason'),
      'Wrong child'
    );
    await user.click(
      within(dialog).getByRole('button', { name: 'Request void' })
    );

    await waitFor(() => {
      expect(toast.warning).toHaveBeenCalledWith(
        'Void requested. It needs a second person’s approval.',
        expect.objectContaining({
          action: expect.objectContaining({ label: 'Open voids' }),
        })
      );
    });
  });

  it('says the payment was cancelled when approval is switched off', async () => {
    const user = userEvent.setup();
    setupVoid({ autoApproved: true });
    await user.click(
      await screen.findByRole('button', { name: 'Request void' })
    );
    const dialog = await screen.findByRole('dialog');
    await typeInto(
      user,
      within(dialog).getByLabelText('Reason'),
      'Wrong child'
    );
    await user.click(
      within(dialog).getByRole('button', { name: 'Request void' })
    );

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(
        'Payment cancelled. The receipt is kept, and the family owes that money again.'
      );
    });
  });

  it('shows the refusal in the dialog when a void already exists', async () => {
    const user = userEvent.setup();
    setupVoid({
      failWith: new ApiError(409, {
        code: 'Conflict',
        message: 'A void already exists for this payment.',
      }),
    });
    await user.click(
      await screen.findByRole('button', { name: 'Request void' })
    );
    const dialog = await screen.findByRole('dialog');
    await typeInto(
      user,
      within(dialog).getByLabelText('Reason'),
      'Wrong child'
    );
    await user.click(
      within(dialog).getByRole('button', { name: 'Request void' })
    );

    expect(
      await within(dialog).findByText('A void already exists for this payment.')
    ).toBeVisible();
  });

  it('names who asked and why while the cancellation waits, with a link to Approvals', async () => {
    setupVoid({ payment: waiting() });
    expect(
      await screen.findByText(
        /Cancellation asked for by Chika Eze: “Keyed the wrong amount”\. Waiting for a boss to approve it\./
      )
    ).toBeVisible();
    expect(
      screen.getByRole('link', { name: 'See in Approvals' })
    ).toHaveAttribute('href', '/approvals');
    expect(screen.getByText('Cancellation waiting')).toBeVisible();
  });

  it('says who approved a cancelled receipt, strikes the amount and adds the VOID entry', async () => {
    setupVoid({ payment: cancelled('Grace Nwosu') });
    expect(
      await screen.findByText(
        /Cancelled, approved by Grace Nwosu\. The receipt is kept, and the family owes this money again\./
      )
    ).toBeVisible();
    expect(screen.getByText('Cancelled')).toBeVisible();
    const struck = screen
      .getAllByText('₦240,000')
      .filter((element) => element.className.includes('line-through'));
    expect(struck).toHaveLength(1);
    expect(
      screen.getByText(/For your accountant: VOID-TRF-20261007-K3Q7ZA/)
    ).toBeVisible();
    expect(screen.getByText(/\(cancellation\)/)).toBeVisible();
  });

  it('says it was cancelled straight away when approval was switched off', async () => {
    setupVoid({ payment: cancelled(null) });
    expect(
      await screen.findByText(
        /Cancelled straight away \(approval is switched off\)\. The receipt is kept, and the family owes this money again\./
      )
    ).toBeVisible();
  });

  it('mentions a declined cancellation and offers a new request', async () => {
    setupVoid({
      payment: payment({
        void: {
          id: VOID_ID,
          status: 'rejected',
          reason: 'Keyed the wrong amount',
          createdBy: 'Chika Eze',
          approvedBy: null,
          rejectionReason: 'Not agreed with the owner',
        },
      }),
    });
    expect(
      await screen.findByText(
        'A cancellation was asked for and declined: “Not agreed with the owner”.'
      )
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Request void' })).toBeVisible();
  });
});
