import { ChevronRightIcon } from 'lucide-react';
import type { Role, RoleHolder } from '@eduvault/api-contract';
import { countOf } from '@eduvault/shared';
import {
  capChanges,
  permissionsOfRoles,
  type PermissionMap,
} from '@eduvault/policy';
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  NavIcon,
} from '@eduvault/ui';
import { WithTooltip } from '../member-roles';
import { PersonAvatar } from '../person-avatar';

interface HoldersProps {
  role: Role | undefined;
  catalogue: readonly Role[];
  draft: PermissionMap;
  changed: boolean;
  onOpenMember: (memberId: string) => void;
}

function Consequence({
  holder,
  slug,
  catalogue,
  draft,
}: {
  holder: RoleHolder;
  slug: string;
  catalogue: readonly Role[];
  draft: PermissionMap;
}) {
  const before = permissionsOfRoles(holder.roles, catalogue);
  const after = permissionsOfRoles(
    holder.roles,
    catalogue.map((entry) =>
      entry.slug === slug ? { ...entry, permissions: draft } : entry
    )
  );
  const { gained, lost } = capChanges(before, after);
  return (
    <li className="flex items-center justify-between gap-2 text-sm">
      <span>{holder.name}</span>
      {gained.length === 0 && lost.length === 0 ? (
        <WithTooltip text="Another of their roles already covers it">
          <span className="text-muted-foreground">no change</span>
        </WithTooltip>
      ) : (
        <span className="flex gap-1">
          {gained.length > 0 ? (
            <Badge variant="success">+{gained.length}</Badge>
          ) : null}
          {lost.length > 0 ? (
            <Badge variant="destructive">−{lost.length}</Badge>
          ) : null}
        </span>
      )}
    </li>
  );
}

function HolderList({
  holders,
  onOpenMember,
}: {
  holders: readonly RoleHolder[];
  onOpenMember: (memberId: string) => void;
}) {
  return (
    <ul className="flex flex-col divide-y">
      {holders.map((holder) => (
        <li key={holder.memberId}>
          <button
            type="button"
            className="flex w-full items-center gap-2 py-2 text-left"
            onClick={() => {
              onOpenMember(holder.memberId);
            }}
          >
            <PersonAvatar name={holder.name} />
            <span className="flex-1 text-sm">{holder.name}</span>
            <ChevronRightIcon className="size-4 text-muted-foreground" />
          </button>
        </li>
      ))}
    </ul>
  );
}

const NOBODY = 'Nobody yet. Assign it from a member’s page.';

function countText(count: number): string {
  if (count === 0) {
    return NOBODY;
  }
  return `${countOf(count, 'person', 'people')} ${count === 1 ? 'holds' : 'hold'} this role.`;
}

function Hint({ children }: { children: string }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}

function Consequences({
  role,
  holders,
  catalogue,
  draft,
}: {
  role: Role;
  holders: readonly RoleHolder[];
  catalogue: readonly Role[];
  draft: PermissionMap;
}) {
  return (
    <div className="flex flex-col gap-2 border-t pt-3">
      <h4 className="text-sm font-medium">If you save now</h4>
      <ul className="flex flex-col gap-1.5">
        {holders.map((holder) => (
          <Consequence
            key={holder.memberId}
            holder={holder}
            slug={role.slug}
            catalogue={catalogue}
            draft={draft}
          />
        ))}
      </ul>
    </div>
  );
}

function Body({ role, catalogue, draft, changed, onOpenMember }: HoldersProps) {
  if (role === undefined) {
    return <Hint>Assign it from a member’s page once it exists.</Hint>;
  }
  const holders = role.holders;
  if (holders === undefined || holders.length === 0) {
    return <Hint>{countText(role.holderCount)}</Hint>;
  }
  const hidden = role.holderCount - holders.length;
  return (
    <>
      <HolderList holders={holders} onOpenMember={onOpenMember} />
      {hidden > 0 ? (
        <Hint>{`${countOf(hidden, 'more person holds', 'more people hold')} this role on campuses you don’t look after.`}</Hint>
      ) : null}
      {changed ? (
        <Consequences
          role={role}
          holders={holders}
          catalogue={catalogue}
          draft={draft}
        />
      ) : null}
    </>
  );
}

export function RoleHolders(props: HoldersProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <NavIcon name="users" className="size-4" />
          Who holds it
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Body {...props} />
      </CardContent>
    </Card>
  );
}
