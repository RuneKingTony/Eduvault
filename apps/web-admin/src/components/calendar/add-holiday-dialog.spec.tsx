import { fireEvent, screen } from '@testing-library/react';
import { ApiError } from '@eduvault/api-contract';
import { toast } from '@eduvault/ui';
import { currentYear, nextYear, term } from '../../test-calendar';
import { renderWithApi } from '../../test-utils';
import {
  AddHolidayDialog,
  NO_TERM_ERROR,
  openTerms,
} from './add-holiday-dialog';

function setup(
  create: ReturnType<typeof vi.fn>,
  years = [currentYear(), nextYear()],
  termId: string | null = 't1'
) {
  const onOpenChange = vi.fn();
  renderWithApi(
    <AddHolidayDialog
      years={years}
      termId={termId}
      onOpenChange={onOpenChange}
    />,
    {
      holidays: { create },
      schoolYears: { list: vi.fn().mockResolvedValue({ items: [], total: 0 }) },
      calendar: { current: vi.fn() },
    }
  );
  return onOpenChange;
}

describe('AddHolidayDialog', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-07T09:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('lists only terms that have not ended, by start date', () => {
    const ended = currentYear();
    ended.terms[0] = term({ ...ended.terms[0], ended: true });
    expect(
      openTerms([nextYear(), ended]).map(
        ({ term: t, year }) => `${year.name} ${t.name}`
      )
    ).toEqual([
      '2026/2027 Second term',
      '2026/2027 Third term',
      '2027/2028 First term',
      '2027/2028 Second term',
      '2027/2028 Third term',
    ]);
  });

  it('defaults the date to a week after today, or after a later term start', () => {
    setup(vi.fn(), [currentYear(), nextYear()], 't1');
    expect(screen.getByLabelText('Date')).toHaveValue('2026-10-14');
    fireEvent.change(screen.getByLabelText('Term'), {
      target: { value: 't4' },
    });
    expect(screen.getByLabelText('Date')).toHaveValue('2027-09-13');
  });

  it('adds the holiday, toasts the new count and closes', async () => {
    const success = vi.spyOn(toast, 'success').mockReturnValue(1);
    const create = vi.fn().mockResolvedValue({
      holiday: {},
      term: { schoolDays: 66 },
    });
    const onOpenChange = setup(create);
    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: 'Sports day' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add holiday' }));
    await vi.waitFor(() => {
      expect(create).toHaveBeenCalledWith({
        params: { id: 't1' },
        body: { date: '2026-10-14', name: 'Sports day' },
      });
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
    expect(success).toHaveBeenCalledWith(
      'Holiday added. First term, 2026/2027 now has 66 school days.'
    );
  });

  it('asks for a name, and for a term when none is left', async () => {
    const create = vi.fn();
    setup(create);
    fireEvent.click(screen.getByRole('button', { name: 'Add holiday' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Fill in the date and the name.'
    );
    expect(create).not.toHaveBeenCalled();
  });

  it('shows the no-term message when every term has ended', async () => {
    const past = currentYear();
    past.terms = past.terms.map((t) => term({ ...t, ended: true }));
    setup(vi.fn(), [past], null);
    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: 'x' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add holiday' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(NO_TERM_ERROR);
  });

  it('shows the API refusal inline', async () => {
    const create = vi.fn().mockRejectedValue(
      new ApiError(409, {
        code: 'Conflict',
        message: '1 Oct 2026 is already a holiday: Independence Day.',
      })
    );
    setup(create);
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add holiday' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '1 Oct 2026 is already a holiday: Independence Day.'
    );
  });
});
