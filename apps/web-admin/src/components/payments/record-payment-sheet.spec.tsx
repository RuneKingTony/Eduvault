import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '@eduvault/api-contract';
import { toast } from '@eduvault/ui';
import {
  ACCOUNT,
  ADA,
  BANK_ACCOUNT,
  CHIDI,
  NGOZI,
  PAYMENT_ID,
  TOBI,
  recorded,
  recordingOptions,
  renderPayments,
} from '../../test-payments';
import { RecordPaymentSheet } from './record-payment-sheet';

vi.mock('@eduvault/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@eduvault/ui')>()),
  toast: Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  }),
}));

function echoRecorded({
  body,
}: {
  body: {
    amountMinor: number;
    allocations: { studentId: string; amountMinor: number }[];
  };
}) {
  const children = recordingOptions().students;
  return Promise.resolve(
    recorded({
      amountMinor: body.amountMinor,
      allocations: body.allocations.map((row) => {
        const child = children.find((one) => one.studentId === row.studentId);
        return {
          studentId: row.studentId,
          studentName: child?.name ?? 'Unknown',
          className: null,
          amountMinor: row.amountMinor,
          inScope: true,
          balanceMinor: (child?.owesMinor ?? 0) - row.amountMinor,
        };
      }),
    })
  );
}

function setup(
  options: {
    recordingOptions?: ReturnType<typeof recordingOptions>;
    prefill?: { guardianId?: string; studentId?: string };
    record?: ReturnType<typeof vi.fn>;
    stay?: boolean;
  } = {}
) {
  const api = {
    payments: {
      recordingOptions: vi
        .fn()
        .mockResolvedValue(options.recordingOptions ?? recordingOptions()),
      record: options.record ?? vi.fn().mockImplementation(echoRecorded),
    },
    files: {
      upload: vi.fn().mockResolvedValue({
        id: '00000000-0000-4000-8000-0000000a0a01',
        contentType: 'application/pdf',
        byteSize: 8,
        originalName: 'alert.pdf',
      }),
    },
  };
  const onOpenChange = vi.fn();
  const view = renderPayments(
    <RecordPaymentSheet
      open
      onOpenChange={onOpenChange}
      prefill={options.prefill}
      stay={options.stay}
    />,
    api
  );
  return { api, onOpenChange, ...view };
}

const amount = () => screen.getByLabelText('Amount received (₦)');
const share = (name: string) => screen.getByLabelText(`Amount for ${name}`);

let user: ReturnType<typeof userEvent.setup>;

describe('RecordPaymentSheet', () => {
  beforeEach(() => {
    user = userEvent.setup();
    vi.clearAllMocks();
  });

  it('prefills each child’s balance and the amount from the first guardian', async () => {
    setup();

    expect(await screen.findByLabelText('Payer')).toHaveValue(NGOZI);
    expect(
      screen.getByRole('option', { name: 'Ngozi Okeke (3 children)' })
    ).toBeInTheDocument();
    expect(amount()).toHaveValue('300000');
    expect(share('Ada Okeke')).toHaveValue('180000');
    expect(share('Chidi Okeke')).toHaveValue('60000');
    expect(share('Tobi Okeke')).toHaveValue('60000');
    expect(screen.getByText('Split ₦300,000 matches the amount')).toBeVisible();
    expect(screen.getByLabelText('Paid on')).toHaveValue('2026-10-07');
    expect(screen.getByLabelText('Into')).toHaveValue(ACCOUNT);
  });

  it('shares a smaller amount in order and says what is still owed', async () => {
    setup();
    await user.clear(await screen.findByLabelText('Amount received (₦)'));
    await user.type(amount(), '200000');

    expect(share('Ada Okeke')).toHaveValue('180000');
    expect(share('Chidi Okeke')).toHaveValue('20000');
    expect(share('Tobi Okeke')).toHaveValue('0');
    expect(
      screen.getByText(
        'Split ₦200,000 matches the amount · part payment, ₦100,000 still owed after this'
      )
    ).toBeVisible();
  });

  it('puts an overpayment on the first child and says it is kept as credit', async () => {
    setup();
    await user.clear(await screen.findByLabelText('Amount received (₦)'));
    await user.type(amount(), '320000');

    expect(share('Ada Okeke')).toHaveValue('200000');
    expect(
      screen.getByText(
        'Split ₦320,000 matches the amount · ₦20,000 extra kept as credit'
      )
    ).toBeVisible();
  });

  it('warns when the rows no longer add up to the amount', async () => {
    setup();
    await user.clear(await screen.findByLabelText('Amount for Ada Okeke'));
    await user.type(share('Ada Okeke'), '100000');

    expect(screen.getByText('Split ₦220,000 ≠ amount ₦300,000')).toBeVisible();
  });

  it('opens for the paying guardian it was asked for', async () => {
    setup({ prefill: { guardianId: NGOZI, studentId: CHIDI } });
    expect(await screen.findByLabelText('Payer')).toHaveValue(NGOZI);
  });

  it('opens on Someone else with the student when no guardian pays', async () => {
    setup({ prefill: { studentId: CHIDI } });

    expect(await screen.findByLabelText('Payer')).toHaveValue('someone-else');
    expect(screen.getByLabelText('Student')).toHaveValue(CHIDI);
    expect(screen.getByLabelText('Payer name')).toHaveValue('');
    expect(amount()).toHaveValue('60000');
    expect(screen.getAllByLabelText(/^Amount for /)).toHaveLength(1);
  });

  it('rebuilds the single row when Someone else picks another student', async () => {
    setup({ prefill: { studentId: CHIDI } });
    await user.selectOptions(await screen.findByLabelText('Student'), ADA);

    expect(amount()).toHaveValue('180000');
    expect(share('Ada Okeke')).toHaveValue('180000');
  });

  it('offers only the ways to pay that are switched on', async () => {
    setup({
      recordingOptions: recordingOptions({
        methods: { cash: true, transfer: true, pos: false },
      }),
    });

    const how = await screen.findByLabelText('How they paid');
    expect(
      within(how)
        .getAllByRole('option')
        .map((option) => option.textContent)
    ).toEqual(['Cash', 'Bank transfer']);
  });

  it('starts on the first way that is switched on and follows it in the reference', async () => {
    setup({
      recordingOptions: recordingOptions({
        methods: { cash: false, transfer: true, pos: true },
      }),
    });

    const how = await screen.findByLabelText('How they paid');
    expect(how).toHaveValue('transfer');
    expect(screen.getByText(/^References · TRF-20261007-/)).toBeVisible();
    await user.selectOptions(how, 'pos');
    expect(screen.getByText(/^References · POS-20261007-/)).toBeVisible();
  });

  it('asks for the proof of a transfer inline and keeps the sheet open', async () => {
    const { api } = setup();
    await user.selectOptions(
      await screen.findByLabelText('How they paid'),
      'transfer'
    );
    await user.click(screen.getByRole('button', { name: 'Record payment' }));

    expect(
      await screen.findByText(
        'Add the proof of transfer (a photo, screenshot or PDF) before recording.'
      )
    ).toBeVisible();
    expect(api.payments.record).not.toHaveBeenCalled();
  });

  it('refuses a Word document as proof', async () => {
    const anyFileUser = userEvent.setup({ applyAccept: false });
    const { api } = setup();
    await user.selectOptions(
      await screen.findByLabelText('How they paid'),
      'transfer'
    );
    await anyFileUser.upload(
      screen.getByLabelText('Proof of transfer (needed for bank transfers)'),
      new File(['x'], 'proof.docx', {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      })
    );
    await user.click(screen.getByRole('button', { name: 'Record payment' }));

    expect(
      await screen.findByText(
        'The proof must be a photo, a screenshot or a PDF.'
      )
    ).toBeVisible();
    expect(api.payments.record).not.toHaveBeenCalled();
  });

  it('asks who paid when Someone else is chosen with no name', async () => {
    const { api } = setup({ prefill: { studentId: CHIDI } });
    await screen.findByLabelText('Payer name');
    await user.click(screen.getByRole('button', { name: 'Record payment' }));

    expect(await screen.findByText('Enter who paid.')).toBeVisible();
    expect(api.payments.record).not.toHaveBeenCalled();
  });

  it('uploads the proof, records the payment and opens the receipt', async () => {
    const { api, router } = setup();
    await user.selectOptions(
      await screen.findByLabelText('How they paid'),
      'transfer'
    );
    await user.upload(
      screen.getByLabelText('Proof of transfer (needed for bank transfers)'),
      new File(['x'], 'alert.pdf', { type: 'application/pdf' })
    );
    await user.click(screen.getByRole('button', { name: 'Record payment' }));

    await waitFor(() => {
      expect(api.payments.record).toHaveBeenCalledTimes(1);
    });
    expect(api.files.upload).toHaveBeenCalledTimes(1);
    expect(api.payments.record.mock.calls[0]?.[0].body).toMatchObject({
      payerGuardianId: NGOZI,
      moneyAccountId: BANK_ACCOUNT,
      method: 'transfer',
      proofFileId: '00000000-0000-4000-8000-0000000a0a01',
      amountMinor: 30_000_000,
      paidOn: '2026-10-07',
      allocations: [
        { studentId: ADA, amountMinor: 18_000_000 },
        { studentId: CHIDI, amountMinor: 6_000_000 },
        { studentId: TOBI, amountMinor: 6_000_000 },
      ],
    });
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(
        'RCT-2026-00088 recorded: ₦300,000 from Ngozi Okeke.'
      );
    });
    await waitFor(() => {
      expect(router.state.location.pathname).toBe(
        `/finance/payments/${PAYMENT_ID}`
      );
    });
    expect(router.state.location.search).toMatchObject({ recorded: 1 });
  });

  it('mentions credit when a child is now paid in extra', async () => {
    setup();
    await user.clear(await screen.findByLabelText('Amount received (₦)'));
    await user.type(amount(), '320000');
    await user.click(screen.getByRole('button', { name: 'Record payment' }));

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(
        'RCT-2026-00088 recorded: ₦320,000 from Ngozi Okeke. ₦20,000 was paid in extra and is kept for the next fees.'
      );
    });
  });

  it('stays on the page and offers View receipt when opened from a statement', async () => {
    const { router } = setup({ stay: true });
    await user.click(
      await screen.findByRole('button', { name: 'Record payment' })
    );

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledTimes(1);
    });
    const [, options] = vi.mocked(toast.success).mock.calls[0] ?? [];
    expect(options).toMatchObject({ action: { label: 'View receipt' } });
    expect(router.state.location.pathname).toBe('/finance/payments');
  });

  it('warns that nothing was posted twice and opens the existing receipt on a replay', async () => {
    const { router } = setup({
      record: vi.fn().mockResolvedValue(recorded({ replayed: true })),
    });
    await user.click(
      await screen.findByRole('button', { name: 'Record payment' })
    );

    await waitFor(() => {
      expect(toast.warning).toHaveBeenCalledWith(
        'Reference TRF-20261007-K3Q7ZA was already recorded as RCT-2026-00088. Nothing was posted twice.'
      );
    });
    await waitFor(() => {
      expect(router.state.location.pathname).toBe(
        `/finance/payments/${PAYMENT_ID}`
      );
    });
    expect(router.state.location.search).not.toHaveProperty('recorded', 1);
  });

  it('clears the amount error once a valid amount is typed', async () => {
    setup();
    await screen.findByLabelText('Amount received (₦)');
    await user.clear(amount());
    await user.type(amount(), '0');
    await user.click(screen.getByRole('button', { name: 'Record payment' }));
    expect(
      await screen.findByText('Enter the amount received.')
    ).toBeInTheDocument();
    await user.clear(amount());
    await user.type(amount(), '5000');
    expect(
      screen.queryByText('Enter the amount received.')
    ).not.toBeInTheDocument();
  });

  it('sends one request when Record payment is pressed twice before it settles', async () => {
    const { api } = setup({
      record: vi.fn().mockReturnValue(new Promise(() => undefined)),
    });
    const button = await screen.findByRole('button', {
      name: 'Record payment',
    });
    await user.click(button);
    await user.click(button);
    await waitFor(() => {
      expect(api.payments.record).toHaveBeenCalledTimes(1);
    });
  });

  it('shows the server’s refusal and keeps the sheet open', async () => {
    const { onOpenChange } = setup({
      record: vi.fn().mockRejectedValue(
        new ApiError(409, {
          code: 'Conflict',
          message: 'Provider reference GTB/1 is already on RCT-2026-00001.',
        })
      ),
    });
    await user.click(
      await screen.findByRole('button', { name: 'Record payment' })
    );

    expect(
      await screen.findByText(
        'Provider reference GTB/1 is already on RCT-2026-00001.'
      )
    ).toBeVisible();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('disables Record payment while it is being recorded', async () => {
    setup({ record: vi.fn().mockReturnValue(new Promise(() => undefined)) });
    const button = await screen.findByRole('button', {
      name: 'Record payment',
    });
    await user.click(button);

    await waitFor(() => {
      expect(button).toBeDisabled();
    });
  });

  it('says so when there is no account to record into', async () => {
    setup({ recordingOptions: recordingOptions({ accounts: [] }) });
    expect(
      await screen.findByText(
        'Add a bank, POS or cash account before recording payments.'
      )
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Record payment' })
    ).toBeDisabled();
  });

  it('lists no children for a payer with none in scope', async () => {
    setup({
      recordingOptions: recordingOptions({ payers: [], students: [] }),
    });
    expect(await screen.findByText('No children in your scope.')).toBeVisible();
  });
});
