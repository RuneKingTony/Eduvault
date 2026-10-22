import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  ApiError,
  STOCK_COUNT_NEGATIVE_MESSAGE,
  stockCountWaitingMessage,
} from '@eduvault/api-contract';
import { toast } from '@eduvault/ui';
import { IKEJA, LEKKI } from '../../test-members';
import {
  SHIRT_ID,
  TIE_ID,
  itemList,
  shirt,
  stockCount,
  textbook,
  tie,
} from '../../test-store';
import { ownerAccess, renderWithApi } from '../../test-utils';
import { StockCountSheet } from './stock-count-sheet';

vi.mock('@eduvault/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@eduvault/ui')>()),
  toast: Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  }),
}));

function setup(
  options: {
    submit?: ReturnType<typeof vi.fn>;
    campusId?: string;
  } = {}
) {
  const api = {
    campuses: { list: vi.fn().mockResolvedValue([LEKKI, IKEJA]) },
    store: {
      items: vi.fn().mockResolvedValue(itemList([shirt(), tie(), textbook()])),
    },
    stockCounts: {
      submit: options.submit ?? vi.fn().mockResolvedValue(stockCount()),
    },
  };
  const onOpenChange = vi.fn();
  const onSubmitted = vi.fn();
  const onApprovals = vi.fn();
  renderWithApi(
    <StockCountSheet
      open
      campusId={options.campusId}
      onOpenChange={onOpenChange}
      onSubmitted={onSubmitted}
      onApprovals={onApprovals}
    />,
    api,
    ownerAccess()
  );
  return { api, onOpenChange, onSubmitted, onApprovals };
}

const counted = (name: string) =>
  screen.findByLabelText<HTMLInputElement>(`Counted ${name}`);

let user: ReturnType<typeof userEvent.setup>;

const change = async (input: HTMLInputElement, text: string) => {
  await user.clear(input);
  if (text !== '') {
    await user.type(input, text);
  }
};

const ask = async () => {
  await user.click(screen.getByRole('button', { name: 'Submit count' }));
};

const confirmDialog = () =>
  screen.findByRole('dialog', { name: 'Submit this stock count?' });

const submit = async () => {
  await ask();
  const dialog = await confirmDialog();
  await user.click(
    within(dialog).getByRole('button', { name: 'Submit count' })
  );
};

describe('StockCountSheet', () => {
  beforeEach(() => {
    user = userEvent.setup();
    vi.clearAllMocks();
  });

  it('opens with the PRD title and description and one row per item with Expected and Counted prefilled', async () => {
    setup();

    expect(
      await screen.findByRole('heading', { name: 'Stock count' })
    ).toBeVisible();
    expect(
      screen.getByText(
        'Enter what is on the shelf. Differences wait for a second person to approve.'
      )
    ).toBeVisible();
    const input = await counted('School shirt, Size 12');
    expect(input).toHaveValue(12);
    expect(input).toHaveAttribute('min', '0');
    expect((await counted('School tie')).value).toBe('5');
    expect((await counted('Mathematics')).value).toBe('30');
    for (const name of ['Item', 'Expected', 'Counted']) {
      expect(screen.getByRole('columnheader', { name })).toBeVisible();
    }
  });

  it('starts on the campus in the address and re-prefills Expected when the campus changes', async () => {
    setup({ campusId: IKEJA.id });
    const input = await counted('School shirt, Size 12');
    expect(input.value).toBe('0');

    await user.selectOptions(screen.getByLabelText('Campus'), LEKKI.id);

    expect((await counted('School shirt, Size 12')).value).toBe('12');
  });

  it('posts every item with its counted figure and the note, and says every item matches', async () => {
    const { api, onSubmitted } = setup({
      submit: vi
        .fn()
        .mockResolvedValue(
          stockCount({ status: 'matched', netValueMinor: 0, lines: [] })
        ),
    });
    await user.type(await screen.findByLabelText('Note'), ' Half-term count ');
    await counted('School tie');

    await submit();

    await waitFor(() => {
      expect(api.stockCounts.submit).toHaveBeenCalledWith({
        body: {
          campusId: LEKKI.id,
          note: 'Half-term count',
          lines: [
            { itemId: SHIRT_ID, countedQuantity: 12 },
            { itemId: TIE_ID, countedQuantity: 5 },
            expect.objectContaining({ countedQuantity: 30 }),
          ],
        },
      });
    });
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(
        'Every item matches. Nothing to approve.'
      );
    });
    expect(onSubmitted).toHaveBeenCalledOnce();
  });

  it('says the count was applied when write-off approval is off', async () => {
    setup({
      submit: vi.fn().mockResolvedValue(stockCount({ status: 'approved' })),
    });
    await change(await counted('School tie'), '4');

    await submit();

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(
        'Count recorded and stock adjusted.'
      );
    });
  });

  it('says what waits for approval and offers an Approvals action', async () => {
    const { api, onApprovals, onSubmitted } = setup();
    await change(await counted('School tie'), '4');

    await submit();

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(
        'Count submitted. ₦8,200 of differences wait for approval.',
        expect.objectContaining({
          action: expect.objectContaining({ label: 'Approvals' }),
        })
      );
    });
    expect(api.stockCounts.submit.mock.calls[0]?.[0].body.lines[1]).toEqual({
      itemId: TIE_ID,
      countedQuantity: 4,
    });
    expect(onSubmitted).toHaveBeenCalledOnce();
    const action = vi.mocked(toast.success).mock.calls[0]?.[1]?.action;
    (action as unknown as { onClick: () => void }).onClick();
    expect(onApprovals).toHaveBeenCalledOnce();
  });

  it('toasts a refusal with its message and stays open', async () => {
    const { onSubmitted, onOpenChange } = setup({
      submit: vi.fn().mockRejectedValue(
        new ApiError(409, {
          code: 'Conflict',
          message: stockCountWaitingMessage('CNT-2026-0001'),
        })
      ),
    });
    await change(await counted('School tie'), '4');

    await submit();

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        'CNT-2026-0001 for this campus is still waiting for approval. Approve or decline it first.'
      );
    });
    expect(onSubmitted).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('refuses a blank or negative figure before posting', async () => {
    const { api } = setup();
    await change(await counted('School tie'), '-1');

    await ask();

    expect(await screen.findByText(STOCK_COUNT_NEGATIVE_MESSAGE)).toBeVisible();
    expect(api.stockCounts.submit).not.toHaveBeenCalled();
    await change(await counted('School tie'), '');
    await ask();
    expect(api.stockCounts.submit).not.toHaveBeenCalled();
  });

  it('says which store and how many items differ, and sends nothing until confirmed', async () => {
    const { api } = setup();
    await change(await counted('School tie'), '4');

    await ask();

    const dialog = await confirmDialog();
    expect(within(dialog).getByText('Lekki')).toBeVisible();
    expect(within(dialog).getByText('Items that differ')).toBeVisible();
    expect(within(dialog).getByText('1')).toBeVisible();
    expect(api.stockCounts.submit).not.toHaveBeenCalled();
  });

  it('goes back to the count on Cancel in the confirmation without submitting', async () => {
    const { api, onOpenChange } = setup();
    await change(await counted('School tie'), '4');
    await ask();
    const dialog = await confirmDialog();

    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    await waitFor(() => {
      expect(
        screen.queryByRole('dialog', { name: 'Submit this stock count?' })
      ).not.toBeInTheDocument();
    });
    expect(api.stockCounts.submit).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('closes from Cancel', async () => {
    const { onOpenChange } = setup();
    await counted('School tie');

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
