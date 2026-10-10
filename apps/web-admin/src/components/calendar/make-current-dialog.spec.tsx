import { fireEvent, screen } from '@testing-library/react';
import { fakeAccess, renderWithApi } from '../../test-utils';
import { currentCalendar, currentYear, nextYear } from '../../test-calendar';
import { findTerm } from './calendar-text';
import { MakeCurrentDialog } from './make-current-dialog';

function setup(
  studentsWaiting: number | null,
  access?: Parameters<typeof renderWithApi>[2]
) {
  const next = nextYear({ studentsWaiting });
  const makeCurrent = vi.fn().mockResolvedValue(next.terms[0]);
  const target = findTerm([currentYear(), next], 't4');
  if (target === undefined) {
    throw new Error('no target');
  }
  const onOpenChange = vi.fn();
  renderWithApi(
    <MakeCurrentDialog
      target={target}
      current={currentCalendar()}
      onOpenChange={onOpenChange}
    />,
    {
      terms: { makeCurrent },
      schoolYears: { list: vi.fn().mockResolvedValue({ items: [], total: 0 }) },
      calendar: { current: vi.fn().mockResolvedValue(currentCalendar()) },
    },
    access
  );
  return { makeCurrent, onOpenChange };
}

describe('MakeCurrentDialog', () => {
  it('names the new term and the term that stops being current', () => {
    setup(null);
    expect(
      screen.getByText('Make First term, 2027/2028 current?')
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        '2027/2028 begins, and First term, 2026/2027 stops being the current term.'
      )
    ).toBeInTheDocument();
  });

  it('warns how many students have no class and offers Make current anyway', () => {
    setup(357);
    expect(
      screen.getByText(
        '357 students are not in a 2027/2028 class yet. Start 2027/2028 first, or they will have no class this term.'
      )
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Make current anyway' })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Make current' })
    ).not.toBeInTheDocument();
  });

  it('says one student is waiting in the singular', () => {
    setup(1);
    expect(
      screen.getByText(/1 student is not in a 2027\/2028 class yet/)
    ).toBeInTheDocument();
  });

  it('shows an info callout when every student has a class', () => {
    setup(0);
    expect(
      screen.getByText('Every student is in a 2027/2028 class.')
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Make current' })
    ).toBeInTheDocument();
  });

  it('shows no callout when the count is not known yet', () => {
    setup(null);
    expect(screen.queryByText(/class yet/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Every student/)).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Make current' })
    ).toBeInTheDocument();
  });

  it('makes the term current and closes', async () => {
    const { makeCurrent, onOpenChange } = setup(357);
    fireEvent.click(
      screen.getByRole('button', { name: 'Make current anyway' })
    );
    await vi.waitFor(() => {
      expect(makeCurrent).toHaveBeenCalledWith({ params: { id: 't4' } });
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  it('offers no confirm button without session:setCurrent', () => {
    setup(357, fakeAccess({ permissions: { session: ['read', 'update'] } }));
    expect(
      screen.queryByRole('button', { name: /Make current/ })
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });
});
