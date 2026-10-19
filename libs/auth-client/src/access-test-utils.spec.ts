import { STARTER_ROLES } from '@eduvault/policy';
import { accessOfStarter } from './access-test-utils';

describe('accessOfStarter', () => {
  it('gives a starter role the permissions the policy lists for it', () => {
    const access = accessOfStarter('guardian', []);

    expect(access.roles).toEqual(['guardian']);
    expect(access.permissions).toEqual({
      student: ['readOwn'],
      invoice: ['readOwn'],
      feeLine: ['readOwn'],
      payment: ['readOwn'],
    });
    expect(STARTER_ROLES.map((role) => role.slug)).toContain('guardian');
  });

  it('refuses an unknown slug instead of granting nothing', () => {
    expect(() => accessOfStarter('bursarr')).toThrow(
      'No starter role called bursarr'
    );
  });
});
