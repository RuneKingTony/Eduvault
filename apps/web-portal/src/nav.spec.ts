import { PORTAL_NAV, isCurrent, visiblePortalNav } from './nav';

describe('portal nav', () => {
  it('lists Home then Fees', () => {
    expect(PORTAL_NAV.map((entry) => [entry.label, entry.route])).toEqual([
      ['Home', '/'],
      ['Fees', '/fees'],
    ]);
  });

  it('keeps only the entries whose route exists', () => {
    expect(
      visiblePortalNav(PORTAL_NAV, new Set(['/'])).map((entry) => entry.id)
    ).toEqual(['home']);
  });

  it('marks Home only on the root and Fees on its sub-pages', () => {
    const [home, fees] = PORTAL_NAV;
    expect(isCurrent(home!, '/')).toBe(true);
    expect(isCurrent(home!, '/fees')).toBe(false);
    expect(isCurrent(fees!, '/fees/2026')).toBe(true);
    expect(isCurrent(fees!, '/fees-archive')).toBe(false);
  });
});
