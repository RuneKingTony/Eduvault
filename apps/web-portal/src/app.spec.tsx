import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { EduvaultAuthClient } from '@eduvault/auth-client';
import type { Me } from '@eduvault/api-contract';
import { ApiProvider, type Api } from './api';
import { App } from './app';

vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-router')>()),
  RouterProvider: () => <p>The router is showing</p>,
}));

const me = (overrides: Partial<Me> = {}): Me => ({
  user: { id: 'u1', email: 'ada@school.test', name: 'Ada' },
  activeOrganizationId: 'o1',
  activeCampusId: null,
  mustChangePassword: false,
  platformRole: null,
  schoolCount: 1,
  suspendedSchool: null,
  ...overrides,
});

const signedIn = {
  data: { session: { activeOrganizationId: 'o1' } },
  isPending: false,
};

const clientWith = (
  session: { data: unknown; isPending: boolean },
  signOut = vi.fn().mockResolvedValue({ data: {}, error: null })
): EduvaultAuthClient =>
  ({
    useSession: () => session,
    useListOrganizations: () => ({ data: [] }),
    signOut,
  }) as unknown as EduvaultAuthClient;

const apiWith = (...answers: Me[]) => {
  const get = vi.fn();
  for (const answer of answers) {
    get.mockResolvedValueOnce(answer);
  }
  const setPassword = vi.fn().mockResolvedValue(undefined);
  return {
    api: { me: { get, setPassword } } as unknown as Api,
    setPassword,
  };
};

const renderApp = (authClient: EduvaultAuthClient, api: Partial<Api> = {}) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ApiProvider api={api as Api}>
        <App authClient={authClient} />
      </ApiProvider>
    </QueryClientProvider>
  );

describe('App', () => {
  it('shows the portal sign-in form without a session', () => {
    renderApp(clientWith({ data: null, isPending: false }));
    expect(
      screen.getByRole('heading', { name: 'Sign in' })
    ).toBeInTheDocument();
    expect(screen.getByText('Students and guardians')).toBeInTheDocument();
  });

  it('holds a flagged user on the password screen', async () => {
    const { api } = apiWith(me({ mustChangePassword: true }));
    renderApp(clientWith(signedIn), api);
    expect(
      await screen.findByRole('heading', { name: 'Choose your own password' })
    ).toBeInTheDocument();
    expect(screen.getByText('Students and guardians')).toBeInTheDocument();
    expect(screen.queryByText('The router is showing')).not.toBeInTheDocument();
  });

  it('tells a user without a school to ask the school', async () => {
    const signOut = vi.fn().mockResolvedValue({ data: {}, error: null });
    const { api } = apiWith(me({ schoolCount: 0, activeOrganizationId: null }));
    renderApp(
      clientWith(
        { data: { session: { activeOrganizationId: null } }, isPending: false },
        signOut
      ),
      api
    );
    expect(
      await screen.findByText('You’re not linked to a school yet')
    ).toBeInTheDocument();
    expect(
      screen.getByText('Ask the school to add you as a student or guardian.')
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    await waitFor(() => {
      expect(signOut).toHaveBeenCalledOnce();
    });
  });

  it('treats a super admin as having no school', async () => {
    const { api } = apiWith(me({ platformRole: 'superadmin', schoolCount: 0 }));
    renderApp(
      clientWith({
        data: { session: { activeOrganizationId: null } },
        isPending: false,
      }),
      api
    );
    expect(
      await screen.findByText('You’re not linked to a school yet')
    ).toBeInTheDocument();
  });

  it('opens the app for a member of a school', async () => {
    const { api } = apiWith(me());
    renderApp(clientWith(signedIn), api);
    expect(
      await screen.findByText('The router is showing')
    ).toBeInTheDocument();
  });

  it('shows sign-in, not an error, once the session is gone', () => {
    const get = vi
      .fn()
      .mockRejectedValue(new Error('Authentication is required'));
    const api = { me: { get } } as unknown as Api;
    renderApp(clientWith({ data: null, isPending: false }), api);
    expect(
      screen.getByRole('heading', { name: /Welcome back|Sign in/ })
    ).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows the paused screen for a suspended school, with sign out', async () => {
    const signOut = vi.fn().mockResolvedValue({ data: {}, error: null });
    const { api } = apiWith(
      me({ suspendedSchool: { id: 'o1', name: 'Greenfield College' } })
    );
    renderApp(clientWith(signedIn, signOut), api);
    expect(
      await screen.findByText('Greenfield College is paused on Eduvault')
    ).toBeInTheDocument();
    expect(screen.getByText('Contact the school for details.')).toBeVisible();
    expect(screen.queryByText('The router is showing')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Greenfield|School/ })
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    await waitFor(() => {
      expect(signOut).toHaveBeenCalledOnce();
    });
  });

  it('offers the school switcher when the person belongs to other schools', async () => {
    const { api } = apiWith(
      me({
        schoolCount: 2,
        suspendedSchool: { id: 'o1', name: 'Greenfield College' },
      })
    );
    renderApp(clientWith(signedIn), api);
    await screen.findByText('Greenfield College is paused on Eduvault');
    expect(
      screen.getAllByRole('button').map((button) => button.textContent)
    ).toEqual(expect.arrayContaining(['Sign out', 'Check again']));
    expect(screen.getAllByRole('button')).toHaveLength(3);
  });
});
