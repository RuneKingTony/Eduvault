import { platformRoles } from './platform-access';

describe('platformRoles', () => {
  it('lets the super admin look users up, ban them and end sessions', () => {
    const { superadmin } = platformRoles;
    expect(superadmin.authorize({ user: ['list'] }).success).toBe(true);
    expect(superadmin.authorize({ user: ['get'] }).success).toBe(true);
    expect(superadmin.authorize({ user: ['ban'] }).success).toBe(true);
    expect(superadmin.authorize({ session: ['revoke'] }).success).toBe(true);
  });

  it('keeps impersonation, account creation and role changes out of reach', () => {
    const { superadmin } = platformRoles;
    const reachable = [
      'create',
      'set-role',
      'impersonate',
      'impersonate-admins',
      ...['password', 'email'].map((field) => `set-${field}`),
      'delete',
      'update',
    ].filter(
      (action) =>
        superadmin.authorize({
          user: [action as 'create'],
        }).success
    );
    expect(reachable).toEqual([]);
    expect(superadmin.authorize({ session: ['delete'] }).success).toBe(false);
  });

  it('gives an ordinary user no platform permission', () => {
    const { user } = platformRoles;
    expect(user.authorize({ user: ['create'] }).success).toBe(false);
    expect(user.authorize({ user: ['set-role'] }).success).toBe(false);
    expect(user.authorize({ user: ['list'] }).success).toBe(false);
    expect(user.authorize({ session: ['list'] }).success).toBe(false);
  });
});
