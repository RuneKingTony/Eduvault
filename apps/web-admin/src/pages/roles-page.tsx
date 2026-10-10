import { useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDownIcon, CircleHelpIcon, PlusIcon } from 'lucide-react';
import type { Role, RoleHolder } from '@eduvault/api-contract';
import { Can } from '@eduvault/auth-client';
import { OWNER_ROLE } from '@eduvault/policy';
import { countOf } from '@eduvault/shared';
import {
  AvatarGroup,
  AvatarGroupCount,
  Button,
  Card,
  CardContent,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  ErrorMessage,
  NavIcon,
  PageSkeleton,
  TablePager,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@eduvault/ui';
import { useApi } from '../api';
import { WithTooltip } from '../components/member-roles';
import { PersonAvatar } from '../components/person-avatar';
import {
  switchedOnText,
  thingsSwitchedOn,
} from '../components/role-editor/role-draft';
import { RoleSourceBadge } from '../components/role-editor/role-source-badge';
import { rolesQueryOptions } from '../queries';

const ROLES_PAGE_SIZE = 10;
const AVATAR_LIMIT = 4;

interface RolesPageProps {
  onNewRole: () => void;
  onOpenRole: (slug: string) => void;
}

function Disclosure({
  title,
  icon,
  children,
}: {
  title: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <Collapsible className="rounded-md border">
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center gap-2 px-3 py-2 text-sm font-medium"
        >
          {icon}
          {title}
          <ChevronDownIcon className="ml-auto size-4" />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="border-t p-3 text-sm">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}

function KindsOfRoles() {
  return (
    <Disclosure
      title="Kinds of roles"
      icon={<CircleHelpIcon className="size-4" />}
    >
      <ul className="flex flex-col gap-2">
        <li>
          <strong>Built in:</strong> Owner (can do everything) and Member (can
          do nothing). These can’t be edited.
        </li>
        <li>
          <strong>Ready-made roles</strong> come with the school and can be
          changed.
        </li>
        <li>
          <strong>Your own roles</strong> are ones you create. Renaming a role
          never removes it from the people who have it.
        </li>
      </ul>
    </Disclosure>
  );
}

function BuiltInRoles({ roles }: { roles: readonly Role[] }) {
  return (
    <Disclosure
      title="Built-in roles (cannot be edited)"
      icon={<NavIcon name="lock" className="size-4" />}
    >
      <ul className="flex flex-col gap-3">
        {roles.map((role) => (
          <li
            key={role.slug}
            className="flex items-start justify-between gap-3"
          >
            <div className="flex flex-col gap-1">
              <p className="flex items-center gap-2 font-medium">
                {role.label}
                <RoleSourceBadge source={role.source} />
              </p>
              <p className="text-muted-foreground">{role.description}</p>
              <HolderAvatars role={role} />
            </div>
            <span className="font-medium">
              {role.slug === OWNER_ROLE ? 'Everything' : 'Nothing'}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-muted-foreground">
        Every person has Member. Only Owner can do everything, and ownership is
        handed over in Settings, Danger zone.
      </p>
    </Disclosure>
  );
}

function holderCountText(count: number): string {
  if (count === 0) {
    return 'Nobody holds it';
  }
  return countOf(count, 'person', 'people');
}

function holderNames(role: Role, holders: readonly RoleHolder[]): string {
  const names = holders.map((holder) => holder.name).join(', ');
  const hidden = role.holderCount - holders.length;
  return hidden > 0 ? `${names} and ${hidden} more` : names;
}

function HolderAvatars({ role }: { role: Role }) {
  const holders: readonly RoleHolder[] | undefined = role.holders;
  if (holders === undefined || holders.length === 0) {
    return (
      <span className="text-sm text-muted-foreground">
        {holderCountText(role.holderCount)}
      </span>
    );
  }
  const shown = holders.slice(0, AVATAR_LIMIT);
  const more = role.holderCount - shown.length;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span>
          <AvatarGroup>
            {shown.map((holder) => (
              <PersonAvatar key={holder.memberId} name={holder.name} />
            ))}
            {more > 0 ? <AvatarGroupCount>+{more}</AvatarGroupCount> : null}
          </AvatarGroup>
        </span>
      </TooltipTrigger>
      <TooltipContent>{holderNames(role, holders)}</TooltipContent>
    </Tooltip>
  );
}

function RoleCard({
  role,
  onOpen,
}: {
  role: Role;
  onOpen: (slug: string) => void;
}) {
  return (
    <li>
      <button
        type="button"
        className="size-full text-left"
        aria-label={role.label}
        onClick={() => {
          onOpen(role.slug);
        }}
      >
        <Card className="h-full transition-colors hover:bg-muted/50">
          <CardContent className="flex h-full flex-col gap-3">
            <div className="flex items-center gap-2">
              <NavIcon
                name={role.source === 'custom' ? 'sparkles' : 'shield'}
                className="size-4 text-muted-foreground"
              />
              <span className="font-medium">{role.label}</span>
              <RoleSourceBadge source={role.source} />
            </div>
            <p className="line-clamp-2 min-h-10 text-sm text-muted-foreground">
              {role.description}
            </p>
            <p className="text-sm">
              {switchedOnText(thingsSwitchedOn(role.permissions))}
            </p>
            <div className="mt-auto">
              <HolderAvatars role={role} />
            </div>
          </CardContent>
        </Card>
      </button>
    </li>
  );
}

function RolesGrid({
  roles,
  onOpen,
}: {
  roles: readonly Role[];
  onOpen: (slug: string) => void;
}) {
  const [page, setPage] = useState(1);
  const start = (page - 1) * ROLES_PAGE_SIZE;
  const shown = roles.slice(start, start + ROLES_PAGE_SIZE);
  return (
    <section className="flex flex-col gap-3" aria-label="Your school’s roles">
      <h2 className="text-base font-medium">Your school’s roles</h2>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((role) => (
          <RoleCard key={role.slug} role={role} onOpen={onOpen} />
        ))}
      </ul>
      {roles.length > ROLES_PAGE_SIZE ? (
        <TablePager
          page={page}
          hasNext={start + ROLES_PAGE_SIZE < roles.length}
          onPrevious={() => {
            setPage(page - 1);
          }}
          onNext={() => {
            setPage(page + 1);
          }}
        />
      ) : null}
    </section>
  );
}

function RolesHeader({ onNewRole }: { onNewRole: () => void }) {
  return (
    <header className="flex items-start justify-between gap-3">
      <div className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2">
          Roles
          <WithTooltip text="A role is a set of things people can do. Changes apply straight away to everyone with the role.">
            <button
              type="button"
              aria-label="About roles"
              className="text-muted-foreground"
            >
              <CircleHelpIcon className="size-4" />
            </button>
          </WithTooltip>
        </h1>
        <p className="text-sm text-muted-foreground">
          Choose what each role can do.
        </p>
      </div>
      <Can permission="ac:create">
        <Button type="button" onClick={onNewRole}>
          <PlusIcon />
          New role
        </Button>
      </Can>
    </header>
  );
}

export function RolesPage({ onNewRole, onOpenRole }: RolesPageProps) {
  const api = useApi();
  const roles = useQuery(rolesQueryOptions(api));
  const items = roles.data?.items ?? [];
  return (
    <section className="flex flex-col gap-4">
      <RolesHeader onNewRole={onNewRole} />
      <KindsOfRoles />
      <ErrorMessage error={roles.error} />
      {roles.isPending ? <PageSkeleton rows={3} /> : null}
      {roles.data === undefined ? null : (
        <>
          <RolesGrid
            roles={items.filter((role) => role.source !== 'code')}
            onOpen={onOpenRole}
          />
          <BuiltInRoles
            roles={items.filter((role) => role.source === 'code')}
          />
        </>
      )}
    </section>
  );
}
