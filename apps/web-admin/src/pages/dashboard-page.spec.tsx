import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import {
  AuthClientProvider,
  PermissionsProvider,
  type EduvaultAuthClient,
} from '@eduvault/auth-client';
import type { CalendarCurrent, MePermissions } from '@eduvault/api-contract';
import { ApiProvider, type Api } from '../api';
import { MyAccessProvider } from '../components/my-access';
import { currentCalendar, noCalendar } from '../test-calendar';
import { fakeAccess, ownerAccess, starterAccess } from '../test-utils';
import { DashboardPage } from './dashboard-page';

const authClient = {
  useSession: () => ({
    data: {
      session: { activeOrganizationId: 'o1' },
      user: { name: 'Funmi Adeyemi', email: 'funmi@school.test', image: null },
    },
  }),
  useListOrganizations: () => ({
    data: [{ id: 'o1', name: 'Greenfield College' }],
  }),
} as unknown as EduvaultAuthClient;

async function renderDashboard(
  access: MePermissions,
  calendar: CalendarCurrent
) {
  const api = {
    calendar: { current: vi.fn().mockResolvedValue(calendar) },
  } as unknown as Api;
  const root = createRootRoute({
    component: () => (
      <PermissionsProvider value={access}>
        <MyAccessProvider>
          <DashboardPage />
        </MyAccessProvider>
      </PermissionsProvider>
    ),
  });
  const calendarRoute = createRoute({
    getParentRoute: () => root,
    path: '/calendar',
  });
  const router = createRouter({
    routeTree: root.addChildren([calendarRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ApiProvider api={api}>
        <AuthClientProvider authClient={authClient}>
          <RouterProvider router={router} />
        </AuthClientProvider>
      </ApiProvider>
    </QueryClientProvider>
  );
  await screen.findByRole('heading', { name: 'Dashboard' });
}

describe('DashboardPage term card', () => {
  it('shows the term, its dates and the school days so far', async () => {
    await renderDashboard(ownerAccess(), currentCalendar());
    expect(
      await screen.findByText('First term · 2026/2027')
    ).toBeInTheDocument();
    expect(screen.getByText('7 Sep 2026 – 11 Dec 2026')).toBeInTheDocument();
    expect(screen.getByText('22 of 67 school days')).toBeInTheDocument();
  });

  it('links to the calendar only with session:read', async () => {
    await renderDashboard(ownerAccess(), currentCalendar());
    expect(
      await screen.findByRole('link', { name: 'Calendar' })
    ).toHaveAttribute('href', '/calendar');
  });

  it('hides the Calendar link from a teacher', async () => {
    await renderDashboard(starterAccess('teacher'), currentCalendar());
    await screen.findByText('First term · 2026/2027');
    expect(
      screen.queryByRole('link', { name: 'Calendar' })
    ).not.toBeInTheDocument();
  });

  it('shows the set-up callout with a button to someone who can create a year', async () => {
    await renderDashboard(ownerAccess(), noCalendar());
    expect(
      await screen.findByText('Create the first school year')
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'New school year' })
    ).toBeInTheDocument();
    expect(screen.queryByText(/school days/)).not.toBeInTheDocument();
  });

  it('tells a teacher the school has not set up its year', async () => {
    await renderDashboard(starterAccess('teacher'), noCalendar());
    expect(
      await screen.findByText('Your school hasn’t set up its school year yet.')
    ).toBeInTheDocument();
  });

  it('keeps a session:read-only member out of the create button', async () => {
    await renderDashboard(
      fakeAccess({ permissions: { session: ['read'] } }),
      noCalendar()
    );
    await screen.findByText('Your school hasn’t set up its school year yet.');
    expect(
      screen.queryByRole('button', { name: 'New school year' })
    ).not.toBeInTheDocument();
  });
});
