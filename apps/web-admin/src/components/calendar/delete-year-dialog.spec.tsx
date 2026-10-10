import { fireEvent, screen } from '@testing-library/react';
import { ApiError } from '@eduvault/api-contract';
import { toast } from '@eduvault/ui';
import { nextYear } from '../../test-calendar';
import { renderWithApi } from '../../test-utils';
import { DeleteYearDialog } from './delete-year-dialog';

function setup(remove: ReturnType<typeof vi.fn>) {
  const onOpenChange = vi.fn();
  renderWithApi(
    <DeleteYearDialog year={nextYear()} onOpenChange={onOpenChange} />,
    { schoolYears: { remove } }
  );
  return onOpenChange;
}

describe('DeleteYearDialog', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('says what goes and what does not', () => {
    setup(vi.fn());
    expect(screen.getByText('Delete 2027/2028?')).toBeInTheDocument();
    expect(screen.getByText('6 Sep 2027 – 28 Jul 2028')).toBeInTheDocument();
    expect(
      screen.getByText(
        'It has no students, charges or payments, so nothing else is affected.'
      )
    ).toBeInTheDocument();
  });

  it('deletes with a success toast', async () => {
    const success = vi.spyOn(toast, 'success').mockReturnValue(1);
    const remove = vi.fn().mockResolvedValue({ id: 'y2' });
    const onOpenChange = setup(remove);
    fireEvent.click(screen.getByRole('button', { name: 'Delete school year' }));
    await vi.waitFor(() => {
      expect(remove).toHaveBeenCalledWith({ params: { id: 'y2' } });
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
    expect(success).toHaveBeenCalledWith('2027/2028 deleted.');
  });

  it('shows a late refusal as a danger toast and closes without deleting', async () => {
    const error = vi.spyOn(toast, 'error').mockReturnValue(1);
    const remove = vi.fn().mockRejectedValue(
      new ApiError(409, {
        code: 'Conflict',
        message: 'A school year that has already started cannot be deleted.',
      })
    );
    const onOpenChange = setup(remove);
    fireEvent.click(screen.getByRole('button', { name: 'Delete school year' }));
    await vi.waitFor(() => {
      expect(error).toHaveBeenCalledWith(
        'A school year that has already started cannot be deleted.'
      );
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });
});
