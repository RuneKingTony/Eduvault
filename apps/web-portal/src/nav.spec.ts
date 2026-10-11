import { toPermissionMap } from '@eduvault/policy';
import { PORTAL_NAV, isCurrent, visiblePortalNav } from './nav';

const BUILT = new Set(['/', '/children']);
const readOwn = toPermissionMap(['student:readOwn']);

const idsFor = (
  kind: 'student' | 'guardian',
  permissions = readOwn,
  builtRoutes: ReadonlySet<string> = BUILT
) =>
  visiblePortalNav(PORTAL_NAV, { builtRoutes, permissions, kind }).map(
    (entry) => entry.id
  );

describe('portal nav', () => {
  it('lists My children then Home', () => {
    expect(PORTAL_NAV.map((entry) => [entry.label, entry.route])).toEqual([
      ['My children', '/children'],
      ['Home', '/'],
    ]);
  });

  it('gives a guardian My children and Home', () => {
    expect(idsFor('guardian')).toEqual(['children', 'home']);
  });

  it('gives a student Home only', () => {
    expect(idsFor('student')).toEqual(['home']);
  });

  it('shows nothing without student:readOwn', () => {
    expect(idsFor('guardian', {})).toEqual([]);
    expect(idsFor('student', toPermissionMap(['student:read']))).toEqual([]);
  });

  it('keeps only the entries whose route exists', () => {
    expect(idsFor('guardian', readOwn, new Set(['/']))).toEqual(['home']);
  });

  it('gives My children a shorter label for the bottom bar', () => {
    expect(PORTAL_NAV.find((entry) => entry.id === 'children')).toMatchObject({
      shortLabel: 'Children',
      icon: 'users-round',
    });
  });

  it('marks Home only on the root and My children on its sub-pages', () => {
    const [children, home] = PORTAL_NAV;
    expect(isCurrent(home!, '/')).toBe(true);
    expect(isCurrent(home!, '/children')).toBe(false);
    expect(isCurrent(children!, '/children')).toBe(true);
    expect(isCurrent(children!, '/children/ada')).toBe(true);
    expect(isCurrent(children!, '/children-archive')).toBe(false);
  });
});
