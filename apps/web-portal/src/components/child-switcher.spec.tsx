import { fireEvent, render, screen, within } from '@testing-library/react';
import type { PortalChild } from '@eduvault/api-contract';
import { ChildSwitcher } from './child-switcher';

const child = (id: string, firstName: string): PortalChild => ({
  id,
  firstName,
  lastName: 'Okeke',
  className: 'JSS 1 Gold',
  campusName: 'Lekki',
  archived: false,
});

const children = [child('a', 'Ada'), child('t', 'Tobi')];

describe('ChildSwitcher', () => {
  it('is a group labelled Viewing child with a chip per child', () => {
    render(
      <ChildSwitcher linked={children} selectedId="a" onSelect={vi.fn()} />
    );
    const group = screen.getByRole('group', { name: 'Viewing child' });
    expect(within(group).getAllByRole('button')).toHaveLength(2);
    expect(
      within(group).getByRole('button', { name: 'Ada' })
    ).toBeInTheDocument();
  });

  it('presses the selected chip only', () => {
    render(
      <ChildSwitcher linked={children} selectedId="t" onSelect={vi.fn()} />
    );
    expect(screen.getByRole('button', { name: 'Tobi' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.getByRole('button', { name: 'Ada' })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
  });

  it('reports the chosen child', () => {
    const onSelect = vi.fn();
    render(
      <ChildSwitcher linked={children} selectedId="a" onSelect={onSelect} />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Tobi' }));
    expect(onSelect).toHaveBeenCalledWith('t');
  });
});
