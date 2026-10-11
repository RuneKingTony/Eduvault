import { render, screen } from '@testing-library/react';
import { DayOffList } from './day-off-list';

const rows = [
  {
    key: 'founders-2026-10-29',
    month: 'Oct',
    day: 29,
    name: 'Founders day',
    subline: 'Thu · no school',
    relative: 'in 3 days',
    highlighted: true,
  },
];

describe('DayOffList', () => {
  it('shows a loading skeleton while pending', () => {
    render(<DayOffList rows={undefined} isPending error={null} />);
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
  });

  it('shows the error when there are no rows', () => {
    render(
      <DayOffList
        rows={undefined}
        isPending={false}
        error={new Error('Boom')}
      />
    );
    expect(screen.getByText('Boom')).toBeInTheDocument();
  });

  it('says there are no holidays ahead for an empty list', () => {
    render(<DayOffList rows={[]} isPending={false} error={null} />);
    expect(screen.getByText('No holidays ahead')).toBeInTheDocument();
  });

  it('lists each row inside a list carrying the given class', () => {
    render(
      <DayOffList
        rows={rows}
        isPending={false}
        error={null}
        className="max-h-72"
      />
    );
    expect(screen.getByRole('list')).toHaveClass('max-h-72');
    expect(screen.getByText('Founders day')).toBeInTheDocument();
    expect(screen.getByRole('listitem')).toHaveClass('bg-muted');
  });
});
