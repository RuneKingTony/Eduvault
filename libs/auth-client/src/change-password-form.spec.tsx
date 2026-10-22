import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '@eduvault/api-contract';
import { ChangePasswordForm } from './change-password-form';

function setup(onSubmit = vi.fn().mockResolvedValue(undefined)) {
  const onSignOut = vi.fn();
  render(<ChangePasswordForm onSubmit={onSubmit} onSignOut={onSignOut} />);
  return { onSubmit, onSignOut };
}

const fill = async (newPassword: string, confirm: string) => {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('New password'), newPassword);
  await user.type(screen.getByLabelText('Confirm new password'), confirm);
  await user.click(screen.getByRole('button', { name: 'Save and continue' }));
};

describe('ChangePasswordForm', () => {
  it('asks the person to choose their own password', () => {
    setup();
    expect(
      screen.getByRole('heading', { name: 'Choose your own password' })
    ).toBeInTheDocument();
  });

  it('refuses a short password without calling the server', async () => {
    const { onSubmit } = setup();
    await fill('nine-char', 'nine-char');
    expect(screen.getByText('Use at least 10 characters.')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('refuses a mismatch', async () => {
    const { onSubmit } = setup();
    await fill('long-enough-password', 'another-long-password');
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
    await fill('long-enough-password', 'long-enough-password');
    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(onSubmit).toHaveBeenCalledWith('long-enough-password');
  });

  it('submits a valid password', async () => {
    const { onSubmit } = setup();
    await fill('long-enough-password', 'long-enough-password');
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith('long-enough-password');
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('lets the person leave with Sign out', async () => {
    const { onSignOut } = setup();
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Sign out' }));
    expect(onSignOut).toHaveBeenCalledOnce();
  });
});
