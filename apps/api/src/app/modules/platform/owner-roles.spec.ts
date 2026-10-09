import { ownerRoles } from './owner-roles';

describe('ownerRoles', () => {
  it('adds owner to a plain member', () => {
    expect(ownerRoles(['member'])).toEqual(['member', 'owner']);
  });

  it('strips administrator and principal', () => {
    expect(ownerRoles(['administrator', 'teacher', 'principal'])).toEqual([
      'teacher',
      'owner',
    ]);
  });

  it('adds owner once', () => {
    expect(ownerRoles(['owner', 'bursar'])).toEqual(['bursar', 'owner']);
    expect(ownerRoles([])).toEqual(['owner']);
  });
});
