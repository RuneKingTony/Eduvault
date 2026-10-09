import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';

export interface PortalNavItem {
  id: string;
  label: string;
  href: string;
  icon: ReactNode;
  current: boolean;
}

export interface PortalNavLinkProps {
  item: PortalNavItem;
  className: string;
  children: ReactNode;
}

/** The app owns routing, so it renders the link element. */
export type RenderPortalNavLink = (link: PortalNavLinkProps) => ReactNode;

export interface PortalNavProps {
  items: readonly PortalNavItem[];
  renderLink: RenderPortalNavLink;
}

export function PortalNav({ items, renderLink }: PortalNavProps) {
  return (
    <nav aria-label="Portal" className="border-b bg-card">
      <ul className="mx-auto flex max-w-5xl items-center justify-center gap-1 px-4 py-1.5">
        {items.map((item) => (
          <li key={item.id}>
            {renderLink({
              item,
              className: cn(
                'flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground [&>svg]:size-4',
                item.current &&
                  'bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground'
              ),
              children: (
                <>
                  {item.icon}
                  {item.label}
                </>
              ),
            })}
          </li>
        ))}
      </ul>
    </nav>
  );
}
