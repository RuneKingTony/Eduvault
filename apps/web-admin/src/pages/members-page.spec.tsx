import { fireEvent, screen } from '@testing-library/react';
import { actingAccess, renderWithApi, starterAccess } from '../test-utils';
import { CATALOGUE, IKEJA, LEKKI, summary } from '../test-members';
import { MembersPage } from './members-page';

const items = [
  summary({ id: 'm1', name: 'Funmi Adeyemi', roles: ['member', 'owner'] }),
  summary({
    id: 'm2',
    name: 'Tunde Bakare',
    title: 'Teacher',
    roles: ['member', 'teacher', 'front-desk'],
    campusIds: [LEKKI.id, IKEJA.id],
  }),
  summary({ id: 'm3', name: 'Kemi Lawson', roles: ['member'] }),
];

function setup(
  props: Partial<Parameters<typeof MembersPage>[0]> = {},
  access?: Parameters<typeof renderWithApi>[2],
  list = items
) {
  const members = {
    list: vi.fn().mockResolvedValue({ items: list, total: list.length }),
    roles: vi.fn().mockResolvedValue(CATALOGUE),
  };
  const api = {
    members,
    campuses: { list: vi.fn().mockResolvedValue([LEKKI, IKEJA]) },
    me: { get: vi.fn().mockResolvedValue({ activeCampusId: null }) },
  };
  const handlers = {
    onSearchChange: vi.fn(),
    onOpenMember: vi.fn(),
    onMemberAdded: vi.fn(),
    onOpenCampuses: vi.fn(),
  };
  renderWithApi(
    <MembersPage
      search={{}}
      schoolName="Greenfield College"
      {...handlers}
      {...props}
    />,
    api,
    access
  );
  return { members, ...handlers };
}

describe('MembersPage', () => {
  it('shows the staff count, role badges, No roles and campus names', async () => {
    setup();
    expect(await screen.findByText('Funmi Adeyemi')).toBeInTheDocument();
    expect(
      await screen.findByText('3 people in Greenfield College')
    ).toBeInTheDocument();
    expect(screen.getByText('Owner')).toBeInTheDocument();
    expect(
      screen.getByText('Teacher', { selector: 'span[data-slot="badge"]' })
    ).toBeInTheDocument();
    expect(screen.getByText('Front desk')).toBeInTheDocument();
    expect(screen.getByText('No roles')).toBeInTheDocument();
    expect(screen.getByText('Lekki, Ikeja')).toBeInTheDocument();
    expect(screen.getByText('Showing 1 to 3 of 3')).toBeInTheDocument();
  });

  it('passes search, role and page through to the list request', async () => {
    const { members } = setup({
      search: { q: 'ada', role: 'teacher', page: 2 },
    });
    await screen.findByText('Funmi Adeyemi');
    expect(members.list).toHaveBeenCalledWith({
      query: { q: 'ada', role: 'teacher', page: 2 },
    });
  });

  it('reports typing in the search box and resets to the first page', async () => {
    const { onSearchChange } = setup({ search: { page: 3 } });
    fireEvent.change(await screen.findByLabelText('Search'), {
      target: { value: 'tunde' },
    });
    expect(onSearchChange).toHaveBeenCalledWith({
      page: undefined,
      q: 'tunde',
    });
  });

  it('opens a member from the row', async () => {
    const { onOpenMember } = setup();
    fireEvent.click(await screen.findByText('Tunde Bakare'));
    expect(onOpenMember).toHaveBeenCalledWith('m2');
  });

  it('says so when no one matches', async () => {
    setup({}, undefined, []);
    expect(await screen.findByText('No one matches')).toBeInTheDocument();
  });

  it('offers Add member with member:create and opens the sheet through the search', async () => {
    const { onSearchChange } = setup();
    fireEvent.click(await screen.findByRole('button', { name: 'Add member' }));
    expect(onSearchChange).toHaveBeenCalledWith({ add: 1 });
  });

  it('hides Add member without member:create', async () => {
    setup({}, starterAccess('administrator'));
    await screen.findByText('Funmi Adeyemi');
    expect(
      screen.queryByRole('button', { name: 'Add member' })
    ).not.toBeInTheDocument();
  });

  it('lists members to a super admin acting read-only, with no Add member', async () => {
    setup({}, actingAccess(false));
    expect(await screen.findByText('Funmi Adeyemi')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Add member' })
    ).not.toBeInTheDocument();
  });

  it('offers Add member once a super admin acting has given a reason', async () => {
    setup({}, actingAccess(true));
    expect(
      await screen.findByRole('button', { name: 'Add member' })
    ).toBeInTheDocument();
  });
});
