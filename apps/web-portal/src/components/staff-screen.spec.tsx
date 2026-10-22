import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  AuthClientProvider,
  type EduvaultAuthClient,
} from '@eduvault/auth-client';
import { StaffScreen } from './staff-screen';

function setup() {
  const signOut = vi.fn().mockResolvedValue({ data: {}, error: null });
  const authClient = { signOut } as unknown as EduvaultAuthClient;
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AuthClientProvider authClient={authClient}>
        <StaffScreen />
      </AuthClientProvider>
    </QueryClientProvider>
  );
  return { signOut };
}

let user: ReturnType<typeof userEvent.setup>;

beforeEach(() => {
  user = userEvent.setup();
});

describe('StaffScreen', () => {
  it('tells staff the portal is for students and guardians, with no nav', () => {
    setup();
    expect(
      screen.getByText(
        'This portal is for students and guardians. Staff use web-admin.'
      )
    ).toBeInTheDocument();
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });

  it('links to web-admin', () => {
    setup();
    expect(
      screen.getByRole('link', { name: 'Go to web-admin' })
    ).toHaveAttribute('href', 'http://localhost:4200');
  });

  it('signs out', async () => {
    const { signOut } = setup();
    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    await waitFor(() => {
      expect(signOut).toHaveBeenCalledOnce();
    });
  });
});
