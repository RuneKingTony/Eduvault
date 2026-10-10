import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { render, screen, within } from '@testing-library/react';
import { PermissionsProvider } from '@eduvault/auth-client';
import type { MePermissions } from '@eduvault/api-contract';
import { fakeAccess, ownerAccess, starterAccess } from '../test-utils';
import { SettingsLayout } from './settings-nav';

async function renderAt(path: string, access: MePermissions) {
  const root = createRootRoute({
    component: () => (
      <PermissionsProvider value={access}>
        <SettingsLayout>
          <p>Page body</p>
        </SettingsLayout>
      </PermissionsProvider>
    ),
  });
  const page = (to: string) =>
    createRoute({ getParentRoute: () => root, path: to });
  const router = createRouter({
    routeTree: root.addChildren([
      page('/campuses'),
      page('/roles'),
      page('/roles/new'),
      page('/settings/profile'),
      page('/settings/admissions'),
      page('/settings/danger'),
      page('/settings'),
    ]),
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
  return screen.findByRole('navigation', { name: 'Settings sections' });
}

const optionLabels = (select: HTMLElement) =>
  within(select)
    .getAllByRole('option')
    .map((option) => option.textContent);

describe('SettingsNav', () => {
  it('groups the sections the member can open and marks the current one', async () => {
    const nav = within(await renderAt('/roles', ownerAccess()));
    expect(nav.getByText('School structure')).toBeInTheDocument();
    expect(nav.getByText('Access')).toBeInTheDocument();
    expect(
      nav.getByRole('link', { name: 'Roles and permissions' })
    ).toHaveAttribute('aria-current', 'page');
    expect(nav.getByRole('link', { name: 'Campuses' })).not.toHaveAttribute(
      'aria-current'
    );
    expect(screen.getByText('Page body')).toBeInTheDocument();
  });

  it('highlights a section for a path below it', async () => {
    const nav = within(await renderAt('/roles/new', ownerAccess()));
    expect(
      nav.getByRole('link', { name: 'Roles and permissions' })
    ).toHaveAttribute('aria-current', 'page');
  });

  it('shows an administrator both sections', async () => {
    const nav = within(
      await renderAt('/campuses', starterAccess('administrator'))
    );
    expect(nav.getByRole('link', { name: 'Campuses' })).toHaveAttribute(
      'aria-current',
      'page'
    );
    expect(
      nav.getByRole('link', { name: 'Roles and permissions' })
    ).toBeInTheDocument();
  });

  it('hides a section the member cannot open', async () => {
    const nav = within(
      await renderAt('/roles', fakeAccess({ permissions: { ac: ['read'] } }))
    );
    expect(
      nav.getByRole('link', { name: 'Roles and permissions' })
    ).toBeInTheDocument();
    expect(
      nav.queryByRole('link', { name: 'Campuses' })
    ).not.toBeInTheDocument();
    expect(nav.queryByText('School structure')).not.toBeInTheDocument();
  });

  it('lists the General items in order and the Danger zone for an owner', async () => {
    const nav = within(await renderAt('/settings/profile', ownerAccess()));
    expect(nav.getByText('General')).toBeInTheDocument();
    expect(nav.getAllByRole('link').map((link) => link.textContent)).toEqual([
      'School profile',
      'Admissions rules',
      'Campuses',
      'Roles and permissions',
      'Danger zone',
    ]);
    expect(nav.getByRole('link', { name: 'School profile' })).toHaveAttribute(
      'aria-current',
      'page'
    );
  });

  it('hides the Danger zone from an administrator', async () => {
    const nav = within(
      await renderAt('/settings/profile', starterAccess('administrator'))
    );
    expect(
      nav.queryByRole('link', { name: 'Danger zone' })
    ).not.toBeInTheDocument();
  });

  it('offers a phone select with option groups and the current section chosen', async () => {
    await renderAt('/settings/admissions', ownerAccess());
    const select = screen.getByRole('combobox', { name: 'Settings section' });
    expect(select).toHaveValue('/settings/admissions');
    expect(optionLabels(select)).toEqual([
      'School profile',
      'Admissions rules',
      'Campuses',
      'Roles and permissions',
      'Danger zone',
    ]);
    expect(
      within(select).getByRole('group', { name: 'General' })
    ).toBeInTheDocument();
    expect(
      within(select).queryByRole('option', { name: 'Choose a section' })
    ).not.toBeInTheDocument();
  });

  it('starts the phone select on "Choose a section" when the page is not an item', async () => {
    await renderAt('/settings', ownerAccess());
    const select = screen.getByRole('combobox', { name: 'Settings section' });
    expect(optionLabels(select)[0]).toBe('Choose a section');
    expect(select).toHaveValue('');
  });
});
