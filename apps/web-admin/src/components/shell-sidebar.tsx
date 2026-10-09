import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { ChevronsUpDownIcon } from 'lucide-react';
import { initials } from '@eduvault/shared';
import {
  SchoolSwitcher,
  UserAvatar,
  UserMenu,
  useAuthClient,
} from '@eduvault/auth-client';
import {
  SchoolCrest,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@eduvault/ui';
import { useActing } from '../acting-store';
import type { NavGroup } from '../nav';
import { SidebarNav } from './sidebar-nav';

interface ShellSidebarProps {
  groups: readonly NavGroup[];
  pathname: string;
  rail: boolean;
  onNavigate: () => void;
  onOpenCommandMenu: () => void;
  onOpenMyAccess: () => void;
}

function ActedSchool({ name }: { name: string }) {
  return (
    <SidebarMenuButton
      asChild
      size="lg"
      tooltip={name}
      className="cursor-default"
    >
      <div>
        <SchoolCrest name={name} initials={initials(name)} />
        <span className="min-w-0 flex-1 truncate font-semibold">{name}</span>
      </div>
    </SidebarMenuButton>
  );
}

function SidebarHead() {
  const authClient = useAuthClient();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const acting = useActing();
  return (
    <SidebarHeader className="gap-0 p-2 pb-0">
      <SidebarMenu>
        <SidebarMenuItem>
          {acting === null ? (
            <SchoolSwitcher
              authClient={authClient}
              renderCrest={(name) => (
                <SchoolCrest name={name} initials={initials(name)} />
              )}
              onSwitched={() => {
                queryClient.removeQueries();
                void navigate({ to: '/' });
              }}
            />
          ) : (
            <ActedSchool name={acting.schoolName} />
          )}
        </SidebarMenuItem>
      </SidebarMenu>
      <div className="mt-2 gold-rule" />
    </SidebarHeader>
  );
}

function SidebarFoot({
  onOpenCommandMenu,
  onOpenMyAccess,
}: {
  onOpenCommandMenu: () => void;
  onOpenMyAccess: () => void;
}) {
  const authClient = useAuthClient();
  const queryClient = useQueryClient();
  const acting = useActing();
  return (
    <SidebarFooter>
      <SidebarMenu>
        <SidebarMenuItem>
          <UserMenu
            authClient={authClient}
            side="top"
            onOpenMyAccess={acting === null ? onOpenMyAccess : undefined}
            onOpenCommandMenu={onOpenCommandMenu}
            onSignedOut={() => {
              queryClient.clear();
            }}
            renderTrigger={(user) => (
              <SidebarMenuButton size="lg" tooltip={user.name}>
                <UserAvatar name={user.name} image={user.image} />
                <span className="flex min-w-0 flex-1 flex-col text-left leading-tight">
                  <span className="truncate font-medium">{user.name}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {user.roles}
                  </span>
                </span>
                <ChevronsUpDownIcon className="ml-auto size-4 opacity-70" />
              </SidebarMenuButton>
            )}
          />
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarFooter>
  );
}

export function ShellSidebar({
  groups,
  pathname,
  rail,
  onNavigate,
  onOpenCommandMenu,
  onOpenMyAccess,
}: ShellSidebarProps) {
  return (
    <>
      <SidebarHead />
      <SidebarContent>
        <SidebarNav
          groups={groups}
          pathname={pathname}
          rail={rail}
          onNavigate={onNavigate}
        />
      </SidebarContent>
      <SidebarFoot
        onOpenCommandMenu={onOpenCommandMenu}
        onOpenMyAccess={onOpenMyAccess}
      />
    </>
  );
}
