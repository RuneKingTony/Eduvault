import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import {
  AuthClientProvider,
  type EduvaultAuthClient,
} from '@eduvault/auth-client';
import { StaffScreen } from './staff-screen';

function setup() {
  const authClient = { signOut: vi.fn() } as unknown as EduvaultAuthClient;
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AuthClientProvider authClient={authClient}>
        <StaffScreen />
      </AuthClientProvider>
    </QueryClientProvider>
  );
}

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
});
