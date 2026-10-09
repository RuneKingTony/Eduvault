import { ALL_PERMISSIONS, toPermissionMap } from '@eduvault/policy';
import {
  NAV_GROUPS,
  findCurrent,
  routeGate,
  visibleNav,
  visibleSettings,
  SETTINGS_SECTIONS,
  type NavGroup,
} from './nav';

const built = new Set(['/', '/approvals', '/students', '/fees', '/campuses']);
const everything = toPermissionMap(ALL_PERMISSIONS);
const routesFor = (permissions: Parameters<typeof visibleNav>[2]) =>
  visibleNav(NAV_GROUPS, built, permissions).flatMap((group) =>
    group.items.map((item) => item.route)
  );

describe('nav model', () => {
  it('orders the groups and their items in the documented order', () => {
    expect(NAV_GROUPS.map((group) => group.label)).toEqual([
      'Overview',
      'People',
      'School',
      'Finance',
      null,
    ]);
    expect(
      NAV_GROUPS.flatMap((group) => group.items.map((item) => item.label))
    ).toEqual([
      'Dashboard',
      'Approvals',
      'Announcements',
      'Students',
      'Staff and members',
      'Classes',
      'Subjects',
      'Fees',
      'Payments',
      'Store',
      'Accounts',
      'Settings',
    ]);
  });

  it('keeps only the items whose route exists', () => {
    expect(routesFor(everything)).toEqual([
      '/',
      '/approvals',
      '/students',
      '/fees',
      '/campuses',
    ]);
  });

  it('drops a group left with no items and keeps Settings last and unlabelled', () => {
    const groups = visibleNav(NAV_GROUPS, built, everything);
    expect(groups.map((group) => group.id)).toEqual([
      'overview',
      'people',
      'finance',
      'settings',
    ]);
    expect(groups.at(-1)?.label).toBeNull();
  });

  it('keeps only the settings sections that exist', () => {
    expect(
      visibleSettings(SETTINGS_SECTIONS, built, everything).map(
        (section) => section.label
      )
    ).toEqual(['Campuses']);
    expect(
      visibleSettings(SETTINGS_SECTIONS, new Set(['/']), everything)
    ).toEqual([]);
  });
});

describe('nav gates', () => {
  it('shows a member with no permissions only Dashboard and Approvals', () => {
    expect(routesFor({})).toEqual(['/', '/approvals']);
  });

  it('shows a bursar Students but no Fees or Settings', () => {
    expect(routesFor({ student: ['read'] })).toEqual([
      '/',
      '/approvals',
      '/students',
    ]);
  });

  it('shows Settings when any section passes and opens its first section', () => {
    const settings = visibleNav(NAV_GROUPS, built, { team: ['read'] })
      .flatMap((group) => group.items)
      .find((item) => item.id === 'settings');
    expect(settings?.route).toBe('/campuses');
    expect(
      visibleSettings(SETTINGS_SECTIONS, built, { team: ['create'] })
    ).toEqual([]);
  });

  it('passes an any-of gate with one of its permissions', () => {
    const groups: NavGroup[] = [
      {
        id: 'money',
        label: 'Money',
        items: [
          {
            id: 'invoices',
            label: 'Invoices',
            pageTitle: 'Invoices',
            route: '/invoices',
            icon: 'wallet',
            gate: ['student:create', 'student:read'],
          },
        ],
      },
    ];
    const routes = new Set(['/invoices']);
    expect(visibleNav(groups, routes, { student: ['read'] })).toHaveLength(1);
    expect(visibleNav(groups, routes, { team: ['read'] })).toEqual([]);
  });

  it('reads the route gate from the same declaration as the nav', () => {
    expect(routeGate('/students')).toEqual(['student:read']);
    expect(routeGate('/fees')).toEqual(['feeSchedule:read']);
    expect(routeGate('/campuses')).toEqual(['team:read']);
    expect(routeGate('/')).toBeUndefined();
    expect(routeGate('/approvals')).toBeUndefined();
  });
});

describe('findCurrent', () => {
  const groups = visibleNav(NAV_GROUPS, built, everything);
  const current = (pathname: string) => findCurrent(groups, pathname)?.item.id;

  it('matches the root only exactly', () => {
    expect(current('/')).toBe('dashboard');
    expect(current('/unknown')).toBeUndefined();
  });

  it('marks the parent active on a sub-page', () => {
    expect(current('/students')).toBe('students');
    expect(current('/students/5b0f')).toBe('students');
  });

  it('marks Settings active on any settings route', () => {
    expect(current('/campuses')).toBe('settings');
    expect(current('/roles/7')).toBe('settings');
  });

  it('does not match a path that only shares a prefix', () => {
    expect(current('/students-archive')).toBeUndefined();
  });

  it('reports the group so the breadcrumb can name it', () => {
    expect(findCurrent(groups, '/fees')?.group.label).toBe('Finance');
  });
});
