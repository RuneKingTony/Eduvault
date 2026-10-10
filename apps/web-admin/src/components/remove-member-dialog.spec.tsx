import { fireEvent, screen, waitFor } from '@testing-library/react';
import { ApiError } from '@eduvault/api-contract';
import { toast } from '@eduvault/ui';
import { renderWithApi } from '../test-utils';
import { detail } from '../test-members';
import { RemoveMemberDialog } from './remove-member-dialog';

vi.mock('@eduvault/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@eduvault/ui')>()),
  toast: { success: vi.fn(), error: vi.fn() },
}));

function setup({
  remove = vi.fn().mockResolvedValue({ id: detail().id }),
}: { remove?: ReturnType<typeof vi.fn> } = {}) {
  const onOpenChange = vi.fn();
  const onRemoved = vi.fn().mockResolvedValue(undefined);
  renderWithApi(
    <RemoveMemberDialog
      member={detail()}
      schoolName="Greenfield College"
      open
      onOpenChange={onOpenChange}
      onRemoved={onRemoved}
    />,
    { members: { remove } }
  );
  return { remove, onOpenChange, onRemoved };
}

describe('RemoveMemberDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('names the member and the school', () => {
    setup();
    expect(
      screen.getByRole('heading', { name: 'Remove Ada Obi?' })
    ).toBeInTheDocument();
    expect(
      screen.getByText(/They lose access to Greenfield College\./)
    ).toBeInTheDocument();
  });

  it('removes the member, says so, closes and leaves the page', async () => {
    const { remove, onOpenChange, onRemoved } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Remove member' }));
    await waitFor(() => {
      expect(remove).toHaveBeenCalledWith({ params: { id: detail().id } });
    });
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Ada Obi removed.');
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onRemoved).toHaveBeenCalledOnce();
  });

  it('keeps the dialog and the page when the server refuses', async () => {
    const { onOpenChange, onRemoved } = setup({
      remove: vi.fn().mockRejectedValue(
        new ApiError(409, {
          code: 'LAST_OWNER',
          message: 'Ada Obi is the school’s only owner and can’t be removed.',
        })
      ),
    });
    fireEvent.click(screen.getByRole('button', { name: 'Remove member' }));
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        'Ada Obi is the school’s only owner and can’t be removed.'
      );
    });
    expect(onRemoved).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('cancels without calling the API', () => {
    const { remove, onOpenChange } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(remove).not.toHaveBeenCalled();
  });
});
