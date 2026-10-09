import { useCallback, useState, type ReactNode } from 'react';
import { Outlet, useRouter, useRouterState } from '@tanstack/react-router';
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
import {
  EXTRA_PAGE_TITLES,
  NAV_GROUPS,
  SETTINGS_SECTIONS,
  findCurrent,
  visibleNav,
  visibleSettings,
  type NavGroup,
} from '../nav';
import { CommandMenu, type CommandEntry } from './command-menu';
import { ShellSidebar } from './shell-sidebar';
import { useRailOpen } from './shell-state';
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

function useShellModel() {
  const router = useRouter();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const builtRoutes = new Set(Object.keys(router.routesByPath));
  const groups = visibleNav(NAV_GROUPS, builtRoutes);
  const current = findCurrent(groups, pathname);
  const settings: CommandEntry[] = visibleSettings(
    SETTINGS_SECTIONS,
    builtRoutes
  ).map((section) => ({
    id: section.id,
    label: section.label,
    hint: 'Settings',
    route: section.route,
    icon: 'settings',
  }));
  return {
    groups,
    pathname,
    current,
    pages: commandEntries(groups),
    settings,
    pageTitle:
      current?.item.pageTitle ?? EXTRA_PAGE_TITLES[pathname] ?? 'Not found',
    open: (route: string) => {
      router.history.push(route);
    },
  };
}

function PhoneNav({
  open,
  onOpenChange,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
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
          <SheetDescription>Pages in this school.</SheetDescription>
        </SheetHeader>
        <Sidebar collapsible="none" className="w-full">
          {children}
        </Sidebar>
      </SheetContent>
    </Sheet>
  );
}

function ShellMain({
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
  const sidebar = (
    <ShellSidebar
      groups={model.groups}
      pathname={model.pathname}
      rail={!compact && !railOpen}
      onNavigate={() => {
        onNavOpenChange(false);
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
  const compact = useIsCompact();
  const [railOpen, setRailOpen] = useRailOpen();
  const [navOpen, setNavOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const model = useShellModel();
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
          <ShellTopbar
            compact={compact}
            groupLabel={model.current?.group.label ?? undefined}
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
          onSelect={(route) => {
            setCommandOpen(false);
            model.open(route);
          }}
        />
      </SidebarProvider>
    </TooltipProvider>
  );
}
