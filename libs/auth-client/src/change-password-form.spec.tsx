import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ApiError } from '@eduvault/api-contract';
import { ChangePasswordForm } from './change-password-form';

function setup(onSubmit = vi.fn().mockResolvedValue(undefined)) {
  const onSignOut = vi.fn();
  render(<ChangePasswordForm onSubmit={onSubmit} onSignOut={onSignOut} />);
  return { onSubmit, onSignOut };
}

const fill = (newPassword: string, confirm: string) => {
  fireEvent.change(screen.getByLabelText('New password'), {
    target: { value: newPassword },
  });
  fireEvent.change(screen.getByLabelText('Confirm new password'), {
    target: { value: confirm },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save and continue' }));
};

describe('ChangePasswordForm', () => {
  it('explains the temporary password and the length rule', () => {
    setup();
    expect(
      screen.getByRole('heading', { name: 'Choose your own password' })
    ).toBeInTheDocument();
    expect(
      screen.getByText('You signed in with a temporary password')
    ).toBeInTheDocument();
    expect(screen.getByText('At least 10 characters.')).toBeInTheDocument();
  });

  it('refuses a short password without calling the server', () => {
    const { onSubmit } = setup();
    fill('nine-char', 'nine-char');
    expect(screen.getByText('Use at least 10 characters.')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('refuses a mismatch', () => {
    const { onSubmit } = setup();
    fill('long-enough-password', 'another-long-password');
    expect(screen.getByText('The passwords don’t match.')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('shows the message the server gives for the new password', async () => {
    const message = 'Choose a password different from the temporary one.';
    const { onSubmit } = setup(
      vi.fn().mockRejectedValue(
        new ApiError(400, {
          code: 'ValidationError',
          message: 'Request validation failed',
          issues: [{ path: 'newPassword', message }],
        })
      )
    );
    fill('long-enough-password', 'long-enough-password');
    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(onSubmit).toHaveBeenCalledWith('long-enough-password');
  });

  it('submits a valid password', async () => {
    const { onSubmit } = setup();
    fill('long-enough-password', 'long-enough-password');
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith('long-enough-password');
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('lets the person leave with Sign out', () => {
    const { onSignOut } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(onSignOut).toHaveBeenCalledOnce();
  });
});
