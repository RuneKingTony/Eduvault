import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PermissionsProvider } from '@eduvault/auth-client';
import type { MePermissions } from '@eduvault/api-contract';
import { fakeAccess, ownerAccess, starterAccess } from '../test-utils';
import { NoCurrentTermCallout } from './no-current-term-callout';

async function renderCallout(access: MePermissions) {
  const root = createRootRoute({
    component: () => (
      <PermissionsProvider value={access}>
        <NoCurrentTermCallout />
      </PermissionsProvider>
    ),
  });
  const calendar = createRoute({
    getParentRoute: () => root,
    path: '/calendar',
    component: () => <p>Calendar route</p>,
  });
  const router = createRouter({
    routeTree: root.addChildren([calendar]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });
  render(<RouterProvider router={router} />);
  await screen.findByRole('alert');
  return { router };
}

describe('NoCurrentTermCallout', () => {
  it('offers the first school year to someone who can create one', async () => {
    const { router } = await renderCallout(ownerAccess());
    expect(
      screen.getByText('Create the first school year')
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'New school year' }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/calendar');
    });
    expect(router.state.location.search).toEqual({ dialog: 'new-year' });
  });

  it('only says the school has not set up its year for everyone else', async () => {
    await renderCallout(starterAccess('teacher'));
    expect(
      screen.getByText('Your school hasn’t set up its school year yet.')
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'New school year' })
    ).not.toBeInTheDocument();
  });

  it('does not offer it to a session:read-only member either', async () => {
    await renderCallout(fakeAccess({ permissions: { session: ['read'] } }));
    expect(
      screen.queryByRole('button', { name: 'New school year' })
    ).not.toBeInTheDocument();
  });
});
