import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TablePager } from './table-pager';

describe('TablePager', () => {
  it('has no previous page on the first page and moves forward', async () => {
    const user = userEvent.setup();
    const onNext = vi.fn();
    render(
      <TablePager page={1} hasNext onPrevious={vi.fn()} onNext={onNext} />
    );
    expect(screen.getByText('Page 1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(onNext).toHaveBeenCalledOnce();
  });

  it('has no next page at the end and moves back', async () => {
    const user = userEvent.setup();
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
    await user.click(screen.getByRole('button', { name: 'Previous' }));
    expect(onPrevious).toHaveBeenCalledOnce();
  });
});
