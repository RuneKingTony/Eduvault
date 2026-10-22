import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  AuthClientProvider,
  type EduvaultAuthClient,
} from '@eduvault/auth-client';
import { PortalOnlyScreen } from './portal-only-screen';

function setup() {
  const signOut = vi.fn().mockResolvedValue({ data: {}, error: null });
  const authClient = { signOut } as unknown as EduvaultAuthClient;
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AuthClientProvider authClient={authClient}>
        <PortalOnlyScreen />
      </AuthClientProvider>
    </QueryClientProvider>
  );
  return { signOut };
}

describe('PortalOnlyScreen', () => {
  it('tells students and guardians to use the portal, with no nav', () => {
    setup();
    expect(
      screen.getByText('Students and guardians use the portal.')
    ).toBeInTheDocument();
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });

  it('links to web-portal', () => {
    setup();
    expect(
      screen.getByRole('link', { name: 'Go to web-portal' })
    ).toHaveAttribute('href', 'http://localhost:4201');
  });

  it('signs out', async () => {
    const user = userEvent.setup();
    const { signOut } = setup();
    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    await waitFor(() => {
      expect(signOut).toHaveBeenCalledOnce();
    });
  });
});
