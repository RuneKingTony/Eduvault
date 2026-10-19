import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import {
  ApiError,
  INVOICE_CHARGE_AMOUNT_MESSAGE,
  INVOICE_CHARGE_DESCRIPTION_REQUIRED_MESSAGE,
  INVOICE_CHARGE_REPLAYED_MESSAGE,
  INVOICE_NO_TERM_MESSAGE,
  INVOICE_STUDENT_NOT_ON_ROLL_MESSAGE,
  type CreatedCharge,
} from '@eduvault/api-contract';
import { toast } from '@eduvault/ui';
import { currentCalendar, noCalendar } from '../../test-calendar';
import { BUS, TUITION } from '../../test-fees';
import { INVOICE_ID, invoice, renderBilling } from '../../test-billing';
import { STUDENT_ID, studentList, studentRow } from '../../test-students';
import {
  CHOOSE_FEE_TYPE_MESSAGE,
  CHOOSE_STUDENT_MESSAGE,
} from './new-charge-model';
import { NewChargeSheet } from './new-charge-sheet';

vi.mock('@eduvault/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@eduvault/ui')>()),
  toast: Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  }),
}));

const created = (over: Partial<CreatedCharge> = {}): CreatedCharge => ({
  ...invoice({ id: INVOICE_ID, kind: 'adhoc', number: 'CHG-2026-00031' }),
  replayed: false,
  ...over,
});

function setup(
  options: {
    create?: ReturnType<typeof vi.fn>;
    current?: ReturnType<typeof currentCalendar>;
  } = {}
) {
  const api = {
    feeTypes: { list: vi.fn().mockResolvedValue([TUITION, BUS]) },
    calendar: {
      current: vi.fn().mockResolvedValue(options.current ?? currentCalendar()),
    },
    students: {
      list: vi.fn().mockResolvedValue(studentList([studentRow()])),
      get: vi.fn().mockResolvedValue(studentRow()),
    },
    invoices: {
      create: options.create ?? vi.fn().mockResolvedValue(created()),
    },
  };
  const onOpenChange = vi.fn();
  return {
    api,
    onOpenChange,
    router: renderBilling(
      <NewChargeSheet open onOpenChange={onOpenChange} />,
      api,
      { path: '/finance/invoices?new=1' }
    ),
  };
}

const field = async (label: string, index = 0) =>
  (await screen.findAllByLabelText(label))[index]!;

const fillLine = async (
  index: number,
  line: { feeType: string; description: string; amount: string }
) => {
  fireEvent.change(await field('Fee type', index), {
    target: { value: line.feeType },
  });
  fireEvent.change(await field('Description', index), {
    target: { value: line.description },
  });
  fireEvent.change(await field('Amount (₦)', index), {
    target: { value: line.amount },
  });
};

const chooseStudent = async () => {
  const select = await field('Student');
  await within(select).findByRole('option', { name: /Ada Okeke/ });
  fireEvent.change(select, { target: { value: STUDENT_ID } });
};

const submit = () => {
  fireEvent.click(screen.getByRole('button', { name: 'Add charge' }));
};

describe('NewChargeSheet', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('opens on one blank line with the current term, the total and both buttons', async () => {
    setup();

    expect(
      await screen.findByRole('heading', { name: 'New charge' })
    ).toBeVisible();
    expect(
      screen.getByText(
        'Adds a one-off charge to a student’s account. It is sent at once and never changes.'
      )
    ).toBeVisible();
    expect(await field('Term')).toHaveValue('First term, 2026/2027');
    expect(await field('Term')).toHaveAttribute('readonly');
    expect(screen.getAllByLabelText('Fee type')).toHaveLength(1);
    expect(
      within(await field('Fee type'))
        .getAllByRole('option')
        .map((o) => o.textContent)
    ).toEqual(['Choose a fee type', 'Tuition', 'School bus']);
    expect(screen.getByText('Total: ₦0')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Add charge' })).toBeEnabled();
    expect(
      screen.queryByRole('button', { name: /Remove line/ })
    ).not.toBeInTheDocument();
  });

  it('adds and removes lines and totals the amounts', async () => {
    setup();
    await fillLine(0, {
      feeType: TUITION.id,
      description: 'School trip',
      amount: '15,000',
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add line' }));
    await fillLine(1, {
      feeType: BUS.id,
      description: 'ID card',
      amount: '2500.5',
    });

    expect(screen.getByText('Total: ₦17,500.50')).toBeVisible();
    expect(screen.getAllByLabelText('Fee type')).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: 'Remove line 1' }));

    expect(screen.getAllByLabelText('Fee type')).toHaveLength(1);
    expect(screen.getByText('Total: ₦2,500.50')).toBeVisible();
    expect(
      screen.queryByRole('button', { name: /Remove line/ })
    ).not.toBeInTheDocument();
  });

  it('stops adding lines at 20', async () => {
    setup();
    await field('Fee type');
    const add = screen.getByRole('button', { name: 'Add line' });
    for (let index = 0; index < 25; index += 1) {
      if (!(add as HTMLButtonElement).disabled) {
        fireEvent.click(add);
      }
    }

    expect(screen.getAllByLabelText('Fee type')).toHaveLength(20);
    expect(add).toBeDisabled();
  });

  it('submits the built body, toasts the number and opens the charge', async () => {
    const { api, onOpenChange, router } = setup();
    await chooseStudent();
    await fillLine(0, {
      feeType: TUITION.id,
      description: '  School trip  ',
      amount: '15,000',
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add line' }));
    await fillLine(1, {
      feeType: BUS.id,
      description: 'ID card',
      amount: '2500',
    });
    submit();

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Charge CHG-2026-00031 added');
    });
    expect(api.invoices.create).toHaveBeenCalledTimes(1);
    expect(api.invoices.create).toHaveBeenCalledWith({
      body: {
        studentId: STUDENT_ID,
        reference: expect.stringMatching(/^ONEOFF-\d{8}-[\dA-F]{8}$/),
        lines: [
          {
            feeTypeId: TUITION.id,
            description: 'School trip',
            amountMinor: 1_500_000,
          },
          { feeTypeId: BUS.id, description: 'ID card', amountMinor: 250_000 },
        ],
      },
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
    await waitFor(() => {
      expect(router.state.location.pathname).toBe(
        `/finance/invoices/${INVOICE_ID}`
      );
    });
  });

  it('warns that a replayed charge was already added', async () => {
    const { onOpenChange } = setup({
      create: vi.fn().mockResolvedValue(created({ replayed: true })),
    });
    await chooseStudent();
    await fillLine(0, {
      feeType: TUITION.id,
      description: 'Trip',
      amount: '100',
    });
    submit();

    await waitFor(() => {
      expect(toast.warning).toHaveBeenCalledWith(
        INVOICE_CHARGE_REPLAYED_MESSAGE
      );
    });
    expect(toast.success).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('toasts the server’s refusal, stays open and retries with the same reference', async () => {
    const refusal = new ApiError(409, {
      code: 'Conflict',
      message: INVOICE_STUDENT_NOT_ON_ROLL_MESSAGE,
    });
    const { api, onOpenChange } = setup({
      create: vi
        .fn()
        .mockRejectedValueOnce(refusal)
        .mockResolvedValue(created()),
    });
    await chooseStudent();
    await fillLine(0, {
      feeType: TUITION.id,
      description: 'Trip',
      amount: '100',
    });
    submit();

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        INVOICE_STUDENT_NOT_ON_ROLL_MESSAGE
      );
    });
    expect(onOpenChange).not.toHaveBeenCalled();

    submit();
    await waitFor(() => {
      expect(api.invoices.create).toHaveBeenCalledTimes(2);
    });
    const [first, second] = api.invoices.create.mock.calls as [
      [{ body: { reference: string } }],
      [{ body: { reference: string } }],
    ];
    expect(second[0].body.reference).toBe(first[0].body.reference);
  });

  it('shows what is missing and sends nothing', async () => {
    const { api } = setup();
    await field('Fee type');
    submit();

    expect(await screen.findByText(CHOOSE_STUDENT_MESSAGE)).toBeVisible();
    expect(screen.getByText(CHOOSE_FEE_TYPE_MESSAGE)).toBeVisible();
    expect(
      screen.getByText(INVOICE_CHARGE_DESCRIPTION_REQUIRED_MESSAGE)
    ).toBeVisible();
    expect(screen.getByText(INVOICE_CHARGE_AMOUNT_MESSAGE)).toBeVisible();
    expect(api.invoices.create).not.toHaveBeenCalled();
  });

  it('refuses a zero amount', async () => {
    const { api } = setup();
    await chooseStudent();
    await fillLine(0, {
      feeType: TUITION.id,
      description: 'Trip',
      amount: '0',
    });
    submit();

    expect(
      await screen.findByText(INVOICE_CHARGE_AMOUNT_MESSAGE)
    ).toBeVisible();
    expect(api.invoices.create).not.toHaveBeenCalled();
  });

  it('says there is no current term and holds Add charge back', async () => {
    setup({ current: noCalendar() });

    expect(await screen.findByText(INVOICE_NO_TERM_MESSAGE)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Add charge' })).toBeDisabled();
  });

  it('closes from Cancel', async () => {
    const { onOpenChange } = setup();
    await field('Fee type');

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
