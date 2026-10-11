import { render, screen } from '@testing-library/react';
import { DayOffRow } from './day-off-row';

const row = (highlighted?: boolean) => (
  <ul>
    <DayOffRow
      month="Oct"
      day={29}
      name="Founders day"
      subline="Thu · no school"
      relative="in 3 days"
      highlighted={highlighted}
    />
  </ul>
);

describe('DayOffRow', () => {
  it('shows the date chip, name, sub-line and relative time', () => {
    render(row());
    expect(screen.getByText('Oct')).toBeInTheDocument();
    expect(screen.getByText('29')).toBeInTheDocument();
    expect(screen.getByText('Founders day')).toBeInTheDocument();
    expect(screen.getByText('Thu · no school')).toBeInTheDocument();
    expect(screen.getByText('in 3 days')).toBeInTheDocument();
  });

  it('highlights the next one', () => {
    render(row(true));
    expect(screen.getByRole('listitem')).toHaveClass('bg-muted');
  });

  it('leaves the others plain', () => {
    render(row());
    expect(screen.getByRole('listitem')).not.toHaveClass('bg-muted');
  });
});
