import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import type { EduvaultAuthClient } from '@eduvault/auth-client';
import { App } from './app';

const clientWith = (session: {
  data: unknown;
  isPending: boolean;
}): EduvaultAuthClient =>
  ({
    useSession: () => session,
    useListOrganizations: () => ({ data: [] }),
    organization: { listUserTeams: () => Promise.resolve({ data: [] }) },
  }) as unknown as EduvaultAuthClient;

const renderApp = (authClient: EduvaultAuthClient) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <App authClient={authClient} />
    </QueryClientProvider>
  );

describe('App', () => {
  it('shows the sign-in form without a session', () => {
    renderApp(clientWith({ data: null, isPending: false }));
    expect(
      screen.getByRole('heading', { name: 'Sign in' })
    ).toBeInTheDocument();
  });

  it('tells a user without a school to ask for an invitation', () => {
    renderApp(
      clientWith({
        data: { session: { activeOrganizationId: null, activeTeamId: null } },
        isPending: false,
      })
    );
    expect(screen.getByText(/not been added to a school/)).toBeInTheDocument();
  });
});
