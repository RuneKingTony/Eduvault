import { useState } from 'react';
import { useRouterState } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import {
  SignOutButton,
  UserAvatar,
  useAuthClient,
} from '@eduvault/auth-client';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarProvider,
  TooltipProvider,
  useIsCompact,
} from '@eduvault/ui';
import { PLATFORM_NAV_GROUPS, findCurrent } from '../nav';
import { PhoneNav, ShellMain } from './app-shell';
import { SidebarNav } from './sidebar-nav';
import { useRailOpen } from './shell-state';
import { ShellTopbar } from './shell-topbar';

function PlatformHead() {
  return (
    <SidebarHeader className="gap-0 p-2 pb-0">
      <div className="flex flex-col px-2 py-1 leading-tight group-data-[collapsible=icon]:hidden">
        <span className="font-semibold">Eduvault platform</span>
        <span className="text-xs text-muted-foreground">
          Super admin console
        </span>
      </div>
      <div className="mt-2 gold-rule" />
    </SidebarHeader>
  );
}

function PlatformFoot() {
  const authClient = useAuthClient();
  const queryClient = useQueryClient();
  const user = authClient.useSession().data?.user;
  return (
    <SidebarFooter className="gap-2">
      <div className="flex items-center gap-2 px-2 group-data-[collapsible=icon]:hidden">
        <UserAvatar name={user?.name ?? ''} image={user?.image ?? null} />
        <span className="flex min-w-0 flex-col leading-tight">
          <span className="truncate text-sm font-medium">{user?.name}</span>
          <span className="truncate text-xs text-muted-foreground">
            {user?.email}
          </span>
        </span>
      </div>
      <SignOutButton
        authClient={authClient}
        onSignedOut={() => {
          queryClient.clear();
        }}
      />
    </SidebarFooter>
  );
}

function PlatformSidebar({
  pathname,
  rail,
  onNavigate,
}: {
  pathname: string;
  rail: boolean;
  onNavigate: () => void;
}) {
  return (
    <>
      <PlatformHead />
      <SidebarContent>
        <SidebarNav
          groups={PLATFORM_NAV_GROUPS}
          pathname={pathname}
          rail={rail}
          onNavigate={onNavigate}
        />
      </SidebarContent>
      <PlatformFoot />
    </>
  );
}

export function PlatformShell() {
  const compact = useIsCompact();
  const [railOpen, setRailOpen] = useRailOpen();
  const [navOpen, setNavOpen] = useState(false);
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const current = findCurrent(PLATFORM_NAV_GROUPS, pathname);
  const sidebar = (
    <PlatformSidebar
      pathname={pathname}
      rail={!compact && !railOpen}
      onNavigate={() => {
        setNavOpen(false);
      }}
    />
  );

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
        {compact ? (
          <PhoneNav
            open={navOpen}
            onOpenChange={setNavOpen}
            description="Pages in the platform console."
          >
            {sidebar}
          </PhoneNav>
        ) : (
          <Sidebar collapsible="icon">{sidebar}</Sidebar>
        )}
        <div className="flex min-w-0 flex-1 flex-col">
          <ShellTopbar
            compact={compact}
            groupLabel={current?.group.label ?? undefined}
            pageTitle={current?.item.pageTitle ?? 'Platform'}
            onOpenNavigation={() => {
              setNavOpen(true);
            }}
          />
          <ShellMain compact={compact} pathname={pathname} />
        </div>
      </SidebarProvider>
    </TooltipProvider>
  );
}
