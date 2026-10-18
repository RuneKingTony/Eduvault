import {
  Link,
  Outlet,
  useNavigate,
  useRouter,
  useRouterState,
  useSearch,
} from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronDownIcon } from 'lucide-react';
import type { MePermissions, PortalMe } from '@eduvault/api-contract';
import { initials, logoSrc } from '@eduvault/shared';
import { API_URL } from '../env';
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
  type PortalNavLinkProps,
  type RenderPortalNavLink,
} from '@eduvault/ui';
import { PORTAL_NAV, isCurrent, visiblePortalNav } from '../nav';
import { childParam, selectChild } from '../selected-child';
import { ChildSwitcher } from './child-switcher';

function PortalLink({
  item,
  className,
  children,
  child,
}: PortalNavLinkProps & { child: string | undefined }) {
  return (
    <Link
      to={item.href}
      search={child === undefined ? {} : { child }}
      className={className}
      aria-current={item.current ? 'page' : undefined}
    >
      {children}
    </Link>
  );
}

function usePortalNavItems({ me, access }: ShellData): PortalNavItem[] {
  const router = useRouter();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const built = new Set(Object.keys(router.routesByPath));
  return visiblePortalNav(PORTAL_NAV, {
    builtRoutes: built,
    permissions: access.permissions,
    kind: me.kind,
  }).map((entry) => ({
    id: entry.id,
    label: entry.label,
    ...(entry.shortLabel === undefined ? {} : { shortLabel: entry.shortLabel }),
    href: entry.route,
    icon: <NavIcon name={entry.icon} />,
    current: isCurrent(entry, pathname),
  }));
}

function PortalAccount({ compact }: { compact: boolean }) {
  const authClient = useAuthClient();
  const queryClient = useQueryClient();
  const router = useRouter();
  return (
    <UserMenu
      authClient={authClient}
      onSignedOut={() => {
        queryClient.clear();
      }}
      onSchoolChanged={() => {
        queryClient.removeQueries();
        void router
          .navigate({ to: '/', search: { child: undefined } })
          .then(() => router.invalidate());
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

interface ShellData {
  me: PortalMe;
  access: Pick<MePermissions, 'permissions'>;
}

function useChildSwitcher(me: PortalMe) {
  const navigate = useNavigate();
  const search = useSearch({ strict: false });
  const selected = selectChild(me.children, childParam(search.child));
  const switcher =
    me.kind === 'guardian' && me.children.length > 0 ? (
      <ChildSwitcher
        linked={me.children}
        selectedId={selected?.id}
        onSelect={(child) => {
          void navigate({
            to: '.',
            search: (previous) => ({ ...previous, child, term: undefined }),
          });
        }}
      />
    ) : null;
  return {
    switcher,
    childId: me.kind === 'guardian' ? selected?.id : undefined,
  };
}

export function PortalShell({ me, access }: ShellData) {
  const compact = useIsCompact();
  const items = usePortalNavItems({ me, access });
  const { switcher, childId } = useChildSwitcher(me);
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const renderLink: RenderPortalNavLink = (link) => (
    <PortalLink {...link} child={childId} />
  );
  return (
    <TooltipProvider>
      <div className="flex min-h-svh flex-col">
        <PortalTopbar
          schoolName={me.school.name}
          schoolInitials={initials(me.school.name)}
          logoUrl={logoSrc(API_URL, me.school.logoUrl)}
        >
          <div className="flex min-w-0 items-center gap-3">
            {compact ? null : switcher}
            <PortalAccount compact={compact} />
          </div>
        </PortalTopbar>
        {compact ? null : <PortalNav items={items} renderLink={renderLink} />}
        <main
          className={cn(
            'mx-auto w-full max-w-5xl flex-1 p-4',
            compact ? 'pb-24' : 'sm:p-6'
          )}
        >
          <div key={pathname} className="flex page-reveal flex-col gap-5">
            {compact && pathname !== '/children' ? switcher : null}
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
