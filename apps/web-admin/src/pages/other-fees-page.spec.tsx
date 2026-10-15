import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { ApiError } from '@eduvault/api-contract';
import { toast } from '@eduvault/ui';
import {
  BUS,
  PTA,
  TERM_1,
  feeGrid,
  feeLine,
  feesApi,
  gridCell,
  gridRow,
  renderFees,
} from '../test-fees';
import { ownerAccess, starterAccess } from '../test-utils';
import { OtherFeesPage } from './other-fees-page';

vi.mock('@eduvault/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@eduvault/ui')>()),
  toast: { success: vi.fn(), error: vi.fn() },
}));

const ptaLine = feeLine({
  id: 'fl-pta',
  feeTypeId: PTA.id,
  feeTypeCode: PTA.code,
  feeTypeName: PTA.name,
  name: 'PTA fee',
  amountMinor: 1_000_000,
});
const busLine = feeLine({
  id: 'fl-bus',
  feeTypeId: BUS.id,
  feeTypeCode: BUS.code,
  feeTypeName: BUS.name,
  name: 'School bus',
  amountMinor: 4_500_000,
  isOptional: true,
});

const otherGrid = feeGrid({
  feeTypes: [PTA, BUS],
  rows: [
    gridRow({
      typicalTotalMinor: null,
      cells: [
        gridCell({ feeTypeId: PTA.id }),
        gridCell({
          feeTypeId: BUS.id,
          base: {
            feeLineId: 'fl-bus',
            amountMinor: 4_500_000,
            appliesTo: 'all',
            isOptional: true,
          },
        }),
      ],
    }),
  ],
});

function setup(
  access = ownerAccess(),
  search: { type?: string; add?: 1; term?: string } = {}
) {
  const api = feesApi({
    lines: [ptaLine, busLine],
    grid: otherGrid,
    types: [{ id: 'ft-tuition', code: 4010, name: 'Tuition' }, PTA, BUS],
  });
  const onSearchChange = vi.fn();
  renderFees(
    <OtherFeesPage search={search} onSearchChange={onSearchChange} />,
    api,
    access
  );
  return { api, onSearchChange };
}

describe('OtherFeesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the header and the grid of every other fee type with no typical total', async () => {
    const { api } = setup();
    expect(
      await screen.findByRole('heading', { name: /Other fees/ })
    ).toBeInTheDocument();
    expect(
      screen.getByText('Fees on top of school fees, grouped by type.')
    ).toBeInTheDocument();
    expect(
      await screen.findByText('Other fees · First term, 2026/2027')
    ).toBeInTheDocument();
    expect(
      screen.getByRole('columnheader', { name: 'School bus' })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('columnheader', { name: /Typical total/ })
    ).not.toBeInTheDocument();
    expect(api.feeLines.grid).toHaveBeenCalledWith({
      query: { termId: TERM_1, group: 'other', feeTypeId: undefined },
    });
  });

  it('has a chip for every other fee type but not Tuition', async () => {
    setup();
    const chips = await screen.findByRole('tablist', { name: 'Fee type' });
    await within(chips).findByRole('tab', { name: 'PTA fee' });
    expect(
      within(chips)
        .getAllByRole('tab')
        .map((tab) => tab.textContent)
    ).toEqual(['All other fees', 'PTA fee', 'School bus']);
    expect(
      within(chips).getByRole('tab', { name: 'All other fees' })
    ).toHaveAttribute('aria-selected', 'true');
  });

  it('filters the grid and the list to the chosen chip through the search', async () => {
    const { api } = setup(ownerAccess(), { type: BUS.id });
    expect(
      await screen.findByText('School bus · First term, 2026/2027')
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(api.feeLines.grid).toHaveBeenCalledWith({
        query: { termId: TERM_1, group: 'other', feeTypeId: BUS.id },
      });
    });
    const list = await screen.findByRole('row', { name: /JSS 2 · School bus/ });
    expect(within(list).getByText('Optional')).toBeInTheDocument();
    expect(
      screen.queryByRole('row', { name: /PTA fee .* ₦10,000/ })
    ).not.toBeInTheDocument();
  });

  it('reports the chip picked', async () => {
    const { onSearchChange } = setup();
    fireEvent.mouseDown(await screen.findByRole('tab', { name: 'PTA fee' }), {
      button: 0,
    });
    expect(onSearchChange).toHaveBeenCalledWith({ type: PTA.id });
  });

  it('adds a fee type from the dialog and refreshes the chips', async () => {
    const { api } = setup();
    fireEvent.click(
      await screen.findByRole('button', { name: 'New fee type' })
    );
    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByText(
        'For example Sports levy or Exam fee. Add the amounts afterwards.'
      )
    ).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText('Name'), {
      target: { value: 'Sports levy' },
    });
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Add fee type' })
    );
    await waitFor(() => {
      expect(api.feeTypes.create).toHaveBeenCalledWith({
        body: { name: 'Sports levy' },
      });
    });
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(
        'Sports levy added as a fee type.'
      );
    });
  });

  it('asks for a name and toasts a duplicate refusal', async () => {
    const { api } = setup();
    fireEvent.click(
      await screen.findByRole('button', { name: 'New fee type' })
    );
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Add fee type' })
    );
    expect(
      await within(dialog).findByText('Give the fee type a name.')
    ).toBeInTheDocument();
    expect(api.feeTypes.create).not.toHaveBeenCalled();
    api.feeTypes.create.mockRejectedValue(
      new ApiError(409, {
        code: 'Conflict',
        message: 'A fee type called PTA fee already exists.',
      })
    );
    fireEvent.change(within(dialog).getByLabelText('Name'), {
      target: { value: 'PTA fee' },
    });
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Add fee type' })
    );
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        'A fee type called PTA fee already exists.'
      );
    });
  });

  it('opens the New fee sheet on the chosen chip', async () => {
    setup(ownerAccess(), { add: 1, type: BUS.id });
    const sheet = await screen.findByRole('dialog');
    expect(within(sheet).getByText('New fee')).toBeInTheDocument();
    expect(await within(sheet).findByLabelText('Fee type')).toHaveValue(BUS.id);
  });

  it('defaults the New fee sheet to the first other fee type with no chip', async () => {
    setup(ownerAccess(), { add: 1 });
    const sheet = await screen.findByRole('dialog');
    expect(await within(sheet).findByLabelText('Fee type')).toHaveValue(PTA.id);
  });

  it('hides Add a fee, New fee type and the row actions from an administrator', async () => {
    setup(starterAccess('administrator'));
    await screen.findByRole('row', { name: /JSS 2 · School bus/ });
    expect(
      screen.queryByRole('button', { name: 'Add a fee' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'New fee type' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Edit amount/ })
    ).not.toBeInTheDocument();
  });

  it('shows the empty state when no other fee exists for the term', async () => {
    const api = feesApi({ lines: [], grid: feeGrid({ rows: [] }) });
    renderFees(<OtherFeesPage search={{}} onSearchChange={vi.fn()} />, api);
    expect(
      await screen.findAllByText('No other fees for this term')
    ).toHaveLength(2);
  });

  it('shows an error in place of the cards when the list fails', async () => {
    const api = feesApi();
    api.feeLines.list.mockRejectedValue(
      new ApiError(500, {
        code: 'UnknownError',
        message: 'The fee list is down',
      })
    );
    renderFees(<OtherFeesPage search={{}} onSearchChange={vi.fn()} />, api);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The fee list is down'
    );
  });
});
