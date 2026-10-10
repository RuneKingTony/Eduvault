import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Outlet,
  useRouteContext,
  useRouter,
  useRouterState,
} from '@tanstack/react-router';
import type { MePermissions } from '@eduvault/api-contract';
import { PermissionsProvider } from '@eduvault/auth-client';
import { canAny, type Gate } from '@eduvault/policy';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  Sidebar,
  SidebarProvider,
  TooltipProvider,
  cn,
  useIsCompact,
} from '@eduvault/ui';
import { useActing, type ActingState } from '../acting-store';
import { useApi } from '../api';
import { mePermissionsQueryOptions } from '../queries';
import {
  EXTRA_PAGE_TITLES,
  NAV_GROUPS,
  SETTINGS_SECTIONS,
  findCurrent,
  settingsTrail,
  visibleNav,
  visibleSettings,
  type NavGroup,
} from '../nav';
import { CommandMenu, type CommandEntry } from './command-menu';
import { MyAccessProvider, useMyAccess } from './my-access';
import { ShellSidebar } from './shell-sidebar';
import { useRailOpen } from './shell-state';
import { ActingBanner } from './acting-banner';
import { ShellTopbar } from './shell-topbar';
import { useCommandShortcut } from './use-command-shortcut';

function commandEntries(groups: readonly NavGroup[]): CommandEntry[] {
  return groups
    .filter((group) => group.label !== null)
    .flatMap((group) =>
      group.items.map((item) => ({
        id: item.id,
        label: item.pageTitle,
        hint: group.label ?? '',
        route: item.route,
        icon: item.icon,
        keywords: [item.label],
      }))
    );
}

/** Cached access may only seed a key it was fetched for, or it would outlive a switch. */
const matchesActing = (access: MePermissions, acting: ActingState | null) =>
  acting === null
    ? access.acting === null
    : access.acting?.organizationId === acting.organizationId &&
      access.acting.writes === (acting.reason !== null);

const ADD_MEMBER_ACTION: CommandEntry = {
  id: 'add-member',
  label: 'Add a staff member',
  hint: 'People',
  route: '/members?add=1',
  icon: 'user-round-plus',
  keywords: ['new', 'hire', 'invite', 'staff', 'member'],
};

const CREATE_ROLE_ACTION: CommandEntry = {
  id: 'create-role',
  label: 'Create a custom role',
  hint: 'Roles',
  route: '/roles/new',
  icon: 'shield-check',
  keywords: ['new', 'role', 'permissions', 'access'],
};

function commandActions(
  builtRoutes: ReadonlySet<string>,
  access: MePermissions
): CommandEntry[] {
  const allowed = (route: string, gate: Gate) =>
    builtRoutes.has(route) && canAny(access.permissions, gate);
  return [
    ...(allowed('/members', ['member:create']) ? [ADD_MEMBER_ACTION] : []),
    ...(allowed('/roles/new', ['ac:create']) ? [CREATE_ROLE_ACTION] : []),
  ];
}

function useAccess(): MePermissions {
  const router = useRouter();
  const api = useApi();
  const { access } = useRouteContext({ from: '__root__' });
  if (access === null) {
    throw new Error('The school shell needs school access');
  }
  const acting = useActing();
  const { data } = useQuery({
    ...mePermissionsQueryOptions(api, acting),
    ...(matchesActing(access, acting)
      ? { initialData: access }
      : { placeholderData: access }),
  });
  const previous = useRef(data);
  useEffect(() => {
    if (previous.current !== data) {
      previous.current = data;
      void router.invalidate();
    }
  }, [data, router]);
  return data ?? access;
}

function settingsEntries(
  builtRoutes: ReadonlySet<string>,
  access: MePermissions
): CommandEntry[] {
  return visibleSettings(
    SETTINGS_SECTIONS,
    builtRoutes,
    access.permissions
  ).map((section) => ({
    id: section.id,
    label: section.label,
    hint: 'Settings',
    route: section.route,
    icon: section.icon,
  }));
}

const titleOf = (current: ReturnType<typeof findCurrent>, pathname: string) =>
  current?.item.pageTitle ?? EXTRA_PAGE_TITLES[pathname] ?? 'Not found';

function crumbs(current: ReturnType<typeof findCurrent>, pathname: string) {
  const trail = settingsTrail(pathname);
  if (trail !== undefined) {
    return { groupLabel: trail.group, pageTitle: trail.title };
  }
  return {
    groupLabel: current?.group.label ?? undefined,
    pageTitle: titleOf(current, pathname),
  };
}

function useShellModel(access: MePermissions) {
  const router = useRouter();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const builtRoutes = new Set(Object.keys(router.routesByPath));
  const groups = visibleNav(NAV_GROUPS, builtRoutes, access.permissions);
  const current = findCurrent(groups, pathname);
  return {
    groups,
    pathname,
    current,
    pages: commandEntries(groups),
    settings: settingsEntries(builtRoutes, access),
    actions: commandActions(builtRoutes, access),
    ...crumbs(current, pathname),
    open: (route: string) => {
      router.history.push(route);
    },
  };
}

export function PhoneNav({
  open,
  onOpenChange,
  description = 'Pages in this school.',
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  description?: string;
  children: ReactNode;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="left"
        className="w-72 bg-sidebar p-0 text-sidebar-foreground [&>button]:hidden"
      >
        <SheetHeader className="sr-only">
          <SheetTitle>Navigation</SheetTitle>
          <SheetDescription>{description}</SheetDescription>
        </SheetHeader>
        <Sidebar collapsible="none" className="w-full">
          {children}
        </Sidebar>
      </SheetContent>
    </Sheet>
  );
}

export function ShellMain({
  compact,
  pathname,
}: {
  compact: boolean;
  pathname: string;
}) {
  return (
    <main
      className={cn(
        'mx-auto w-full max-w-310 flex-1',
        compact ? 'p-4 pb-18' : 'p-6'
      )}
    >
      <div key={pathname} className="flex page-reveal flex-col gap-5">
        <Outlet />
      </div>
    </main>
  );
}

type ShellModel = ReturnType<typeof useShellModel>;

function ShellNavigation({
  model,
  compact,
  railOpen,
  navOpen,
  onNavOpenChange,
  onOpenCommandMenu,
}: {
  model: ShellModel;
  compact: boolean;
  railOpen: boolean;
  navOpen: boolean;
  onNavOpenChange: (open: boolean) => void;
  onOpenCommandMenu: () => void;
}) {
  const { openMyAccess } = useMyAccess();
  const sidebar = (
    <ShellSidebar
      groups={model.groups}
      pathname={model.pathname}
      rail={!compact && !railOpen}
      onNavigate={() => {
        onNavOpenChange(false);
      }}
      onOpenMyAccess={() => {
        onNavOpenChange(false);
        openMyAccess();
      }}
      onOpenCommandMenu={() => {
        onNavOpenChange(false);
        onOpenCommandMenu();
      }}
    />
  );
  return compact ? (
    <PhoneNav open={navOpen} onOpenChange={onNavOpenChange}>
      {sidebar}
    </PhoneNav>
  ) : (
    <Sidebar collapsible="icon">{sidebar}</Sidebar>
  );
}

export function AppShell() {
  const access = useAccess();
  return (
    <PermissionsProvider value={access}>
      <MyAccessProvider>
        <ShellFrame access={access} />
      </MyAccessProvider>
    </PermissionsProvider>
  );
}

function ShellFrame({ access }: { access: MePermissions }) {
  const compact = useIsCompact();
  const [railOpen, setRailOpen] = useRailOpen();
  const [navOpen, setNavOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const model = useShellModel(access);
  const toggleCommand = useCallback(() => {
    setCommandOpen((open) => !open);
  }, []);
  useCommandShortcut(toggleCommand);

  return (
    <TooltipProvider>
      <SidebarProvider
        open={railOpen}
        onOpenChange={(next) => {
          if (!compact) {
            setRailOpen(next);
          }
        }}
      >
        <ShellNavigation
          model={model}
          compact={compact}
          railOpen={railOpen}
          navOpen={navOpen}
          onNavOpenChange={setNavOpen}
          onOpenCommandMenu={() => {
            setCommandOpen(true);
          }}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <ActingBanner />
          <ShellTopbar
            compact={compact}
            groupLabel={model.groupLabel}
            pageTitle={model.pageTitle}
            onOpenNavigation={() => {
              setNavOpen(true);
            }}
            onOpenSearch={() => {
              setCommandOpen(true);
            }}
          />
          <ShellMain compact={compact} pathname={model.pathname} />
        </div>
        <CommandMenu
          open={commandOpen}
          onOpenChange={setCommandOpen}
          pages={model.pages}
          settings={model.settings}
          actions={model.actions}
          onSelect={(route) => {
            setCommandOpen(false);
            model.open(route);
          }}
        />
      </SidebarProvider>
    </TooltipProvider>
  );
}
