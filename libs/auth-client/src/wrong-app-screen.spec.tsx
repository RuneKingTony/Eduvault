import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AuthClientProvider } from './auth-client-context';
import type { EduvaultAuthClient } from './auth-client';
import { WrongAppScreen } from './wrong-app-screen';

function setup(queryClient = new QueryClient()) {
  const signOut = vi.fn().mockResolvedValue({ data: {}, error: null });
  const authClient = { signOut } as unknown as EduvaultAuthClient;
  render(
    <QueryClientProvider client={queryClient}>
      <AuthClientProvider authClient={authClient}>
        <WrongAppScreen
          variant="staff"
          icon={<span />}
          title="Use the other app."
          link={{ href: 'http://localhost:9999', label: 'Go to the other app' }}
        />
      </AuthClientProvider>
    </QueryClientProvider>
  );
  return { signOut, queryClient };
}

describe('WrongAppScreen', () => {
  it('shows the title and links to the other app, with no nav', () => {
    setup();
    expect(screen.getByText('Use the other app.')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Go to the other app' })
    ).toHaveAttribute('href', 'http://localhost:9999');
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });

  it('signs out and forgets what was cached', async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(['students'], ['kept']);
    const { signOut } = setup(queryClient);

    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));

    await waitFor(() => {
      expect(signOut).toHaveBeenCalledOnce();
    });
    await waitFor(() => {
      expect(queryClient.getQueryData(['students'])).toBeUndefined();
    });
  });
});
