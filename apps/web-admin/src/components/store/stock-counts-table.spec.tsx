import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IKEJA, LEKKI } from '../../test-members';
import { stockCount, stockCountList } from '../../test-store';
import { renderWithApi } from '../../test-utils';
import { StockCountsTable } from './stock-counts-table';

function setup(
  options: {
    data?: ReturnType<typeof stockCountList>;
    showCampus?: boolean;
    showCosts?: boolean;
  } = {}
) {
  const onApprovals = vi.fn();
  const onPage = vi.fn();
  renderWithApi(
    <StockCountsTable
      data={options.data ?? stockCountList()}
      campuses={[LEKKI, IKEJA]}
      showCampus={options.showCampus ?? false}
      showCosts={options.showCosts ?? true}
      page={1}
      onPage={onPage}
      onApprovals={onApprovals}
    />,
    {}
  );
  return { onApprovals, onPage };
}

const rowWith = (text: string): HTMLElement => {
  const row = screen
    .getAllByRole('row')
    .find((candidate) => within(candidate).queryByText(text) !== null);
  if (row === undefined) {
    throw new Error(`No row contains ${text}`);
  }
  return row;
};

describe('StockCountsTable', () => {
  it('lists the count with its date, differences, value, counter and a Waiting status', () => {
    setup();

    const row = within(rowWith('CNT-2026-0001'));
    expect(row.getByText('16 Oct 2026')).toBeVisible();
    expect(
      row.getByText('School shirt, Size 12: 2 missing; School tie: 1 missing')
    ).toBeVisible();
    expect(row.getByText('₦8,200')).toBeVisible();
    expect(row.getByText('Chika Eze')).toBeVisible();
    expect(row.getByText('Waiting')).toBeVisible();
  });

  it('links a waiting count to Approvals', async () => {
    const user = userEvent.setup();
    const { onApprovals } = setup();

    await user.click(
      within(rowWith('CNT-2026-0001')).getByRole('button', {
        name: 'Approvals',
      })
    );

    expect(onApprovals).toHaveBeenCalledOnce();
  });

  it('expands to the counted items with signed differences and the value at cost', async () => {
    const user = userEvent.setup();
    setup();
    expect(screen.queryByText('3 items counted')).not.toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: 'Show counted items' })
    );

    expect(screen.getByText('3 items counted')).toBeVisible();
    expect(
      screen.getByText('Shelf count after mid-term stock check')
    ).toBeVisible();
    for (const name of [
      'Item',
      'Expected',
      'Counted',
      'Difference',
      'Value at cost',
    ]) {
      expect(screen.getByRole('columnheader', { name })).toBeVisible();
    }
    const shirt = within(rowWith('School shirt, Size 12'));
    expect(shirt.getByText('−2')).toHaveClass('text-destructive');
    expect(shirt.getByText('₦7,000')).toBeVisible();
    const book = within(rowWith('Mathematics'));
    expect(book.getByText('matches')).toHaveClass('text-muted-foreground');
    expect(book.getByText('—')).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Show counted items' })
    ).toHaveAttribute('aria-expanded', 'true');
  });

  it('colours a surplus as success with a plus sign', async () => {
    const user = userEvent.setup();
    setup({
      data: stockCountList([
        stockCount({
          status: 'approved',
          netValueMinor: -325_000,
          differences: 'School shirt, Size 12: 1 extra',
          lines: [
            {
              itemId: 'shirt',
              displayName: 'School shirt, Size 12',
              expectedQuantity: 4,
              countedQuantity: 5,
              difference: 1,
              valueMinor: 325_000,
            },
          ],
        }),
      ]),
    });

    await user.click(
      screen.getByRole('button', { name: 'Show counted items' })
    );

    expect(screen.getByText('+1')).toHaveClass('text-success');
  });

  it('expands from the other cells of the row too', async () => {
    const user = userEvent.setup();
    setup();

    await user.click(screen.getByText('Chika Eze'));

    expect(screen.getByText('3 items counted')).toBeVisible();
  });

  it('masks the value until Show costs is on, and keeps it masked on the lines', async () => {
    const user = userEvent.setup();
    setup({ showCosts: false });

    expect(
      within(rowWith('CNT-2026-0001')).getByLabelText('Hidden')
    ).toHaveTextContent('₦ ••••');
    expect(screen.queryByText('₦8,200')).not.toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: 'Show counted items' })
    );
    expect(screen.queryByText('₦7,000')).not.toBeInTheDocument();
    expect(screen.getAllByLabelText('Hidden').length).toBeGreaterThan(1);
  });

  it('shows a dash for a count with no value and the Matched status', () => {
    setup({
      data: stockCountList([
        stockCount({
          status: 'matched',
          netValueMinor: 0,
          differences: 'matches',
          lines: [],
        }),
      ]),
    });

    const row = within(rowWith('CNT-2026-0001'));
    expect(row.getByText('Matched')).toBeVisible();
    expect(row.getByText('—')).toBeVisible();
    expect(row.getByText('matches')).toBeVisible();
    expect(
      row.queryByRole('button', { name: 'Approvals' })
    ).not.toBeInTheDocument();
  });

  it('shows Approved, and Declined with the reason on expanding', async () => {
    const user = userEvent.setup();
    setup({
      data: stockCountList([
        stockCount({ id: 'a', number: 'CNT-2026-0002', status: 'approved' }),
        stockCount({
          id: 'b',
          number: 'CNT-2026-0003',
          status: 'rejected',
          rejectionReason: 'Recount the shelf first',
        }),
      ]),
    });

    expect(
      within(rowWith('CNT-2026-0002')).getByText('Approved')
    ).toBeVisible();
    expect(
      within(rowWith('CNT-2026-0003')).getByText('Declined')
    ).toBeVisible();
    await user.click(
      within(rowWith('CNT-2026-0003')).getByRole('button', {
        name: 'Show counted items',
      })
    );
    expect(screen.getByText('Declined: Recount the shelf first')).toBeVisible();
  });

  it('adds a Campus column only when asked', () => {
    const { unmount } = renderWithApi(
      <StockCountsTable
        data={stockCountList()}
        campuses={[LEKKI, IKEJA]}
        showCampus
        showCosts
        page={1}
        onPage={vi.fn()}
        onApprovals={vi.fn()}
      />,
      {}
    );
    expect(screen.getByRole('columnheader', { name: 'Campus' })).toBeVisible();
    expect(within(rowWith('CNT-2026-0001')).getByText('Lekki')).toBeVisible();
    unmount();
    setup();
    expect(
      screen.queryByRole('columnheader', { name: 'Campus' })
    ).not.toBeInTheDocument();
  });

  it('pages through the counts once there are more than a page', async () => {
    const user = userEvent.setup();
    const { onPage } = setup({
      data: { ...stockCountList(), total: 25 },
    });

    await user.click(screen.getByRole('button', { name: /next/i }));

    expect(onPage).toHaveBeenCalledWith(2);
  });

  it('shows no pager for a single page', () => {
    setup();

    expect(
      screen.queryByRole('button', { name: /next/i })
    ).not.toBeInTheDocument();
  });

  it('shows the empty state', () => {
    setup({ data: stockCountList([]) });

    expect(screen.getByText('No stock counts yet')).toBeVisible();
    expect(
      screen.getByText(
        'Count the shelves each half term. Shortages wait for approval before stock changes.'
      )
    ).toBeVisible();
  });
});
