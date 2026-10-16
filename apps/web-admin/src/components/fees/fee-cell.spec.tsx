import { render, screen } from '@testing-library/react';
import { TooltipProvider } from '@eduvault/ui';
import { gridCell } from '../../test-fees';
import { FeeCell } from './fee-cell';

const show = (cell = gridCell()) =>
  render(
    <TooltipProvider>
      <FeeCell cell={cell} currency="NGN" />
    </TooltipProvider>
  );

const BASE = {
  feeLineId: 'a',
  amountMinor: 18_000_000,
  appliesTo: 'all',
  isOptional: false,
} as const;

describe('FeeCell', () => {
  it('shows the every-campus amount alone for a plain base', () => {
    show();
    expect(screen.getByText('₦180,000')).toBeInTheDocument();
    expect(screen.queryByText('Optional')).not.toBeInTheDocument();
    expect(screen.queryByText(/students only/)).not.toBeInTheDocument();
  });

  it('adds an Optional badge when the base is optional', () => {
    show(gridCell({ base: { ...BASE, isOptional: true } }));
    expect(screen.getByText('Optional')).toBeInTheDocument();
  });

  it('adds the audience badge for new and returning lines only', () => {
    show(gridCell({ base: { ...BASE, appliesTo: 'new' } }));
    expect(screen.getByText('New students only')).toBeInTheDocument();
  });

  it('labels a returning-only base as Returning students only', () => {
    show(gridCell({ base: { ...BASE, appliesTo: 'returning' } }));
    expect(screen.getByText('Returning students only')).toBeInTheDocument();
  });

  it('lists a campus override under the base amount', () => {
    show(
      gridCell({
        overrides: [
          {
            ...BASE,
            feeLineId: 'b',
            amountMinor: 16_500_000,
            campusId: 'c-ikeja',
            campusName: 'Ikeja',
          },
        ],
      })
    );
    expect(screen.getByText('₦180,000')).toBeInTheDocument();
    expect(screen.getByText(/Ikeja ₦165,000/)).toBeInTheDocument();
  });

  it('shows a dash for the base when only an override exists', () => {
    show(
      gridCell({
        base: null,
        overrides: [
          {
            ...BASE,
            feeLineId: 'b',
            campusId: 'c-ikeja',
            campusName: 'Ikeja',
          },
        ],
      })
    );
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.getByText(/Ikeja ₦180,000/)).toBeInTheDocument();
  });

  it('shows a lone dash for a cell with neither base nor override', () => {
    show(gridCell({ base: null }));
    expect(screen.getByText('—')).toBeInTheDocument();
  });
});
