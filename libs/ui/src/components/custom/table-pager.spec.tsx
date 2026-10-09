import { fireEvent, render, screen } from '@testing-library/react';
import { TablePager } from './table-pager';

describe('TablePager', () => {
  it('has no previous page on the first page and moves forward', () => {
    const onNext = vi.fn();
    render(
      <TablePager page={1} hasNext onPrevious={vi.fn()} onNext={onNext} />
    );
    expect(screen.getByText('Page 1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(onNext).toHaveBeenCalledOnce();
  });

  it('has no next page at the end and moves back', () => {
    const onPrevious = vi.fn();
    render(
      <TablePager
        page={3}
        hasNext={false}
        onPrevious={onPrevious}
        onNext={vi.fn()}
      />
    );
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
    expect(onPrevious).toHaveBeenCalledOnce();
  });
});
