import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SchoolSwitcher } from './school-switcher';
import { fakeClient, openMenu, renderInSidebar } from './menu-test-utils';

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
      renderCrest={(name) => <span data-testid="crest">{name}</span>}
      onSwitched={onSwitched}
      {...extra}
    />
  );
  return { setActive, onSwitched };
}

describe('SchoolSwitcher', () => {
  it('shows the active school in the head', () => {
    setup();
    expect(
      screen.getByRole('button', { name: /Greenfield College/ })
    ).toBeInTheDocument();
    expect(screen.getByTestId('crest')).toHaveTextContent('Greenfield College');
  });

  it('shows a subtitle under the school name when given one', () => {
    setup('o1', { subtitle: 'Second term · 2026/2027' });
    expect(
      screen.getByRole('button', { name: /Second term · 2026\/2027/ })
    ).toBeInTheDocument();
  });

  it('shows no subtitle by default', () => {
    setup();
    expect(screen.queryByText(/term/)).not.toBeInTheDocument();
  });

  it('adds extra items under the school list', () => {
    setup('o1', { menuExtra: <button type="button">Extra thing</button> });
    openMenu(/Greenfield College/);
    expect(
      screen.getByRole('button', { name: 'Extra thing' })
    ).toBeInTheDocument();
    expect(screen.getByRole('separator')).toBeInTheDocument();
  });

  it('adds no separator without extra items', () => {
    setup();
    openMenu(/Greenfield College/);
    expect(screen.queryByRole('separator')).not.toBeInTheDocument();
  });

  it('lists the schools the person belongs to', () => {
    setup();
    openMenu(/Greenfield College/);
    expect(
      screen.getByRole('menuitem', { name: /Lekki Prep/ })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('menuitem', { name: /Greenfield College/ })
    ).toBeInTheDocument();
  });

  it('switches school, then lets the app refetch and go home', async () => {
    const { setActive, onSwitched } = setup();
    openMenu(/Greenfield College/);
    fireEvent.click(screen.getByRole('menuitem', { name: /Lekki Prep/ }));
    await waitFor(() => {
      expect(onSwitched).toHaveBeenCalledOnce();
    });
    expect(setActive).toHaveBeenCalledWith({ organizationId: 'o2' });
  });

  it('stays put when the switch fails', async () => {
    const { setActive, onSwitched } = setup();
    setActive.mockResolvedValue({ data: null, error: { message: 'No' } });
    openMenu(/Greenfield College/);
    fireEvent.click(screen.getByRole('menuitem', { name: /Lekki Prep/ }));
    await waitFor(() => {
      expect(setActive).toHaveBeenCalledOnce();
    });
    expect(onSwitched).not.toHaveBeenCalled();
  });

  it('does nothing when the active school is chosen again', () => {
    const { setActive, onSwitched } = setup();
    openMenu(/Greenfield College/);
    fireEvent.click(
      screen.getByRole('menuitem', { name: /Greenfield College/ })
    );
    expect(setActive).not.toHaveBeenCalled();
    expect(onSwitched).not.toHaveBeenCalled();
  });

  it('renders a plain button outside the sidebar', () => {
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
    openMenu(/Greenfield College/);
    expect(
      screen.getByRole('menuitem', { name: /Lekki Prep/ })
    ).toBeInTheDocument();
  });
});
