import { ALL_PERMISSIONS, PERM_HELP, SENSITIVE, permLabel } from './index';

describe('permLabel', () => {
  it('splits camelCase actions into words', () => {
    expect(permLabel('campus:readAll')).toBe('Campus reach: read all');
    expect(permLabel('student:create')).toBe('Students: create');
    expect(permLabel('team:read')).toBe('Campuses: read');
    expect(permLabel('member:create')).toBe('Staff: create');
  });
});

describe('statements', () => {
  it.each([
    'student:delete',
    'subject:delete',
    'class:delete',
    'announcement:delete',
    'session:delete',
    'schoolAccount:create',
    'schoolAccount:delete',
  ])('has no %s permission', (permission) => {
    expect(ALL_PERMISSIONS).not.toContain(permission);
  });

  it('marks exactly these permissions sensitive, so a new one is a reviewed decision', () => {
    expect(SENSITIVE.toSorted((a, b) => a.localeCompare(b))).toEqual([
      'ac:create',
      'ac:delete',
      'ac:update',
      'campus:readAll',
      'ledger:manageAccounts',
      'member:create',
      'member:delete',
      'organization:delete',
      'organization:update',
    ]);
  });

  it('lists the wallet actions and explains each one', () => {
    const wallet = ALL_PERMISSIONS.filter((permission) =>
      permission.startsWith('wallet:')
    );
    expect(wallet).toEqual([
      'wallet:read',
      'wallet:readOwn',
      'wallet:topUp',
      'wallet:spend',
      'wallet:requestRefund',
      'wallet:approveRefund',
      'wallet:manageGateway',
      'wallet:migrateCredit',
    ]);
    for (const permission of wallet) {
      expect(PERM_HELP[permission]).toMatch(/\S/);
    }
    expect(permLabel('wallet:topUp')).toBe('Wallets: top up');
  });

  it('keeps SENSITIVE and PERM_HELP to listed permissions', () => {
    for (const permission of SENSITIVE) {
      expect(ALL_PERMISSIONS).toContain(permission);
    }
    for (const permission of Object.keys(PERM_HELP)) {
      expect(ALL_PERMISSIONS).toContain(permission);
    }
  });
});
