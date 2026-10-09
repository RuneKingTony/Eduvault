import {
  Link,
  Outlet,
  useRouter,
  useRouterState,
} from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronDownIcon } from 'lucide-react';
import { initials } from '@eduvault/shared';
import { UserAvatar, UserMenu, useAuthClient } from '@eduvault/auth-client';
import {
  Button,
  NavIcon,
  PortalBottomNav,
  PortalNav,
  PortalTopbar,
  TooltipProvider,
  cn,
  useIsCompact,
  type PortalNavItem,
  type RenderPortalNavLink,
} from '@eduvault/ui';
import { PORTAL_NAV, isCurrent, visiblePortalNav } from '../nav';

const renderLink: RenderPortalNavLink = ({ item, className, children }) => (
  <Link
    to={item.href}
    className={className}
    aria-current={item.current ? 'page' : undefined}
  >
    {children}
  </Link>
);

function usePortalNavItems(): PortalNavItem[] {
  const router = useRouter();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const built = new Set(Object.keys(router.routesByPath));
  return visiblePortalNav(PORTAL_NAV, built).map((entry) => ({
    id: entry.id,
    label: entry.label,
    href: entry.route,
    icon: <NavIcon name={entry.icon} />,
    current: isCurrent(entry, pathname),
  }));
}

function PortalAccount({ compact }: { compact: boolean }) {
  const authClient = useAuthClient();
  const queryClient = useQueryClient();
  return (
    <UserMenu
      authClient={authClient}
      onSignedOut={() => {
        queryClient.clear();
      }}
      renderTrigger={(user) => (
        <Button
          variant="ghost"
          size="sm"
          className="text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          <UserAvatar name={user.name} image={user.image} className="size-6" />
          {compact ? null : <span>{user.name}</span>}
          <ChevronDownIcon />
          <span className="sr-only">Account menu</span>
        </Button>
      )}
    />
  );
}

function SchoolHeader({ compact }: { compact: boolean }) {
  const authClient = useAuthClient();
  const session = authClient.useSession();
  const schools = authClient.useListOrganizations();
  const activeId = session.data?.session.activeOrganizationId ?? null;
  const name =
    schools.data?.find((school) => school.id === activeId)?.name ?? 'School';
  return (
    <PortalTopbar schoolName={name} schoolInitials={initials(name)}>
      <PortalAccount compact={compact} />
    </PortalTopbar>
  );
}

export function PortalShell() {
  const compact = useIsCompact();
  const items = usePortalNavItems();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  return (
    <TooltipProvider>
      <div className="flex min-h-svh flex-col">
        <SchoolHeader compact={compact} />
        {compact ? null : <PortalNav items={items} renderLink={renderLink} />}
        <main
          className={cn(
            'mx-auto w-full max-w-5xl flex-1 p-4',
            compact ? 'pb-24' : 'sm:p-6'
          )}
        >
          <div key={pathname} className="flex page-reveal flex-col gap-5">
            <Outlet />
          </div>
        </main>
        {compact ? (
          <PortalBottomNav items={items} renderLink={renderLink} />
        ) : null}
      </div>
    </TooltipProvider>
  );
}
