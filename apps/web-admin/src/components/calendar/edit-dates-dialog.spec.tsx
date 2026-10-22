import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '@eduvault/api-contract';
import { toast } from '@eduvault/ui';
import { TERM_2, currentYear, noCalendar, term } from '../../test-calendar';
import { renderWithApi } from '../../test-utils';
import { findTerm } from './calendar-text';
import { EditDatesDialog } from './edit-dates-dialog';

function setup(update: ReturnType<typeof vi.fn>) {
  const target = findTerm([currentYear()], TERM_2);
  if (target === undefined) {
    throw new Error('no target');
  }
  const onOpenChange = vi.fn();
  renderWithApi(
    <EditDatesDialog target={target} onOpenChange={onOpenChange} />,
    {
      terms: { update },
      schoolYears: { list: vi.fn().mockResolvedValue({ items: [], total: 0 }) },
      calendar: { current: vi.fn().mockResolvedValue(noCalendar()) },
    }
  );
  return onOpenChange;
}

describe('EditDatesDialog', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('pre-fills the term’s dates and says what stays true', () => {
    setup(vi.fn());
    expect(screen.getByText('Edit Second term, 2026/2027')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Terms stay in order, inside the school year, without overlapping.'
      )
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Starts')).toHaveValue('2027-01-04');
    expect(screen.getByLabelText('Ends')).toHaveValue('2027-03-26');
  });

  it('saves the dates, toasts the new school days and closes', async () => {
    const user = userEvent.setup();
    const success = vi.spyOn(toast, 'success').mockReturnValue(1);
    const update = vi.fn(
      ({ body }: { body: { startsOn?: string; endsOn?: string } }) =>
        term({ id: TERM_2, ...body, schoolDays: 55 })
    );
    const onOpenChange = setup(update);
    await user.clear(screen.getByLabelText('Starts'));
    await user.type(screen.getByLabelText('Starts'), '2027-01-11');
    await user.click(screen.getByRole('button', { name: 'Save dates' }));
    await vi.waitFor(() => {
      expect(update).toHaveBeenCalledWith({
        params: { id: TERM_2 },
        body: { startsOn: '2027-01-11', endsOn: '2027-03-26' },
      });
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
    expect(success).toHaveBeenCalledWith(
      'Dates saved. Second term, 2026/2027 now has 55 school days.'
    );
  });

  it('shows the API refusal inline and stays open', async () => {
    const user = userEvent.setup();
    const update = vi.fn().mockRejectedValue(
      new ApiError(400, {
        code: 'BadRequest',
        message: 'These dates overlap Third term.',
      })
    );
    const onOpenChange = setup(update);
    await user.click(screen.getByRole('button', { name: 'Save dates' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'These dates overlap Third term.'
    );
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});
