import {
  NAV_GROUPS,
  findCurrent,
  visibleNav,
  visibleSettings,
  SETTINGS_SECTIONS,
} from './nav';

const built = new Set(['/', '/students', '/fees', '/campuses']);

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
    const groups = visibleNav(NAV_GROUPS, built);
    expect(
      groups.flatMap((group) => group.items.map((item) => item.route))
    ).toEqual(['/', '/students', '/fees', '/campuses']);
  });

  it('drops a group left with no items and keeps Settings last and unlabelled', () => {
    const groups = visibleNav(NAV_GROUPS, built);
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
      visibleSettings(SETTINGS_SECTIONS, built).map((section) => section.label)
    ).toEqual(['Campuses']);
    expect(visibleSettings(SETTINGS_SECTIONS, new Set(['/']))).toEqual([]);
  });
});

describe('findCurrent', () => {
  const groups = visibleNav(NAV_GROUPS, built);
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
