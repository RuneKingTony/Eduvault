import {
  ALL_PERMISSIONS,
  STARTER_ROLES,
  toPermissionMap,
} from '@eduvault/policy';
import {
  NAV_GROUPS,
  findCurrent,
  routeGate,
  visibleNav,
  visibleSettings,
  SETTINGS_SECTIONS,
  type NavGroup,
} from './nav';

const built = new Set([
  '/',
  '/approvals',
  '/students',
  '/members',
  '/fees',
  '/campuses',
  '/roles',
  '/roles/new',
]);
const starter = (slug: string) =>
  toPermissionMap(
    STARTER_ROLES.find((role) => role.slug === slug)?.permissions ?? []
  );
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
      '/members',
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
    ).toEqual(['Campuses', 'Roles and permissions']);
    expect(
      visibleSettings(SETTINGS_SECTIONS, new Set(['/']), everything)
    ).toEqual([]);
  });
});

describe('settings sections', () => {
  it('groups Campuses under School structure and Roles under Access', () => {
    expect(
      SETTINGS_SECTIONS.map((section) => [section.label, section.group])
    ).toEqual([
      ['Campuses', 'School structure'],
      ['Roles and permissions', 'Access'],
    ]);
  });

  it('shows the administrator Roles and the bursar no Settings at all', () => {
    expect(
      visibleSettings(SETTINGS_SECTIONS, built, starter('administrator')).map(
        (section) => section.id
      )
    ).toEqual(['campuses', 'roles']);
    expect(
      visibleSettings(SETTINGS_SECTIONS, built, starter('bursar'))
    ).toEqual([]);
    const settings = visibleNav(NAV_GROUPS, built, starter('bursar'))
      .flatMap((group) => group.items)
      .find((item) => item.id === 'settings');
    expect(settings).toBeUndefined();
  });

  it('opens Settings on Roles for someone who can see roles but not campuses', () => {
    const settings = visibleNav(NAV_GROUPS, built, { ac: ['read'] })
      .flatMap((group) => group.items)
      .find((item) => item.id === 'settings');
    expect(settings?.route).toBe('/roles');
  });

  it('gates the role routes', () => {
    expect(routeGate('/roles')).toEqual(['ac:read']);
    expect(routeGate('/roles/new')).toEqual(['ac:create']);
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

  it('hides Staff and members from a bursar and shows it with member:read', () => {
    expect(routesFor(toPermissionMap(['student:read']))).not.toContain(
      '/members'
    );
    expect(routesFor(toPermissionMap(['member:read']))).toContain('/members');
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
    expect(routeGate('/members')).toEqual(['member:read']);
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
