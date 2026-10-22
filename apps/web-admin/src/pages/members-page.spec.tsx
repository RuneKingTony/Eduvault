import { screen, within } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { actingAccess, renderWithApi, starterAccess } from '../test-utils';
import {
  CATALOGUE,
  EMEKA_ID,
  FUNMI_ID,
  IKEJA,
  KEMI_ID,
  LEKKI,
  TUNDE_ID,
  signedIn,
  summary,
} from '../test-members';
import { MembersPage } from './members-page';

const items = [
  summary({ id: FUNMI_ID, name: 'Funmi Adeyemi', roles: ['member', 'owner'] }),
  summary({
    id: TUNDE_ID,
    name: 'Tunde Bakare',
    title: 'Teacher',
    roles: ['member', 'teacher', 'front-desk'],
    campusIds: [LEKKI.id, IKEJA.id],
  }),
  summary({ id: KEMI_ID, name: 'Kemi Lawson', roles: ['member'] }),
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
    me: { get: vi.fn().mockResolvedValue(signedIn()) },
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

const typeInto = async (user: UserEvent, field: HTMLElement, value: string) => {
  await user.clear(field);
  await user.type(field, value);
};

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

  it('marks a member on leave today with an On leave badge', async () => {
    setup({}, undefined, [
      summary({ id: FUNMI_ID, name: 'Funmi Adeyemi' }),
      summary({ id: EMEKA_ID, name: 'Emeka Obi', onLeave: true }),
    ]);
    const away = await screen.findByRole('row', { name: /Emeka Obi/ });
    expect(within(away).getByText('On leave')).toBeVisible();
    const present = screen.getByRole('row', { name: /Funmi Adeyemi/ });
    expect(within(present).queryByText('On leave')).toBeNull();
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
    const user = userEvent.setup();
    const { onSearchChange } = setup({ search: { page: 3 } });
    await typeInto(user, await screen.findByLabelText('Search'), 'tunde');
    expect(onSearchChange).toHaveBeenCalledWith({
      page: undefined,
      q: 'tunde',
    });
  });

  it('opens a member from the row', async () => {
    const user = userEvent.setup();
    const { onOpenMember } = setup();
    await user.click(await screen.findByText('Tunde Bakare'));
    expect(onOpenMember).toHaveBeenCalledWith(TUNDE_ID);
  });

  it('says so when no one matches', async () => {
    setup({}, undefined, []);
    expect(await screen.findByText('No one matches')).toBeInTheDocument();
  });

  it('offers Add member with member:create and opens the sheet through the search', async () => {
    const user = userEvent.setup();
    const { onSearchChange } = setup();
    await user.click(await screen.findByRole('button', { name: 'Add member' }));
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
