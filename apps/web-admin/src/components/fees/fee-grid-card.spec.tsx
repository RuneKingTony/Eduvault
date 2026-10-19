import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TooltipProvider } from '@eduvault/ui';
import { feeGrid, gridCell, gridRow } from '../../test-fees';
import { FeeGridCard } from './fee-grid-card';

const show = (grid = feeGrid(), showTotal = true) =>
  render(
    <TooltipProvider>
      <FeeGridCard
        grid={grid}
        title="School fees · First term, 2026/2027"
        showTotal={showTotal}
        emptyTitle="No school fees for this term"
      />
    </TooltipProvider>
  );

const manyRows = (count: number) =>
  Array.from({ length: count }, (_, index) =>
    gridRow({
      level: {
        id: `lvl-${index}`,
        name: `Level ${index + 1}`,
        sequence: index + 1,
      },
      cells: [gridCell({ base: null })],
    })
  );

describe('FeeGridCard', () => {
  it('shows the title, the count of fees and levels and the level row with its total', () => {
    show();
    expect(
      screen.getByText('School fees · First term, 2026/2027')
    ).toBeInTheDocument();
    expect(screen.getByText('1 fee across 1 level.')).toBeInTheDocument();
    const row = screen.getByRole('row', { name: /JSS 2/ });
    expect(within(row).getByText('₦180,000')).toBeInTheDocument();
    expect(within(row).getByText('₦190,000')).toBeInTheDocument();
    expect(
      screen.getByRole('columnheader', { name: /Typical total/ })
    ).toBeInTheDocument();
  });

  it('counts overrides as fees', () => {
    show(
      feeGrid({
        rows: [
          gridRow({
            cells: [
              gridCell({
                overrides: [
                  {
                    feeLineId: 'b',
                    amountMinor: 1,
                    appliesTo: 'all',
                    isOptional: false,
                    campusId: 'c',
                    campusName: 'Ikeja',
                  },
                ],
              }),
            ],
          }),
        ],
      })
    );
    expect(screen.getByText('2 fees across 1 level.')).toBeInTheDocument();
  });

  it('leaves the typical total column out for Other fees', () => {
    show(feeGrid({ rows: [gridRow({ typicalTotalMinor: null })] }), false);
    expect(
      screen.queryByRole('columnheader', { name: /Typical total/ })
    ).not.toBeInTheDocument();
  });

  it('shows one column per fee type', () => {
    show(
      feeGrid({
        feeTypes: [
          { id: 'ft-tuition', code: 4010, name: 'Tuition' },
          { id: 'ft-pta', code: 4020, name: 'PTA fee' },
        ],
        rows: [
          gridRow({
            cells: [gridCell(), gridCell({ feeTypeId: 'ft-pta', base: null })],
          }),
        ],
      }),
      false
    );
    expect(
      screen.getByRole('columnheader', { name: 'PTA fee' })
    ).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('pages the levels ten at a time', async () => {
    const user = userEvent.setup();
    show(feeGrid({ rows: manyRows(12) }));
    expect(screen.getByText('Level 10')).toBeInTheDocument();
    expect(screen.queryByText('Level 11')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Page 2' }));
    expect(screen.getByText('Level 11')).toBeInTheDocument();
    expect(screen.queryByText('Level 1')).not.toBeInTheDocument();
  });

  it('shows the empty state when no level has a fee', () => {
    show(feeGrid({ rows: [] }));
    expect(
      screen.getByText('No school fees for this term')
    ).toBeInTheDocument();
    expect(screen.getByText('0 fees across 0 levels.')).toBeInTheDocument();
  });
});
