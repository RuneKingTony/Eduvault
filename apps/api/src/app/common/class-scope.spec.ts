import { toPermissionMap } from '@eduvault/policy';
import { computeClassScope, isClassScoped } from './class-scope';

describe('isClassScoped', () => {
  it('is true only for class:read without class:readAll', () => {
    expect(isClassScoped(toPermissionMap(['class:read']))).toBe(true);
    expect(
      isClassScoped(toPermissionMap(['class:read', 'class:readAll']))
    ).toBe(false);
    expect(isClassScoped(toPermissionMap(['student:read']))).toBe(false);
    expect(isClassScoped({})).toBe(false);
  });
});

describe('computeClassScope', () => {
  it('lets class:readAll see every class, whatever they teach', () => {
    const permissions = toPermissionMap(['class:read', 'class:readAll']);
    expect(computeClassScope(permissions, ['a'])).toBe('all');
  });

  it('does not bind a member with no class permission', () => {
    expect(computeClassScope(toPermissionMap(['student:read']), [])).toBe(
      'all'
    );
    expect(computeClassScope({}, ['a'])).toBe('all');
  });

  it('binds class:read alone to the classes they teach', () => {
    const permissions = toPermissionMap(['class:read']);
    expect(computeClassScope(permissions, ['a', 'b'])).toEqual(['a', 'b']);
  });

  it('is empty for class:read alone when they teach nothing, such as with no current term', () => {
    expect(computeClassScope(toPermissionMap(['class:read']), [])).toEqual([]);
  });

  it('copies the ids it is given', () => {
    const ids = ['a'];
    const scope = computeClassScope(toPermissionMap(['class:read']), ids);
    expect(scope).not.toBe(ids);
  });
});
