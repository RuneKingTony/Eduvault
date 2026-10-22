import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SchoolSwitcher } from './school-switcher';
import { fakeClient, renderInSidebar } from './menu-test-utils';

const schools = [
  { id: 'o1', name: 'Greenfield College' },
  { id: 'o2', name: 'Lekki Prep' },
];

function setup(
  activeOrganizationId: string | null = 'o1',
  extra: Partial<Parameters<typeof SchoolSwitcher>[0]> = {}
) {
  const setActive = vi.fn().mockResolvedValue({ data: {}, error: null });
  const onSwitched = vi.fn();
  const authClient = fakeClient({
    useSession: () => ({ data: { session: { activeOrganizationId } } }),
    useListOrganizations: () => ({ data: schools }),
    organization: { setActive },
  });
  renderInSidebar(
    <SchoolSwitcher
      authClient={authClient}
      renderCrest={(name) => <span>Crest of {name}</span>}
      onSwitched={onSwitched}
      {...extra}
    />
  );
  return { setActive, onSwitched };
}

let user: ReturnType<typeof userEvent.setup>;

beforeEach(() => {
  user = userEvent.setup();
});

const openMenu = () =>
  user.click(screen.getByRole('button', { name: /Greenfield College/ }));

describe('SchoolSwitcher', () => {
  it('shows the active school in the head', () => {
    setup();
    expect(
      screen.getByRole('button', { name: /Greenfield College/ })
    ).toBeInTheDocument();
    expect(screen.getByText('Crest of Greenfield College')).toBeInTheDocument();
  });

  it('shows a subtitle under the school name when given one', () => {
    setup('o1', { subtitle: 'Second term · 2026/2027' });
    expect(
      screen.getByRole('button', { name: /Second term · 2026\/2027/ })
    ).toBeInTheDocument();
  });

  it('shows only the school name by default', () => {
    setup('o1', { renderCrest: undefined });
    expect(screen.getByRole('button')).toHaveTextContent(
      /^Greenfield College$/
    );
  });

  it('adds extra items under the school list', async () => {
    setup('o1', { menuExtra: <button type="button">Extra thing</button> });
    await openMenu();
    expect(
      screen.getByRole('button', { name: 'Extra thing' })
    ).toBeInTheDocument();
    expect(screen.getByRole('separator')).toBeInTheDocument();
  });

  it('adds no separator without extra items', async () => {
    setup();
    await openMenu();
    expect(screen.queryByRole('separator')).not.toBeInTheDocument();
  });

  it('lists the schools the person belongs to', async () => {
    setup();
    await openMenu();
    expect(
      screen.getByRole('menuitem', { name: /Lekki Prep/ })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('menuitem', { name: /Greenfield College/ })
    ).toBeInTheDocument();
  });

  it('switches school, then lets the app refetch and go home', async () => {
    const { setActive, onSwitched } = setup();
    await openMenu();
    await user.click(screen.getByRole('menuitem', { name: /Lekki Prep/ }));
    await waitFor(() => {
      expect(onSwitched).toHaveBeenCalledOnce();
    });
    expect(setActive).toHaveBeenCalledWith({ organizationId: 'o2' });
  });

  it('stays put when the switch fails', async () => {
    const { setActive, onSwitched } = setup();
    setActive.mockResolvedValue({ data: null, error: { message: 'No' } });
    await openMenu();
    await user.click(screen.getByRole('menuitem', { name: /Lekki Prep/ }));
    await waitFor(() => {
      expect(setActive).toHaveBeenCalledOnce();
    });
    expect(onSwitched).not.toHaveBeenCalled();
  });

  it('does nothing when the active school is chosen again', async () => {
    const { setActive, onSwitched } = setup();
    await openMenu();
    await user.click(
      screen.getByRole('menuitem', { name: /Greenfield College/ })
    );
    expect(setActive).not.toHaveBeenCalled();
    expect(onSwitched).not.toHaveBeenCalled();
  });

  it('renders a plain button outside the sidebar', async () => {
    const authClient = fakeClient({
      useSession: () => ({ data: { session: { activeOrganizationId: 'o1' } } }),
      useListOrganizations: () => ({ data: schools }),
      organization: { setActive: vi.fn() },
    });
    render(
      <SchoolSwitcher
        authClient={authClient}
        appearance="button"
        onSwitched={vi.fn()}
      />
    );
    await openMenu();
    expect(
      screen.getByRole('menuitem', { name: /Lekki Prep/ })
    ).toBeInTheDocument();
  });
});
