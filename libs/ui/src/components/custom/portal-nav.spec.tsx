import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import { PortalBottomNav } from './portal-bottom-nav';
import {
  PortalNav,
  type PortalNavItem,
  type PortalNavLinkProps,
} from './portal-nav';
import { PortalTopbar } from './portal-topbar';

const items: PortalNavItem[] = [
  {
    id: 'home',
    href: '/',
    label: 'Home',
    icon: <svg data-testid="home-icon" />,
    current: true,
  },
  {
    id: 'children',
    href: '/children',
    label: 'My children',
    shortLabel: 'Children',
    icon: <svg data-testid="children-icon" />,
    current: false,
  },
  {
    id: 'fees',
    href: '/fees',
    label: 'Fees',
    icon: <svg data-testid="fees-icon" />,
    current: false,
  },
];

const renderLink = ({
  item,
  className,
  children,
}: PortalNavLinkProps): ReactNode => (
  <a
    href={item.href}
    className={className}
    aria-current={item.current ? 'page' : undefined}
  >
    {children}
  </a>
);

describe('PortalNav', () => {
  it('lists every item and marks the current one', () => {
    render(<PortalNav items={items} renderLink={renderLink} />);
    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute(
      'aria-current',
      'page'
    );
    expect(screen.getByRole('link', { name: 'Fees' })).not.toHaveAttribute(
      'aria-current'
    );
  });

  it('keeps the full label even when an item has a short one', () => {
    render(<PortalNav items={items} renderLink={renderLink} />);
    expect(
      screen.getByRole('link', { name: 'My children' })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Children' })
    ).not.toBeInTheDocument();
  });
});

describe('PortalBottomNav', () => {
  it('is fixed to the bottom and lists every item', () => {
    render(<PortalBottomNav items={items} renderLink={renderLink} />);
    expect(screen.getByRole('navigation', { name: 'Portal' })).toHaveClass(
      'fixed',
      'bottom-0'
    );
    expect(screen.getAllByRole('link')).toHaveLength(3);
    expect(screen.getByTestId('fees-icon')).toBeInTheDocument();
  });

  it('shows an item’s short label in place of its label', () => {
    render(<PortalBottomNav items={items} renderLink={renderLink} />);
    expect(screen.getByRole('link', { name: 'Children' })).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'My children' })
    ).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Home' })).toBeInTheDocument();
  });
});

describe('PortalTopbar', () => {
  it('shows the school name and its menu', () => {
    render(
      <PortalTopbar schoolName="Greenfield College" schoolInitials="GC">
        <button type="button">Account</button>
      </PortalTopbar>
    );
    expect(screen.getByText('Greenfield College')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Account' })).toBeInTheDocument();
  });
});
