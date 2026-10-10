import { canAny, type Gate, type PermissionMap } from '@eduvault/policy';
import { routeMatchLength } from '@eduvault/shared';
import type { NavIconName } from '@eduvault/ui';
import { isDev } from './env';

export interface NavItem {
  id: string;
  label: string;
  pageTitle: string;
  route: string;
  icon: NavIconName;
  alsoActiveFor?: readonly string[];
  gate?: Gate;
}

export interface NavGroup {
  id: string;
  label: string | null;
  items: readonly NavItem[];
}

export interface SettingsSection {
  id: string;
  label: string;
  route: string;
  group: string;
  icon: NavIconName;
  gate?: Gate;
}

const SETTINGS_ITEM_ID = 'settings';

export const NAV_GROUPS: readonly NavGroup[] = [
  {
    id: 'overview',
    label: 'Overview',
    items: [
      {
        id: 'dashboard',
        label: 'Dashboard',
        pageTitle: 'Dashboard',
        route: '/',
        icon: 'layout-dashboard',
      },
      {
        id: 'approvals',
        label: 'Approvals',
        pageTitle: 'Approvals',
        route: '/approvals',
        icon: 'inbox',
      },
      {
        id: 'announcements',
        label: 'Announcements',
        pageTitle: 'Announcements',
        route: '/announcements',
        icon: 'megaphone',
      },
    ],
  },
  {
    id: 'people',
    label: 'People',
    items: [
      {
        id: 'students',
        label: 'Students',
        pageTitle: 'Students',
        route: '/students',
        icon: 'graduation-cap',
        gate: ['student:read'],
      },
      {
        id: 'members',
        label: 'Staff and members',
        pageTitle: 'Staff and members',
        route: '/members',
        icon: 'users',
        gate: ['member:read'],
      },
    ],
  },
  {
    id: 'school',
    label: 'School',
    items: [
      {
        id: 'classes',
        label: 'Classes',
        pageTitle: 'Classes',
        route: '/classes',
        icon: 'school',
      },
      {
        id: 'subjects',
        label: 'Subjects',
        pageTitle: 'Subjects',
        route: '/subjects',
        icon: 'book-marked',
      },
    ],
  },
  {
    id: 'finance',
    label: 'Finance',
    items: [
      {
        id: 'fees',
        label: 'Fees',
        pageTitle: 'Fees',
        route: '/fees',
        icon: 'wallet',
        gate: ['feeSchedule:read'],
      },
      {
        id: 'payments',
        label: 'Payments',
        pageTitle: 'Payments',
        route: '/finance/payments',
        icon: 'banknote',
      },
      {
        id: 'store',
        label: 'Store',
        pageTitle: 'Store',
        route: '/finance/store',
        icon: 'store',
      },
      {
        id: 'accounts',
        label: 'Accounts',
        pageTitle: 'Money accounts',
        route: '/finance/money-accounts',
        icon: 'landmark',
      },
    ],
  },
  {
    id: 'settings',
    label: null,
    items: [
      {
        id: SETTINGS_ITEM_ID,
        label: 'Settings',
        pageTitle: 'Settings',
        route: '/settings',
        icon: 'settings',
        alsoActiveFor: ['/campuses', '/roles', '/calendar', '/settings'],
      },
    ],
  },
];

export const PLATFORM_NAV_GROUPS: readonly NavGroup[] = [
  {
    id: 'platform',
    label: 'Platform',
    items: [
      {
        id: 'schools',
        label: 'Schools',
        pageTitle: 'Schools',
        route: '/platform/schools',
        icon: 'school',
      },
      {
        id: 'audit',
        label: 'Audit log',
        pageTitle: 'Audit log',
        route: '/platform/audit',
        icon: 'history',
      },
    ],
  },
];

export const EXTRA_PAGE_TITLES: Readonly<Record<string, string>> = isDev
  ? { '/dev/ui': 'Component gallery' }
  : {};

export const SETTINGS_SECTIONS: readonly SettingsSection[] = [
  {
    id: 'profile',
    label: 'School profile',
    route: '/settings/profile',
    group: 'General',
    icon: 'school',
    gate: ['schoolAccount:read'],
  },
  {
    id: 'admissions',
    label: 'Admissions rules',
    route: '/settings/admissions',
    group: 'General',
    icon: 'users',
    gate: ['schoolAccount:read'],
  },
  {
    id: 'campuses',
    label: 'Campuses',
    route: '/campuses',
    group: 'School structure',
    icon: 'building',
    gate: ['team:read'],
  },
  {
    id: 'roles',
    label: 'Roles and permissions',
    route: '/roles',
    group: 'Access',
    icon: 'shield-check',
    gate: ['ac:read'],
  },
  {
    id: 'danger',
    label: 'Danger zone',
    route: '/settings/danger',
    group: 'Access',
    icon: 'shield-alert',
    gate: ['organization:delete', 'organization:update'],
  },
];

const ROUTE_GATES = new Map<string, Gate>([
  ...[
    ...NAV_GROUPS.flatMap((group) => group.items),
    ...SETTINGS_SECTIONS,
  ].flatMap((entry): [string, Gate][] =>
    entry.gate === undefined ? [] : [[entry.route, entry.gate]]
  ),
  ['/roles/new', ['ac:create']],
]);

export const routeGate = (route: string): Gate | undefined =>
  ROUTE_GATES.get(route);

const passes = (permissions: PermissionMap, gate: Gate | undefined) =>
  gate === undefined || canAny(permissions, gate);

export function visibleSettings(
  sections: readonly SettingsSection[],
  builtRoutes: ReadonlySet<string>,
  permissions: PermissionMap
): SettingsSection[] {
  return sections.filter(
    (section) =>
      builtRoutes.has(section.route) && passes(permissions, section.gate)
  );
}

function settingsItem(
  item: NavItem,
  builtRoutes: ReadonlySet<string>,
  permissions: PermissionMap
): NavItem | undefined {
  const [first] = visibleSettings(SETTINGS_SECTIONS, builtRoutes, permissions);
  return first === undefined ? undefined : { ...item, route: first.route };
}

export function visibleNav(
  groups: readonly NavGroup[],
  builtRoutes: ReadonlySet<string>,
  permissions: PermissionMap
): NavGroup[] {
  return groups
    .map((group) => ({
      ...group,
      items: group.items
        .map((item) =>
          item.id === SETTINGS_ITEM_ID
            ? settingsItem(item, builtRoutes, permissions)
            : item
        )
        .filter(
          (item): item is NavItem =>
            item !== undefined &&
            builtRoutes.has(item.route) &&
            passes(permissions, item.gate)
        ),
    }))
    .filter((group) => group.items.length > 0);
}

function matchLength(item: NavItem, pathname: string): number {
  const roots = [item.route, ...(item.alsoActiveFor ?? [])];
  return Math.max(0, ...roots.map((root) => routeMatchLength(root, pathname)));
}

export function findCurrent(
  groups: readonly NavGroup[],
  pathname: string
): { group: NavGroup; item: NavItem } | undefined {
  let best: { group: NavGroup; item: NavItem; length: number } | undefined;
  for (const group of groups) {
    for (const item of group.items) {
      const length = matchLength(item, pathname);
      if (length > (best?.length ?? 0)) {
        best = { group, item, length };
      }
    }
  }
  return best;
}

export const underRoute = (route: string, pathname: string) =>
  pathname === route || pathname.startsWith(`${route}/`);

export function settingsTrail(
  pathname: string
): { group: string; title: string } | undefined {
  if (pathname === '/settings') {
    return { group: 'Settings', title: 'All sections' };
  }
  const section = SETTINGS_SECTIONS.find((entry) =>
    underRoute(entry.route, pathname)
  );
  return section === undefined
    ? undefined
    : { group: 'Settings', title: section.label };
}

type SettingsLanding =
  | { kind: 'redirect'; to: '/' | '/settings/profile' }
  | { kind: 'list'; items: SettingsSection[] };

export function settingsLanding(
  builtRoutes: ReadonlySet<string>,
  permissions: PermissionMap,
  sections: readonly SettingsSection[] = SETTINGS_SECTIONS
): SettingsLanding {
  const items = visibleSettings(sections, builtRoutes, permissions);
  if (items.length === 0) {
    return { kind: 'redirect', to: '/' };
  }
  return items.some((item) => item.route === '/settings/profile')
    ? { kind: 'redirect', to: '/settings/profile' }
    : { kind: 'list', items };
}
