import type { ComponentProps, ReactNode } from 'react';
import { ChevronsUpDownIcon } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Button,
  SidebarMenuButton,
} from '@eduvault/ui';
import type { EduvaultAuthClient } from './auth-client';
import { SchoolMenuItems } from './school-menu-items';

export interface SchoolSwitcherProps {
  authClient: EduvaultAuthClient;
  appearance?: 'sidebar' | 'button';
  renderCrest?: (schoolName: string) => ReactNode;
  subtitle?: string;
  menuExtra?: ReactNode;
  onSwitched: () => void;
}

function SwitcherTrigger({
  appearance,
  activeName,
  crest,
  subtitle,
  ...triggerProps
}: {
  appearance: 'sidebar' | 'button';
  activeName: string;
  crest: ReactNode;
  subtitle: string | undefined;
} & ComponentProps<'button'>) {
  if (appearance === 'button') {
    return (
      <Button type="button" variant="outline" {...triggerProps}>
        <span className="min-w-0 flex-1 truncate">{activeName}</span>
        <ChevronsUpDownIcon className="size-4 opacity-70" />
      </Button>
    );
  }
  return (
    <SidebarMenuButton size="lg" tooltip={activeName} {...triggerProps}>
      {crest}
      <span className="flex min-w-0 flex-1 flex-col text-left leading-tight">
        <span className="truncate font-semibold">{activeName}</span>
        {subtitle === undefined ? null : (
          <span className="truncate text-xs font-normal text-muted-foreground">
            {subtitle}
          </span>
        )}
      </span>
      <ChevronsUpDownIcon className="ml-auto size-4 opacity-70" />
    </SidebarMenuButton>
  );
}

export function SchoolSwitcher({
  authClient,
  appearance = 'sidebar',
  renderCrest,
  subtitle,
  menuExtra,
  onSwitched,
}: SchoolSwitcherProps) {
  const session = authClient.useSession();
  const schools = authClient.useListOrganizations();
  const activeId = session.data?.session.activeOrganizationId ?? null;
  const activeName =
    schools.data?.find((school) => school.id === activeId)?.name ?? 'School';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <SwitcherTrigger
          appearance={appearance}
          activeName={activeName}
          crest={renderCrest?.(activeName)}
          subtitle={subtitle}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-56">
        <SchoolMenuItems authClient={authClient} onSwitched={onSwitched} />
        {menuExtra === undefined ? null : (
          <>
            <DropdownMenuSeparator />
            {menuExtra}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
