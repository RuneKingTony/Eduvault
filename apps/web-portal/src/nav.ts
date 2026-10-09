import { routeMatchLength } from '@eduvault/shared';
import type { NavIconName } from '@eduvault/ui';

interface PortalNavEntry {
  id: string;
  label: string;
  route: string;
  icon: NavIconName;
}

export const PORTAL_NAV: readonly PortalNavEntry[] = [
  { id: 'home', label: 'Home', route: '/', icon: 'house' },
  { id: 'fees', label: 'Fees', route: '/fees', icon: 'wallet' },
];

export function visiblePortalNav(
  entries: readonly PortalNavEntry[],
  builtRoutes: ReadonlySet<string>
): PortalNavEntry[] {
  return entries.filter((entry) => builtRoutes.has(entry.route));
}

export function isCurrent(entry: PortalNavEntry, pathname: string): boolean {
  return routeMatchLength(entry.route, pathname) > 0;
}
