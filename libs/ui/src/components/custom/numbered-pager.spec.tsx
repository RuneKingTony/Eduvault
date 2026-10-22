import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NumberedPager } from './numbered-pager';

let user: ReturnType<typeof userEvent.setup>;

beforeEach(() => {
  user = userEvent.setup();
});

describe('NumberedPager', () => {
  it('says which rows are shown and has no previous page on the first', async () => {
    const onPage = vi.fn();
    render(<NumberedPager page={1} total={24} pageSize={10} onPage={onPage} />);
    expect(screen.getByText('Showing 1 to 10 of 24')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Page 1' })).toHaveAttribute(
      'aria-current',
      'page'
    );
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(onPage).toHaveBeenCalledWith(2);
  });

  it('clips the last page and has no next page at the end', async () => {
    const onPage = vi.fn();
    render(<NumberedPager page={3} total={24} pageSize={10} onPage={onPage} />);
    expect(screen.getByText('Showing 21 to 24 of 24')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Previous' }));
    expect(onPage).toHaveBeenCalledWith(2);
  });

  it('jumps to a numbered page', async () => {
    const onPage = vi.fn();
    render(<NumberedPager page={1} total={24} pageSize={10} onPage={onPage} />);
    await user.click(screen.getByRole('button', { name: 'Page 3' }));
    expect(onPage).toHaveBeenCalledWith(3);
  });

  it('collapses a long run of pages around the current one', () => {
    render(
      <NumberedPager page={5} total={200} pageSize={10} onPage={vi.fn()} />
    );
    const labels = screen
      .getAllByRole('button')
      .map((button) => button.textContent);
    expect(labels).toEqual(['Previous', '1', '4', '5', '6', '20', 'Next']);
  });

  it('shows one page for an empty list', () => {
    render(<NumberedPager page={1} total={0} pageSize={10} onPage={vi.fn()} />);
    expect(screen.getByText('Showing 0 to 0 of 0')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
  });
});
