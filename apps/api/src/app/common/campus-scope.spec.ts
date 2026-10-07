import { canSeeCampus } from './campus-scope';

describe('canSeeCampus', () => {
  it('lets school-wide scope see every campus', () => {
    expect(canSeeCampus('all', 'any')).toBe(true);
  });

  it('limits other roles to their campuses', () => {
    expect(canSeeCampus(['a', 'b'], 'a')).toBe(true);
    expect(canSeeCampus(['a', 'b'], 'c')).toBe(false);
    expect(canSeeCampus([], 'a')).toBe(false);
  });
});
