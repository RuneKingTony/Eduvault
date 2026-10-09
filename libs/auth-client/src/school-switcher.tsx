import type { ReactNode } from 'react';
import { CheckIcon, ChevronsUpDownIcon } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  Button,
  SidebarMenuButton,
} from '@eduvault/ui';
import type { EduvaultAuthClient } from './auth-client';

export interface SchoolSwitcherProps {
  authClient: EduvaultAuthClient;
  appearance?: 'sidebar' | 'button';
  renderCrest?: (schoolName: string) => ReactNode;
  onSwitched: () => void;
}

export function SchoolSwitcher({
  authClient,
  appearance = 'sidebar',
  renderCrest,
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
        {appearance === 'button' ? (
          <Button type="button" variant="outline">
            <span className="min-w-0 flex-1 truncate">{activeName}</span>
            <ChevronsUpDownIcon className="size-4 opacity-70" />
          </Button>
        ) : (
          <SidebarMenuButton size="lg" tooltip={activeName}>
            {renderCrest?.(activeName)}
            <span className="min-w-0 flex-1 truncate font-semibold">
              {activeName}
            </span>
            <ChevronsUpDownIcon className="ml-auto size-4 opacity-70" />
          </SidebarMenuButton>
        )}
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
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
