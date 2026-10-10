import { fireEvent, screen, within } from '@testing-library/react';
import { toPermissionMap } from '@eduvault/policy';
import { fakeAccess, ownerAccess, renderWithApi } from '../test-utils';
import {
  MEMBER_ROLE_ENTRY,
  OWNER_ROLE_ENTRY,
  ROLE_LIST,
  holder,
  role,
  roleListResponse,
} from '../test-roles';
import { RolesPage } from './roles-page';

const render = (
  items = ROLE_LIST,
  access = ownerAccess(),
  handlers: Partial<Parameters<typeof RolesPage>[0]> = {}
) => {
  const list = vi.fn().mockResolvedValue(roleListResponse(items));
  const onNewRole = vi.fn();
  const onOpenRole = vi.fn();
  renderWithApi(
    <RolesPage onNewRole={onNewRole} onOpenRole={onOpenRole} {...handlers} />,
    { roles: { list } },
    access
  );
  return { list, onNewRole, onOpenRole };
};

const cards = () =>
  within(screen.getByRole('region', { name: 'Your school’s roles' }))
    .getAllByRole('listitem')
    .map((item) => item.querySelector('button')?.getAttribute('aria-label'));

describe('RolesPage', () => {
  it('groups the ready-made roles in seed order, then the school’s own, and keeps Owner and Member out of the grid', async () => {
    render([
      ...ROLE_LIST,
      role('cashier', { label: 'Cashier' }),
      role('hall', { label: 'Hall monitor' }),
    ]);
    await screen.findByRole('region', { name: 'Your school’s roles' });
    expect(cards()).toEqual([
      'Administrator',
      'Teacher',
      'Bursar',
      'Principal',
      'Student',
      'Guardian',
      'Cashier',
      'Hall monitor',
    ]);
  });

  it('badges each card Ready-made or Your own', async () => {
    render([...ROLE_LIST, role('cashier', { label: 'Cashier' })]);
    await screen.findByRole('region', { name: 'Your school’s roles' });
    const grid = within(
      screen.getByRole('region', { name: 'Your school’s roles' })
    );
    expect(grid.getAllByText('Ready-made')).toHaveLength(6);
    expect(grid.getAllByText('Your own')).toHaveLength(1);
    expect(grid.queryByText('Built in')).not.toBeInTheDocument();
  });

  it('counts the things switched on from the plain-language summary', async () => {
    render([
      ...ROLE_LIST,
      role('cashier', {
        label: 'Cashier',
        held: ['student:read', 'team:read'],
      }),
    ]);
    const cashier = await screen.findByRole('button', { name: 'Cashier' });
    expect(
      within(cashier).getByText('2 things switched on')
    ).toBeInTheDocument();
    const teacher = screen.getByRole('button', { name: 'Teacher' });
    expect(
      within(teacher).getByText('1 thing switched on')
    ).toBeInTheDocument();
    const guardian = screen.getByRole('button', { name: 'Guardian' });
    expect(
      within(guardian).getByText('Nothing switched on')
    ).toBeInTheDocument();
  });

  it('shows holder avatars with initials and +n past four', async () => {
    const holders = [
      'Ada Obi',
      'Bola Ade',
      'Chi Eze',
      'Dayo Bello',
      'Efe Okoro',
    ];
    render([
      ...ROLE_LIST,
      role('cashier', {
        label: 'Cashier',
        holders: holders.map((name) => holder(name)),
        holderCount: holders.length,
      }),
    ]);
    const card = within(await screen.findByRole('button', { name: 'Cashier' }));
    expect(card.getByText('AO')).toBeInTheDocument();
    expect(card.getByText('DB')).toBeInTheDocument();
    expect(card.queryByText('EO')).not.toBeInTheDocument();
    expect(card.getByText('+1')).toBeInTheDocument();
  });

  it('shows only the count when the viewer may not see holder names', async () => {
    render([
      ...ROLE_LIST,
      role('cashier', {
        label: 'Cashier',
        holders: undefined,
        holderCount: 2,
      }),
      role('idle', { label: 'Idle', holders: undefined, holderCount: 0 }),
    ]);
    const cashier = within(
      await screen.findByRole('button', { name: 'Cashier' })
    );
    expect(cashier.getByText('2 people')).toBeInTheDocument();
    expect(cashier.queryByText('AO')).not.toBeInTheDocument();
    expect(
      within(screen.getByRole('button', { name: 'Idle' })).getByText(
        'Nobody holds it'
      )
    ).toBeInTheDocument();
  });

  it('lists Owner and Member under the built-in disclosure', async () => {
    render();
    await screen.findByRole('region', { name: 'Your school’s roles' });
    fireEvent.click(
      screen.getByRole('button', {
        name: /Built-in roles \(cannot be edited\)/,
      })
    );
    expect(
      screen.getByText(OWNER_ROLE_ENTRY.description ?? '')
    ).toBeInTheDocument();
    expect(
      screen.getByText(MEMBER_ROLE_ENTRY.description ?? '')
    ).toBeInTheDocument();
    expect(screen.getByText('Everything')).toBeInTheDocument();
    expect(screen.getByText('Nothing')).toBeInTheDocument();
  });

  it('badges Owner and Member as built in and shows who holds them', async () => {
    render([
      role('owner', {
        ...OWNER_ROLE_ENTRY,
        holders: [holder('Ada Obi', ['owner'])],
        holderCount: 1,
      }),
      role('member', {
        ...MEMBER_ROLE_ENTRY,
        holders: undefined,
        holderCount: 4,
      }),
      ...ROLE_LIST.slice(2),
    ]);
    await screen.findByRole('region', { name: 'Your school’s roles' });
    fireEvent.click(
      screen.getByRole('button', {
        name: /Built-in roles \(cannot be edited\)/,
      })
    );
    expect(screen.getAllByText('Built in')).toHaveLength(2);
    expect(screen.getByText('AO')).toBeInTheDocument();
    expect(screen.getByText('4 people')).toBeInTheDocument();
  });

  it('counts holders the viewer may not see in the avatar group', async () => {
    render([
      ...ROLE_LIST,
      role('cashier', {
        label: 'Cashier',
        holders: [holder('Ada Obi')],
        holderCount: 3,
      }),
    ]);
    const card = within(await screen.findByRole('button', { name: 'Cashier' }));
    expect(card.getByText('AO')).toBeInTheDocument();
    expect(card.getByText('+2')).toBeInTheDocument();
  });

  it('explains the kinds of roles in a closed disclosure', async () => {
    render();
    await screen.findByRole('region', { name: 'Your school’s roles' });
    fireEvent.click(screen.getByRole('button', { name: 'Kinds of roles' }));
    expect(screen.getByText(/Ready-made roles/)).toBeInTheDocument();
    expect(screen.getByText(/Your own roles/)).toBeInTheDocument();
  });

  it('shows New role only with ac:create and opens it', async () => {
    const { onNewRole } = render();
    fireEvent.click(await screen.findByRole('button', { name: 'New role' }));
    expect(onNewRole).toHaveBeenCalledOnce();
  });

  it('hides New role from someone who can only look', async () => {
    render(
      ROLE_LIST,
      fakeAccess({ permissions: toPermissionMap(['ac:read']) })
    );
    await screen.findByRole('region', { name: 'Your school’s roles' });
    expect(
      screen.queryByRole('button', { name: 'New role' })
    ).not.toBeInTheDocument();
  });

  it('opens a role when its card is chosen', async () => {
    const { onOpenRole } = render();
    fireEvent.click(await screen.findByRole('button', { name: 'Bursar' }));
    expect(onOpenRole).toHaveBeenCalledWith('bursar');
  });

  it('pages ten cards at a time', async () => {
    const own = Array.from({ length: 6 }, (_, index) =>
      role(`own-${index}`, { label: `Own ${index}` })
    );
    render([...ROLE_LIST, ...own]);
    await screen.findByRole('region', { name: 'Your school’s roles' });
    expect(cards()).toHaveLength(10);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(cards()).toEqual(['Own 4', 'Own 5']);
    fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
    expect(cards()).toHaveLength(10);
  });

  it('shows no pager for ten roles or fewer', async () => {
    render();
    await screen.findByRole('region', { name: 'Your school’s roles' });
    expect(
      screen.queryByRole('navigation', { name: 'Table pages' })
    ).toBeNull();
  });

  it('shows a loading state, then an error when the list fails', async () => {
    const list = vi.fn().mockRejectedValue(new Error('Roles are down'));
    renderWithApi(
      <RolesPage onNewRole={vi.fn()} onOpenRole={vi.fn()} />,
      { roles: { list } },
      ownerAccess()
    );
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
    expect(await screen.findByText('Roles are down')).toBeInTheDocument();
  });
});
