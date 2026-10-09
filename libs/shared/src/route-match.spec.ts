import { routeMatchLength } from './route-match';

describe('routeMatchLength', () => {
  it('matches the root only on the root path', () => {
    expect(routeMatchLength('/', '/')).toBe(1);
    expect(routeMatchLength('/', '/fees')).toBe(0);
  });

  it('matches a route and its sub-paths but not a sibling prefix', () => {
    expect(routeMatchLength('/fees', '/fees')).toBe(5);
    expect(routeMatchLength('/fees', '/fees/2026')).toBe(5);
    expect(routeMatchLength('/fees', '/fees-archive')).toBe(0);
  });
});
