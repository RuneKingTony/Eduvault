import { fireEvent, screen, waitFor } from '@testing-library/react';
import { ApiError } from '@eduvault/api-contract';
import { toast } from '@eduvault/ui';
import { renderWithApi } from '../test-utils';
import { detail } from '../test-members';
import { ResetPasswordDialog } from './reset-password-dialog';

vi.mock('@eduvault/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@eduvault/ui')>()),
  toast: { success: vi.fn(), error: vi.fn() },
}));

function setup(resetPassword: ReturnType<typeof vi.fn>) {
  const onOpenChange = vi.fn();
  renderWithApi(
    <ResetPasswordDialog member={detail()} open onOpenChange={onOpenChange} />,
    { members: { resetPassword } }
  );
  return { onOpenChange };
}

describe('ResetPasswordDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('names the member and says the old password stops working', () => {
    setup(vi.fn());
    expect(
      screen.getByRole('heading', { name: 'Reset Ada Obi’s password?' })
    ).toBeInTheDocument();
    expect(
      screen.getByText(/The old password stops working at once/)
    ).toBeInTheDocument();
  });

  it('shows the new temporary password once, until Done', async () => {
    const issued = globalThis.crypto.randomUUID();
    const resetPassword = vi
      .fn()
      .mockResolvedValue({ temporaryPassword: issued });
    const { onOpenChange } = setup(resetPassword);
    fireEvent.click(screen.getByRole('button', { name: 'Reset password' }));
    expect(await screen.findByText(issued)).toBeInTheDocument();
    expect(resetPassword).toHaveBeenCalledWith({ params: { id: detail().id } });
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(
      screen.getByRole('heading', { name: 'New password for Ada Obi' })
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    await waitFor(() => {
      expect(screen.queryByText(issued)).not.toBeInTheDocument();
    });
  });

  it('shows the server’s message and no password when it refuses', async () => {
    const resetPassword = vi.fn().mockRejectedValue(
      new ApiError(409, {
        code: 'SHARED_ACCOUNT',
        message: 'Ada Obi also belongs to another school.',
      })
    );
    const { onOpenChange } = setup(resetPassword);
    fireEvent.click(screen.getByRole('button', { name: 'Reset password' }));
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        'Ada Obi also belongs to another school.'
      );
    });
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(
      screen.queryByRole('heading', { name: 'New password for Ada Obi' })
    ).not.toBeInTheDocument();
  });
});
