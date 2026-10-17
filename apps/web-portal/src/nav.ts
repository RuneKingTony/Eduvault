import type { PortalKind } from '@eduvault/api-contract';
import { holds, type Permission, type PermissionMap } from '@eduvault/policy';
import { routeMatchLength } from '@eduvault/shared';
import type { NavIconName } from '@eduvault/ui';

interface PortalNavEntry {
  id: string;
  label: string;
  shortLabel?: string;
  route: string;
  icon: NavIconName;
  permission: Permission;
  kind?: PortalKind;
}

export const PORTAL_NAV: readonly PortalNavEntry[] = [
  {
    id: 'children',
    label: 'My children',
    shortLabel: 'Children',
    route: '/children',
    icon: 'users-round',
    permission: 'student:readOwn',
    kind: 'guardian',
  },
  {
    id: 'home',
    label: 'Home',
    route: '/',
    icon: 'house',
    permission: 'student:readOwn',
  },
  {
    id: 'fees',
    label: 'Fees',
    route: '/fees',
    icon: 'receipt',
    permission: 'invoice:readOwn',
  },
];

interface NavAudience {
  builtRoutes: ReadonlySet<string>;
  permissions: PermissionMap;
  kind: PortalKind;
}

export function visiblePortalNav(
  entries: readonly PortalNavEntry[],
  { builtRoutes, permissions, kind }: NavAudience
): PortalNavEntry[] {
  return entries.filter(
    (entry) =>
      builtRoutes.has(entry.route) &&
      holds(permissions, entry.permission) &&
      (entry.kind === undefined || entry.kind === kind)
  );
}

export function isCurrent(entry: PortalNavEntry, pathname: string): boolean {
  return routeMatchLength(entry.route, pathname) > 0;
}
