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
  settingsLanding,
  settingsTrail,
  type NavGroup,
} from './nav';

const built = new Set([
  '/',
  '/approvals',
  '/announcements',
  '/students',
  '/members',
  '/fees',
  '/classes',
  '/calendar',
  '/campuses',
  '/roles',
  '/roles/new',
  '/settings/profile',
  '/settings/admissions',
  '/settings/danger',
  '/settings/levels',
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
      '/announcements',
      '/students',
      '/members',
      '/classes',
      '/fees',
      '/settings/profile',
    ]);
  });

  it('drops a group left with no items and keeps Settings last and unlabelled', () => {
    const groups = visibleNav(NAV_GROUPS, built, everything);
    expect(groups.map((group) => group.id)).toEqual([
      'overview',
      'people',
      'school',
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
    ).toEqual([
      'School profile',
      'Admissions rules',
      'School years and terms',
      'Campuses',
      'Levels',
      'Roles and permissions',
      'Danger zone',
    ]);
    expect(
      visibleSettings(SETTINGS_SECTIONS, new Set(['/']), everything)
    ).toEqual([]);
  });
});

const settingsRoute = (permissions: Parameters<typeof visibleNav>[2]) =>
  visibleNav(NAV_GROUPS, built, permissions)
    .flatMap((group) => group.items)
    .find((item) => item.id === 'settings')?.route;
const idsFor = (permissions: Parameters<typeof visibleNav>[2]) =>
  visibleSettings(SETTINGS_SECTIONS, built, permissions).map(
    (section) => section.id
  );

describe('settings sections', () => {
  it('keeps the PRD order and groups', () => {
    expect(
      SETTINGS_SECTIONS.map((section) => [section.label, section.group])
    ).toEqual([
      ['School profile', 'General'],
      ['Admissions rules', 'General'],
      ['School years and terms', 'School structure'],
      ['Campuses', 'School structure'],
      ['Levels', 'School structure'],
      ['Roles and permissions', 'Access'],
      ['Danger zone', 'Access'],
    ]);
  });

  it('shows an owner every item and opens School profile', () => {
    expect(idsFor(everything)).toEqual([
      'profile',
      'admissions',
      'calendar',
      'campuses',
      'levels',
      'roles',
      'danger',
    ]);
    expect(settingsRoute(everything)).toBe('/settings/profile');
  });

  it('shows an administrator everything but the Danger zone and opens School profile', () => {
    expect(idsFor(starter('administrator'))).toEqual([
      'profile',
      'admissions',
      'calendar',
      'campuses',
      'levels',
      'roles',
    ]);
    expect(settingsRoute(starter('administrator'))).toBe('/settings/profile');
  });

  it('opens Settings on the calendar for a session:read-only member, who sees only that section', () => {
    expect(idsFor({ session: ['read'] })).toEqual(['calendar']);
    expect(settingsRoute({ session: ['read'] })).toBe('/calendar');
  });

  it('gates the calendar route on session:read', () => {
    expect(routeGate('/calendar')).toEqual(['session:read']);
  });

  it('shows a principal Campuses and Levels and opens Campuses', () => {
    expect(idsFor(starter('principal'))).toEqual(['campuses', 'levels']);
    expect(settingsRoute(starter('principal'))).toBe('/campuses');
  });

  it('shows a teacher Levels alone and opens it', () => {
    expect(idsFor(starter('teacher'))).toEqual(['levels']);
    expect(settingsRoute(starter('teacher'))).toBe('/settings/levels');
  });

  it('gates Classes and Levels on class:read', () => {
    expect(routeGate('/classes')).toEqual(['class:read']);
    expect(routeGate('/settings/levels')).toEqual(['class:read']);
  });

  it('shows a bursar no Settings at all', () => {
    expect(idsFor(starter('bursar'))).toEqual([]);
    expect(settingsRoute(starter('bursar'))).toBeUndefined();
  });

  it('opens Settings on Roles for someone who can see roles only', () => {
    expect(idsFor({ ac: ['read'] })).toEqual(['roles']);
    expect(settingsRoute({ ac: ['read'] })).toBe('/roles');
  });

  it('shows the Danger zone to a holder of either organization permission', () => {
    expect(idsFor({ organization: ['update'] })).toEqual(['danger']);
    expect(idsFor({ organization: ['delete'] })).toEqual(['danger']);
    expect(settingsRoute({ organization: ['update'] })).toBe(
      '/settings/danger'
    );
  });

  it('gates the settings routes', () => {
    expect(routeGate('/settings/profile')).toEqual(['schoolAccount:read']);
    expect(routeGate('/settings/admissions')).toEqual(['schoolAccount:read']);
    expect(routeGate('/settings/danger')).toEqual([
      'organization:delete',
      'organization:update',
    ]);
    expect(routeGate('/roles')).toEqual(['ac:read']);
    expect(routeGate('/roles/new')).toEqual(['ac:create']);
  });

  it('names the breadcrumb Settings › item, or All sections on the index', () => {
    expect(settingsTrail('/settings')).toEqual({
      group: 'Settings',
      title: 'All sections',
    });
    expect(settingsTrail('/settings/admissions')).toEqual({
      group: 'Settings',
      title: 'Admissions rules',
    });
    expect(settingsTrail('/roles/new')?.title).toBe('Roles and permissions');
    expect(settingsTrail('/students')).toBeUndefined();
  });
});

describe('nav gates', () => {
  it('shows a member with no permissions only Dashboard and Approvals', () => {
    expect(routesFor({})).toEqual(['/', '/approvals']);
  });

  it('shows Announcements only with announcement:read', () => {
    expect(routesFor({})).not.toContain('/announcements');
    expect(routesFor(starter('bursar'))).not.toContain('/announcements');
    expect(routesFor(starter('teacher'))).not.toContain('/announcements');
    expect(routesFor(starter('administrator'))).toContain('/announcements');
    expect(routesFor(starter('principal'))).toContain('/announcements');
    expect(routesFor(toPermissionMap(['announcement:read']))).toContain(
      '/announcements'
    );
    expect(routesFor(toPermissionMap(['announcement:update']))).not.toContain(
      '/announcements'
    );
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
    expect(routeGate('/announcements')).toEqual(['announcement:read']);
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
    expect(current('/calendar')).toBe('settings');
    expect(current('/roles/7')).toBe('settings');
    expect(current('/settings')).toBe('settings');
    expect(current('/settings/danger')).toBe('settings');
  });

  it('does not match a path that only shares a prefix', () => {
    expect(current('/students-archive')).toBeUndefined();
  });

  it('reports the group so the breadcrumb can name it', () => {
    expect(findCurrent(groups, '/fees')?.group.label).toBe('Finance');
  });
});

describe('settingsLanding', () => {
  it('opens School profile for someone who can read it', () => {
    expect(settingsLanding(built, everything)).toEqual({
      kind: 'redirect',
      to: '/settings/profile',
    });
    expect(settingsLanding(built, starter('administrator'))).toEqual({
      kind: 'redirect',
      to: '/settings/profile',
    });
  });

  it('lists what a principal can open instead', () => {
    const landing = settingsLanding(built, starter('principal'));
    expect(landing.kind).toBe('list');
    expect(
      landing.kind === 'list' && landing.items.map((item) => item.label)
    ).toEqual(['Campuses', 'Levels']);
  });

  it('sends someone with no settings item to the dashboard', () => {
    expect(settingsLanding(built, starter('bursar'))).toEqual({
      kind: 'redirect',
      to: '/',
    });
  });

  it('lists School years and terms for someone with session:read only', () => {
    const landing = settingsLanding(built, { session: ['read'] });

    expect(landing.kind).toBe('list');
    expect(
      landing.kind === 'list' && landing.items.map((item) => item.label)
    ).toEqual(['School years and terms']);
  });
});
