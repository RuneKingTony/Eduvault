import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  ApiError,
  STORE_SALE_POS_PROOF_MESSAGE,
  STORE_SALE_REQUIRED_MESSAGE,
  STORE_SALE_TRANSFER_PROOF_MESSAGE,
  storeSaleNoAccountMessage,
  storeSaleReplayedMessage,
  storeSaleStockShortMessage,
  type SaleOptions,
} from '@eduvault/api-contract';
import { toPermissionMap } from '@eduvault/policy';
import { toast } from '@eduvault/ui';
import {
  ADA_ID,
  CASH_BOX_ID,
  POS_ID,
  PROOF_ID,
  SHIRT_ID,
  TIE_ID,
  TOBI_ID,
  itemList,
  recordedSale,
  saleOptions,
  shirt,
  textbook,
  tie,
} from '../../test-store';
import { fakeAccess, ownerAccess, renderWithApi } from '../../test-utils';
import { SaleSheet } from './sale-sheet';

vi.mock('@eduvault/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@eduvault/ui')>()),
  toast: Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  }),
}));

const storeOnlyAccess = () =>
  fakeAccess({
    roles: ['custom'],
    permissions: toPermissionMap(['store:read', 'store:issue']),
    campusScope: 'all',
  });

function setup(
  options: {
    options?: SaleOptions;
    record?: ReturnType<typeof vi.fn>;
    access?: ReturnType<typeof ownerAccess>;
  } = {}
) {
  const api = {
    store: {
      saleOptions: vi.fn().mockResolvedValue(options.options ?? saleOptions()),
      items: vi.fn().mockResolvedValue(itemList([shirt(), tie(), textbook()])),
      recordSale: options.record ?? vi.fn().mockResolvedValue(recordedSale()),
    },
    files: {
      upload: vi.fn().mockResolvedValue({
        id: PROOF_ID,
        contentType: 'application/pdf',
        byteSize: 8,
        originalName: 'slip.pdf',
      }),
    },
  };
  const onOpenChange = vi.fn();
  const onRecorded = vi.fn();
  const onStatement = vi.fn();
  renderWithApi(
    <SaleSheet
      open
      onOpenChange={onOpenChange}
      onRecorded={onRecorded}
      onStatement={onStatement}
    />,
    api,
    options.access ?? ownerAccess()
  );
  return { api, onOpenChange, onRecorded, onStatement };
}

let user: ReturnType<typeof userEvent.setup>;

const choose = async (id: string) => {
  await user.selectOptions(await screen.findByLabelText('Student'), id);
};

const quantity = async (name: string, text: string) => {
  const input = screen.getByLabelText(`Quantity of ${name}`);
  await user.clear(input);
  await user.type(input, text);
};

const record = async () => {
  await user.click(screen.getByRole('button', { name: 'Record purchase' }));
};

describe('SaleSheet', () => {
  beforeEach(() => {
    user = userEvent.setup();
    vi.clearAllMocks();
  });

  it('asks for a student first and holds Record purchase back', async () => {
    setup();

    expect(
      await screen.findByRole('heading', { name: 'Record student purchase' })
    ).toBeVisible();
    expect(
      within(await screen.findByLabelText('Student')).getByRole('option', {
        name: 'Ada Okeke · GF-0123',
      })
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Record purchase' })
    ).toBeDisabled();
  });

  it('shows the student’s class, campus and balance, the level’s books and every uniform', async () => {
    setup();
    await choose(ADA_ID);

    expect(await screen.findByText('JSS 1 Gold')).toBeVisible();
    expect(screen.getByText('Lekki')).toBeVisible();
    expect(screen.getByText('₦12,500 owing')).toBeVisible();
    expect(screen.getByText('Books for JSS 1')).toBeVisible();
    expect(screen.getByText('Uniforms')).toBeVisible();
    expect(screen.getByText('12 left')).toBeVisible();
    expect(screen.getByLabelText('Quantity of Mathematics')).toBeEnabled();
  });

  it('leaves out the balance when the API sends none', async () => {
    const { students, ...rest } = saleOptions();
    setup({
      options: {
        ...rest,
        students: students.map(
          ({ balanceMinor: _balance, ...student }) => student
        ),
      },
    });
    await choose(ADA_ID);

    expect(await screen.findByText('JSS 1 Gold')).toBeVisible();
    expect(screen.queryByText('Owes now')).not.toBeInTheDocument();
  });

  it('shows a credit as extra paid and stops a quantity at the stock, with none for an empty shelf', async () => {
    setup();
    await choose(TOBI_ID);

    expect(await screen.findByText('₦3,000 extra paid')).toBeVisible();
    expect(
      screen.getByLabelText('Quantity of School shirt, Size 12')
    ).toBeDisabled();
    await quantity('School tie', '9');
    expect(screen.getByLabelText('Quantity of School tie')).toHaveValue('5');
  });

  it('offers only the ways to pay that are switched on, cash first', async () => {
    setup({
      options: saleOptions({
        methods: { cash: true, transfer: true, pos: false },
      }),
    });
    await choose(ADA_ID);

    const options = within(await screen.findByLabelText('Payment'))
      .getAllByRole('option')
      .map((option) => option.textContent);
    expect(options).toEqual(['Cash', 'Bank transfer']);
  });

  it('toasts when no item has a quantity and does not post', async () => {
    const { api } = setup();
    await choose(ADA_ID);
    await screen.findByText('Books for JSS 1');
    await record();

    expect(toast.error).toHaveBeenCalledWith(STORE_SALE_REQUIRED_MESSAGE);
    expect(api.store.recordSale).not.toHaveBeenCalled();
  });

  it('asks for the POS slip and the transfer receipt before recording', async () => {
    const { api } = setup();
    await choose(ADA_ID);
    await screen.findByText('Books for JSS 1');
    await quantity('School tie', '1');

    await user.selectOptions(screen.getByLabelText('Payment'), 'pos');
    await record();
    expect(toast.error).toHaveBeenLastCalledWith(STORE_SALE_POS_PROOF_MESSAGE);

    await user.selectOptions(screen.getByLabelText('Payment'), 'transfer');
    await record();
    expect(toast.error).toHaveBeenLastCalledWith(
      STORE_SALE_TRANSFER_PROOF_MESSAGE
    );
    expect(api.store.recordSale).not.toHaveBeenCalled();
  });

  it('refuses a Word document as the receipt', async () => {
    const anyFileUser = userEvent.setup({ applyAccept: false });
    setup();
    await choose(ADA_ID);
    await screen.findByText('Books for JSS 1');
    await quantity('School tie', '1');
    await user.selectOptions(screen.getByLabelText('Payment'), 'pos');
    await anyFileUser.upload(
      screen.getByLabelText(/Payment receipt/),
      new File(['x'], 'slip.docx', { type: 'application/msword' })
    );
    await record();

    expect(toast.error).toHaveBeenLastCalledWith(
      'The proof must be a photo, a screenshot or a PDF.'
    );
  });

  describe('Into', () => {
    it('hides the field when one account fits and offers a select for several', async () => {
      setup();
      await choose(ADA_ID);
      await screen.findByText('Books for JSS 1');

      const into = screen.getByLabelText('Into');
      expect(
        within(into)
          .getAllByRole('option')
          .map((option) => option.textContent)
      ).toEqual(['Lekki cash box', 'GTBank current']);

      await user.selectOptions(screen.getByLabelText('Payment'), 'transfer');
      expect(screen.queryByLabelText('Into')).not.toBeInTheDocument();
    });

    it('says no account takes the method and disables Record purchase', async () => {
      setup();
      await choose(TOBI_ID);
      await screen.findByText('Books for JSS 1');
      await user.selectOptions(screen.getByLabelText('Payment'), 'pos');

      expect(
        screen.getByText(storeSaleNoAccountMessage('pos', 'Ikeja'))
      ).toBeVisible();
      expect(
        screen.getByRole('button', { name: 'Record purchase' })
      ).toBeDisabled();
    });
  });

  describe('recording', () => {
    it('posts the lines, the chosen account and a client reference, then toasts with a Statement action', async () => {
      const { api, onRecorded, onStatement } = setup();
      await choose(ADA_ID);
      await screen.findByText('Books for JSS 1');
      await quantity('School shirt, Size 12', '2');
      await quantity('School tie', '1');
      await record();

      await waitFor(() => {
        expect(api.store.recordSale).toHaveBeenCalledTimes(1);
      });
      const body = api.store.recordSale.mock.calls[0]?.[0].body;
      expect(body).toMatchObject({
        studentId: ADA_ID,
        method: 'cash',
        moneyAccountId: CASH_BOX_ID,
        lines: [
          { itemId: SHIRT_ID, quantity: 2 },
          { itemId: TIE_ID, quantity: 1 },
        ],
      });
      expect(body.reference).toMatch(/^STORE-\d{8}-[0-9A-F]{8}$/);
      expect(body).not.toHaveProperty('proofFileId');
      await waitFor(() => {
        expect(toast.success).toHaveBeenCalledWith(
          'ISS-2026-0001: ₦13,000 paid, receipt RCT-2026-00012.',
          expect.objectContaining({
            action: expect.objectContaining({ label: 'Statement' }),
          })
        );
      });
      expect(onRecorded).toHaveBeenCalledTimes(1);
      const action = vi.mocked(toast.success).mock.calls[0]?.[1]?.action;
      (action as unknown as { onClick: () => void }).onClick();
      expect(onStatement).toHaveBeenCalledWith(ADA_ID);
    });

    it('leaves the Statement action off for someone who cannot read finance', async () => {
      const { api } = setup({ access: storeOnlyAccess() });
      await choose(ADA_ID);
      await screen.findByText('Books for JSS 1');
      await quantity('School tie', '1');
      await record();

      await waitFor(() => {
        expect(api.store.recordSale).toHaveBeenCalledTimes(1);
      });
      await waitFor(() => {
        expect(toast.success).toHaveBeenCalledWith(
          'ISS-2026-0001: ₦13,000 paid, receipt RCT-2026-00012.',
          expect.anything()
        );
      });
      expect(vi.mocked(toast.success).mock.calls[0]?.[1]).not.toHaveProperty(
        'action'
      );
    });

    it('uploads the POS slip once and sends its id', async () => {
      const { api } = setup();
      await choose(ADA_ID);
      await screen.findByText('Books for JSS 1');
      await quantity('School tie', '1');
      await user.selectOptions(screen.getByLabelText('Payment'), 'pos');
      await user.upload(
        screen.getByLabelText(/Payment receipt/),
        new File(['x'], 'slip.pdf', { type: 'application/pdf' })
      );
      await record();

      await waitFor(() => {
        expect(api.store.recordSale).toHaveBeenCalledTimes(1);
      });
      expect(api.files.upload).toHaveBeenCalledTimes(1);
      expect(api.store.recordSale.mock.calls[0]?.[0].body).toMatchObject({
        method: 'pos',
        moneyAccountId: POS_ID,
        proofFileId: PROOF_ID,
      });
    });

    it('warns that nothing was posted twice when the reference was already recorded', async () => {
      const { onRecorded } = setup({
        record: vi.fn().mockResolvedValue(recordedSale({ replayed: true })),
      });
      await choose(ADA_ID);
      await screen.findByText('Books for JSS 1');
      await quantity('School tie', '1');
      await record();

      await waitFor(() => {
        expect(toast.warning).toHaveBeenCalledWith(
          storeSaleReplayedMessage('STORE-20260922-AB12CD34', 'RCT-2026-00012')
        );
      });
      expect(toast.success).not.toHaveBeenCalled();
      expect(onRecorded).toHaveBeenCalledTimes(1);
    });

    it('toasts the server’s refusal, stays open and retries with the same reference', async () => {
      const refusal = new ApiError(409, {
        code: 'Conflict',
        message: storeSaleStockShortMessage(2, 'School tie', 'Lekki'),
      });
      const { api, onRecorded } = setup({
        record: vi
          .fn()
          .mockRejectedValueOnce(refusal)
          .mockResolvedValue(recordedSale()),
      });
      await choose(ADA_ID);
      await screen.findByText('Books for JSS 1');
      await quantity('School tie', '3');
      await record();

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith(
          'Only 2 of School tie left at Lekki.'
        );
      });
      expect(onRecorded).not.toHaveBeenCalled();
      await record();
      await waitFor(() => {
        expect(api.store.recordSale).toHaveBeenCalledTimes(2);
      });
      const [first, second] = api.store.recordSale.mock.calls.map(
        (call) => call[0].body.reference
      );
      expect(second).toBe(first);
    });

    it('disables Record purchase while it is being recorded', async () => {
      setup({ record: vi.fn(() => new Promise(() => undefined)) });
      await choose(ADA_ID);
      await screen.findByText('Books for JSS 1');
      await quantity('School tie', '1');
      await record();

      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: 'Record purchase' })
        ).toBeDisabled();
      });
    });
  });
});
