import { CheckIcon } from 'lucide-react';
import { DropdownMenuItem, DropdownMenuLabel } from '@eduvault/ui';
import type { EduvaultAuthClient } from './auth-client';

export function SchoolMenuItems({
  authClient,
  onSwitched,
}: {
  authClient: EduvaultAuthClient;
  onSwitched: () => void;
}) {
  const session = authClient.useSession();
  const schools = authClient.useListOrganizations();
  const activeId = session.data?.session.activeOrganizationId ?? null;
  return (
    <>
      <DropdownMenuLabel>School</DropdownMenuLabel>
      {schools.data?.map((school) => (
        <DropdownMenuItem
          key={school.id}
          onSelect={() => {
            if (school.id !== activeId) {
              void authClient.organization
                .setActive({ organizationId: school.id })
                .then((result) => {
                  if (result.error === null) {
                    onSwitched();
                  }
                });
            }
          }}
        >
          <span className="flex-1 truncate">{school.name}</span>
          {school.id === activeId ? <CheckIcon aria-label="Current" /> : null}
        </DropdownMenuItem>
      ))}
    </>
  );
}
