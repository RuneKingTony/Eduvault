import type { ComponentProps, ReactNode } from 'react';
import { unknownRoleEntry, type SchoolRole } from '@eduvault/api-contract';
import { MEMBER_ROLE, OWNER_ROLE, type PermissionMap } from '@eduvault/policy';
import { Badge, Tooltip, TooltipContent, TooltipTrigger } from '@eduvault/ui';

type BadgeVariant = NonNullable<ComponentProps<typeof Badge>['variant']>;

const SOURCES = {
  code: { label: 'Built in', tag: 'Built in', variant: 'default', style: '' },
  starter: {
    label: 'Ready-made role',
    tag: 'Ready-made',
    variant: 'secondary',
    style: '',
  },
  custom: {
    label: 'Your own role',
    tag: 'Your own',
    variant: 'outline',
    style: 'border-primary text-primary',
  },
} as const satisfies Record<
  SchoolRole['source'],
  { label: string; tag: string; variant: BadgeVariant; style: string }
>;

export const permissionCount = (permissions: PermissionMap): number =>
  Object.values(permissions).reduce(
    (total, actions) => total + actions.length,
    0
  );

export function roleOf(
  catalogue: readonly SchoolRole[],
  slug: string
): SchoolRole {
  return (
    catalogue.find((role) => role.slug === slug) ?? {
      ...unknownRoleEntry(slug),
      grantable: false,
    }
  );
}

export const roleLabelOf = (
  catalogue: readonly SchoolRole[],
  slug: string
): string => roleOf(catalogue, slug).label;

export const listedSlugs = (roles: readonly string[]): string[] =>
  roles.filter((slug) => slug !== MEMBER_ROLE);

export function WithTooltip({
  text,
  children,
}: {
  text: string | undefined;
  children: ReactNode;
}) {
  if (text === undefined) {
    return <>{children}</>;
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span>{children}</span>
      </TooltipTrigger>
      <TooltipContent>{text}</TooltipContent>
    </Tooltip>
  );
}

export function SourceTag({ role }: { role: SchoolRole }) {
  return (
    <Badge variant="outline" className="text-muted-foreground">
      {SOURCES[role.source].tag}
    </Badge>
  );
}

function SourceBadge({ role }: { role: SchoolRole }) {
  return (
    <Badge
      variant={SOURCES[role.source].variant}
      className={SOURCES[role.source].style}
    >
      {role.label}
    </Badge>
  );
}

export function RoleBadge({ role }: { role: SchoolRole }) {
  const count =
    role.slug === OWNER_ROLE
      ? 'all'
      : String(permissionCount(role.permissions));
  return (
    <WithTooltip text={`${SOURCES[role.source].label} · ${count} permissions`}>
      <SourceBadge role={role} />
    </WithTooltip>
  );
}

export function NoRolesBadge() {
  return (
    <WithTooltip text="Membership alone grants nothing">
      <Badge variant="outline">No roles</Badge>
    </WithTooltip>
  );
}

export function RoleBadges({
  roles,
  catalogue,
}: {
  roles: readonly string[];
  catalogue: readonly SchoolRole[];
}) {
  const slugs = listedSlugs(roles);
  if (slugs.length === 0) {
    return <NoRolesBadge />;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {slugs.map((slug) => (
        <RoleBadge key={slug} role={roleOf(catalogue, slug)} />
      ))}
    </div>
  );
}
