import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fakeClient } from './menu-test-utils';
import { SignOutButton } from './sign-out-button';

async function setup(result: { data: unknown; error: unknown }) {
  const user = userEvent.setup();
  const signOut = vi.fn().mockResolvedValue(result);
  const onSignedOut = vi.fn();
  render(
    <SignOutButton
      authClient={fakeClient({ signOut })}
      onSignedOut={onSignedOut}
    />
  );
  await user.click(screen.getByRole('button', { name: 'Sign out' }));
  return { signOut, onSignedOut };
}

describe('SignOutButton', () => {
  it('signs out and reports it', async () => {
    const { signOut, onSignedOut } = await setup({ data: {}, error: null });
    await waitFor(() => {
      expect(onSignedOut).toHaveBeenCalledOnce();
    });
    expect(signOut).toHaveBeenCalledOnce();
  });

  it('does not report a sign-out that failed', async () => {
    const { signOut, onSignedOut } = await setup({
      data: null,
      error: { message: 'No' },
    });
    await waitFor(() => {
      expect(signOut).toHaveBeenCalledOnce();
    });
    expect(onSignedOut).not.toHaveBeenCalled();
  });
});
