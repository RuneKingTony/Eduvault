import { fireEvent, screen } from '@testing-library/react';
import { ApiError } from '@eduvault/api-contract';
import { toast } from '@eduvault/ui';
import { currentYear } from '../../test-calendar';
import { renderWithApi } from '../../test-utils';
import { findTerm } from './calendar-text';
import { EditDatesDialog } from './edit-dates-dialog';

function setup(update: ReturnType<typeof vi.fn>) {
  const target = findTerm([currentYear()], 't2');
  if (target === undefined) {
    throw new Error('no target');
  }
  const onOpenChange = vi.fn();
  renderWithApi(
    <EditDatesDialog target={target} onOpenChange={onOpenChange} />,
    {
      terms: { update },
      schoolYears: { list: vi.fn().mockResolvedValue({ items: [], total: 0 }) },
      calendar: { current: vi.fn() },
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
    const success = vi.spyOn(toast, 'success').mockReturnValue(1);
    const update = vi.fn().mockResolvedValue({ schoolDays: 55 });
    const onOpenChange = setup(update);
    fireEvent.change(screen.getByLabelText('Starts'), {
      target: { value: '2027-01-11' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save dates' }));
    await vi.waitFor(() => {
      expect(update).toHaveBeenCalledWith({
        params: { id: 't2' },
        body: { startsOn: '2027-01-11', endsOn: '2027-03-26' },
      });
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
    expect(success).toHaveBeenCalledWith(
      'Dates saved. Second term, 2026/2027 now has 55 school days.'
    );
  });

  it('shows the API refusal inline and stays open', async () => {
    const update = vi.fn().mockRejectedValue(
      new ApiError(400, {
        code: 'BadRequest',
        message: 'These dates overlap Third term.',
      })
    );
    const onOpenChange = setup(update);
    fireEvent.click(screen.getByRole('button', { name: 'Save dates' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'These dates overlap Third term.'
    );
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});
