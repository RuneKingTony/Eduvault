import { fireEvent, render, screen } from '@testing-library/react';
import { CommandMenu, type CommandEntry } from './command-menu';

const pages: CommandEntry[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    hint: 'Overview',
    target: { to: '/' },
    icon: 'layout-dashboard',
  },
  {
    id: 'students',
    label: 'Students',
    hint: 'People',
    target: { to: '/students' },
    icon: 'graduation-cap',
  },
  {
    id: 'fees',
    label: 'Who owes',
    hint: 'Finance',
    target: { to: '/finance/school-fees' },
    icon: 'wallet',
    keywords: ['Fees'],
  },
];
const settings: CommandEntry[] = [
  {
    id: 'campuses',
    label: 'Campuses',
    hint: 'Settings',
    target: { to: '/campuses' },
    icon: 'settings',
  },
];

const actions: CommandEntry[] = [
  {
    id: 'add-member',
    label: 'Add a staff member',
    hint: 'People',
    target: { to: '/members', search: { add: 1 } },
    icon: 'user-round-plus',
    keywords: ['new', 'hire'],
  },
  {
    id: 'record-payment',
    label: 'Record a payment',
    hint: 'Finance',
    target: { to: '/finance/payments', search: { record: 1 } },
    icon: 'banknote',
    keywords: ['receipt', 'cash', 'transfer', 'pos', 'paid', 'fees'],
  },
  {
    id: 'discount-or-refund',
    label: 'Discount or refund',
    hint: 'Finance',
    target: { to: '/finance/adjustments', search: { new: 1 } },
    icon: 'wallet',
    keywords: ['refund', 'discount', 'scholarship', 'reduce', 'write off'],
  },
  {
    id: 'who-owes',
    label: 'See who owes fees',
    hint: 'Fees',
    target: { to: '/finance/accounts' },
    icon: 'wallet',
    keywords: ['balance', 'debt', 'owing', 'statement', 'arrears'],
  },
  {
    id: 'create-role',
    label: 'Create a custom role',
    hint: 'Roles',
    target: { to: '/roles/new' },
    icon: 'shield-check',
    keywords: ['permissions', 'access'],
  },
];

const targetOf = (entries: readonly CommandEntry[], id: string) => {
  const entry = entries.find((candidate) => candidate.id === id);
  if (entry === undefined) {
    throw new Error(`No fixture entry ${id}`);
  }
  return entry.target;
};

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

const groupHeadings = () => {
  const groups = screen.queryAllByRole('group', { name: /.+/ });
  const shown = ['Pages', 'Settings', 'Actions']
    .map((name) => ({
      name,
      index: groups.indexOf(screen.queryByRole('group', { name }) as never),
    }))
    .filter(({ index }) => index !== -1)
    .toSorted((a, b) => a.index - b.index)
    .map(({ name }) => name);
  expect(groups).toHaveLength(shown.length);
  return shown;
};

describe('CommandMenu', () => {
  it('lists Pages then Settings and hides the empty Actions group', () => {
    setup();
    expect(groupHeadings()).toEqual(['Pages', 'Settings']);
  });

  it('lists an Actions group last and opens the action’s target', () => {
    const { onSelect } = setup(true);
    expect(groupHeadings()).toEqual(['Pages', 'Settings', 'Actions']);
    fireEvent.click(screen.getByRole('option', { name: /Add a staff member/ }));
    expect(onSelect).toHaveBeenCalledWith(targetOf(actions, 'add-member'));
  });

  it('opens Create a custom role at /roles/new', () => {
    const { onSelect } = setup(true);
    fireEvent.click(
      screen.getByRole('option', { name: /Create a custom role/ })
    );
    expect(onSelect).toHaveBeenCalledWith(targetOf(actions, 'create-role'));
  });

  it('opens Record a payment on the Payments page with the sheet open', () => {
    const { onSelect } = setup(true);
    fireEvent.click(screen.getByRole('option', { name: /Record a payment/ }));
    expect(onSelect).toHaveBeenCalledWith(targetOf(actions, 'record-payment'));
  });

  it('opens Discount or refund on its page with the request sheet open', () => {
    const { onSelect } = setup(true);
    fireEvent.click(screen.getByRole('option', { name: /Discount or refund/ }));
    expect(onSelect).toHaveBeenCalledWith(
      targetOf(actions, 'discount-or-refund')
    );
  });

  it('finds Discount or refund by a keyword', () => {
    const { type } = setup(true);
    type('scholarship');
    expect(groupHeadings()).toEqual(['Actions']);
    expect(
      screen.getByRole('option', { name: /Discount or refund/ })
    ).toBeInTheDocument();
  });

  it('opens See who owes fees on Who owes, and finds it by a keyword', () => {
    const { type, onSelect } = setup(true);
    type('arrears');
    expect(groupHeadings()).toEqual(['Actions']);
    fireEvent.click(screen.getByRole('option', { name: /See who owes fees/ }));
    expect(onSelect).toHaveBeenCalledWith(targetOf(actions, 'who-owes'));
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
    expect(onSelect).toHaveBeenCalledWith(targetOf(pages, 'students'));
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
