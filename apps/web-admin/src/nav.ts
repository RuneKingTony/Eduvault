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
}

export interface NavGroup {
  id: string;
  label: string | null;
  items: readonly NavItem[];
}

interface SettingsSection {
  id: string;
  label: string;
  route: string;
}

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
      },
      {
        id: 'members',
        label: 'Staff and members',
        pageTitle: 'Staff and members',
        route: '/members',
        icon: 'users',
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
        id: 'settings',
        label: 'Settings',
        pageTitle: 'Settings',
        route: '/campuses',
        icon: 'settings',
        alsoActiveFor: ['/roles', '/calendar', '/settings'],
      },
    ],
  },
];

export const EXTRA_PAGE_TITLES: Readonly<Record<string, string>> = isDev
  ? { '/dev/ui': 'Component gallery' }
  : {};

export const SETTINGS_SECTIONS: readonly SettingsSection[] = [
  { id: 'campuses', label: 'Campuses', route: '/campuses' },
];

export function visibleNav(
  groups: readonly NavGroup[],
  builtRoutes: ReadonlySet<string>
): NavGroup[] {
  return groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => builtRoutes.has(item.route)),
    }))
    .filter((group) => group.items.length > 0);
}

export function visibleSettings(
  sections: readonly SettingsSection[],
  builtRoutes: ReadonlySet<string>
): SettingsSection[] {
  return sections.filter((section) => builtRoutes.has(section.route));
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
