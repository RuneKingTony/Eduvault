import { toPermissionMap } from '@eduvault/policy';
import { PORTAL_NAV, isCurrent, visiblePortalNav } from './nav';

const BUILT = new Set(['/', '/children', '/fees']);
const readOwn = toPermissionMap(['student:readOwn']);
const readOwnFees = toPermissionMap(['student:readOwn', 'invoice:readOwn']);

const idsFor = (
  kind: 'student' | 'guardian',
  permissions = readOwn,
  builtRoutes: ReadonlySet<string> = BUILT
) =>
  visiblePortalNav(PORTAL_NAV, { builtRoutes, permissions, kind }).map(
    (entry) => entry.id
  );

describe('portal nav', () => {
  it('lists My children, Home, Fees then Purchases', () => {
    expect(PORTAL_NAV.map((entry) => [entry.label, entry.route])).toEqual([
      ['My children', '/children'],
      ['Home', '/'],
      ['Fees', '/fees'],
      ['Purchases', '/purchases'],
    ]);
  });

  it('gives a guardian My children, Home and Fees with invoice:readOwn', () => {
    expect(idsFor('guardian', readOwnFees)).toEqual([
      'children',
      'home',
      'fees',
    ]);
  });

  it('gives a student Home and Fees with invoice:readOwn', () => {
    expect(idsFor('student', readOwnFees)).toEqual(['home', 'fees']);
  });

  it('hides Fees without invoice:readOwn for both kinds', () => {
    expect(idsFor('guardian')).toEqual(['children', 'home']);
    expect(idsFor('student')).toEqual(['home']);
  });

  it('puts Fees behind invoice:readOwn', () => {
    expect(PORTAL_NAV.find((entry) => entry.id === 'fees')).toMatchObject({
      permission: 'invoice:readOwn',
    });
  });

  it('puts Purchases last, behind invoice:readOwn', () => {
    expect(PORTAL_NAV.at(-1)).toMatchObject({
      id: 'purchases',
      permission: 'invoice:readOwn',
    });
    expect(
      idsFor('guardian', readOwnFees, new Set(['/', '/purchases']))
    ).toEqual(['home', 'purchases']);
    expect(idsFor('guardian', readOwn, new Set(['/purchases']))).toEqual([]);
  });

  it('shows nothing without student:readOwn', () => {
    expect(idsFor('guardian', {})).toEqual([]);
    expect(idsFor('student', toPermissionMap(['student:read']))).toEqual([]);
  });

  it('keeps only the entries whose route exists', () => {
    expect(idsFor('guardian', readOwnFees, new Set(['/']))).toEqual(['home']);
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
