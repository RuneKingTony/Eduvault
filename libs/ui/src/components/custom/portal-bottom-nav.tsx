import { cn } from '../../lib/utils';
import type { PortalNavProps } from './portal-nav';

export function PortalBottomNav({ items, renderLink }: PortalNavProps) {
  return (
    <nav
      aria-label="Portal"
      className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-md"
    >
      <ul className="flex items-stretch justify-around">
        {items.map((item) => (
          <li key={item.id} className="flex-1">
            {renderLink({
              item,
              className: cn(
                'flex flex-col items-center gap-0.5 p-2 text-xs font-medium text-muted-foreground [&>svg]:size-5',
                item.current && 'text-primary-ink'
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
