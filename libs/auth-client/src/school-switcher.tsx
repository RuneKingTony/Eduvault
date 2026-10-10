import type { ComponentProps, ReactNode } from 'react';
import { CheckIcon, ChevronsUpDownIcon } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Button,
  SidebarMenuButton,
} from '@eduvault/ui';
import type { EduvaultAuthClient } from './auth-client';

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

  function choose(organizationId: string) {
    if (organizationId !== activeId) {
      void authClient.organization
        .setActive({ organizationId })
        .then((result) => {
          if (result.error === null) {
            onSwitched();
          }
        });
    }
  }

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
        <DropdownMenuLabel>School</DropdownMenuLabel>
        {schools.data?.map((school) => (
          <DropdownMenuItem
            key={school.id}
            onSelect={() => {
              choose(school.id);
            }}
          >
            <span className="flex-1 truncate">{school.name}</span>
            {school.id === activeId ? <CheckIcon aria-label="Current" /> : null}
          </DropdownMenuItem>
        ))}
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
