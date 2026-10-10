import { fireEvent, render, screen } from '@testing-library/react';
import { CommandMenu, type CommandEntry } from './command-menu';

const pages: CommandEntry[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    hint: 'Overview',
    route: '/',
    icon: 'layout-dashboard',
  },
  {
    id: 'students',
    label: 'Students',
    hint: 'People',
    route: '/students',
    icon: 'graduation-cap',
  },
  {
    id: 'fees',
    label: 'Who owes',
    hint: 'Finance',
    route: '/fees',
    icon: 'wallet',
    keywords: ['Fees'],
  },
];
const settings: CommandEntry[] = [
  {
    id: 'campuses',
    label: 'Campuses',
    hint: 'Settings',
    route: '/campuses',
    icon: 'settings',
  },
];

const actions: CommandEntry[] = [
  {
    id: 'add-member',
    label: 'Add a staff member',
    hint: 'People',
    route: '/members?add=1',
    icon: 'user-round-plus',
    keywords: ['new', 'hire'],
  },
  {
    id: 'create-role',
    label: 'Create a custom role',
    hint: 'Roles',
    route: '/roles/new',
    icon: 'shield-check',
    keywords: ['permissions', 'access'],
  },
];

function setup(withActions = false) {
  const onSelect = vi.fn();
  const onOpenChange = vi.fn();
  render(
    <CommandMenu
      open
      onOpenChange={onOpenChange}
      pages={pages}
      settings={settings}
      actions={withActions ? actions : undefined}
      onSelect={onSelect}
    />
  );
  const input = screen.getByPlaceholderText('Search pages and actions…');
  return {
    input,
    onSelect,
    onOpenChange,
    type: (value: string) => fireEvent.change(input, { target: { value } }),
  };
}

const groupHeadings = () =>
  [
    ...document.querySelectorAll(
      '[cmdk-group]:not([hidden]) [cmdk-group-heading]'
    ),
  ].map((node) => node.textContent);

describe('CommandMenu', () => {
  it('lists Pages then Settings and hides the empty Actions group', () => {
    setup();
    expect(groupHeadings()).toEqual(['Pages', 'Settings']);
  });

  it('lists an Actions group last and opens the action’s route', () => {
    const { onSelect } = setup(true);
    expect(groupHeadings()).toEqual(['Pages', 'Settings', 'Actions']);
    fireEvent.click(screen.getByRole('option', { name: /Add a staff member/ }));
    expect(onSelect).toHaveBeenCalledWith('/members?add=1');
  });

  it('opens Create a custom role at /roles/new', () => {
    const { onSelect } = setup(true);
    fireEvent.click(
      screen.getByRole('option', { name: /Create a custom role/ })
    );
    expect(onSelect).toHaveBeenCalledWith('/roles/new');
  });

  it('finds an action by a keyword', () => {
    const { type } = setup(true);
    type('hire');
    expect(
      screen.getByRole('option', { name: /Add a staff member/ })
    ).toBeInTheDocument();
    expect(groupHeadings()).toEqual(['Actions']);
  });

  it('finds a page by its nav label', () => {
    const { type } = setup();
    type('fees');
    expect(
      screen.getByRole('option', { name: /Who owes/ })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('option', { name: /Students/ })
    ).not.toBeInTheDocument();
    expect(groupHeadings()).toEqual(['Pages']);
  });

  it('finds a settings section and hides the Pages group', () => {
    const { type } = setup();
    type('campuses');
    expect(
      screen.getByRole('option', { name: /Campuses/ })
    ).toBeInTheDocument();
    expect(groupHeadings()).toEqual(['Settings']);
  });

  it('needs every word to appear in the label, hint or group', () => {
    const { type } = setup();
    type('finance owes');
    expect(
      screen.getByRole('option', { name: /Who owes/ })
    ).toBeInTheDocument();
    type('finance students');
    expect(screen.getByText('No results.')).toBeInTheDocument();
  });

  it('says so when nothing matches', () => {
    const { type } = setup();
    type('zzzz');
    expect(screen.getByText('No results.')).toBeInTheDocument();
  });

  it('selects the first match and wraps the selection', () => {
    const { input } = setup();
    expect(screen.getAllByRole('option')[0]).toHaveAttribute(
      'aria-selected',
      'true'
    );
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(screen.getAllByRole('option').at(-1)).toHaveAttribute(
      'aria-selected',
      'true'
    );
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(screen.getAllByRole('option')[0]).toHaveAttribute(
      'aria-selected',
      'true'
    );
  });

  it('opens the chosen page', () => {
    const { onSelect } = setup();
    fireEvent.click(screen.getByRole('option', { name: /Students/ }));
    expect(onSelect).toHaveBeenCalledWith('/students');
  });

  it('closes on Escape', () => {
    const { input, onOpenChange } = setup();
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('shows the key hints', () => {
    setup();
    expect(screen.getByText('Esc')).toBeInTheDocument();
  });
});
