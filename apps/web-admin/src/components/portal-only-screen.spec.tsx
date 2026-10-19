import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import {
  AuthClientProvider,
  type EduvaultAuthClient,
} from '@eduvault/auth-client';
import { PortalOnlyScreen } from './portal-only-screen';

function setup() {
  const authClient = { signOut: vi.fn() } as unknown as EduvaultAuthClient;
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AuthClientProvider authClient={authClient}>
        <PortalOnlyScreen />
      </AuthClientProvider>
    </QueryClientProvider>
  );
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
});
