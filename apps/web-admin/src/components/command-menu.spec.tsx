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

function setup() {
  const onSelect = vi.fn();
  const onOpenChange = vi.fn();
  render(
    <CommandMenu
      open
      onOpenChange={onOpenChange}
      pages={pages}
      settings={settings}
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
