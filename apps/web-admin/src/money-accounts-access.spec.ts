import { toPermissionMap, type Permission } from '@eduvault/policy';
import { fakeAccess } from './test-utils';
import { moneyAccountsLanding } from './money-accounts-access';

const access = (...permissions: Permission[]) =>
  fakeAccess({ roles: ['custom'], permissions: toPermissionMap(permissions) });

describe('moneyAccountsLanding', () => {
  it('stays for a member who can read money accounts, with or without categories', () => {
    expect(moneyAccountsLanding(access('moneyAccount:read'))).toBe('stay');
    expect(
      moneyAccountsLanding(access('moneyAccount:read', 'ledger:read'))
    ).toBe('stay');
  });

  it('sends a ledger:read member without money accounts to the categories', () => {
    expect(moneyAccountsLanding(access('ledger:read'))).toBe('/finance/ledger');
  });

  it('stays for a member with neither, so the route gate can refuse them', () => {
    expect(moneyAccountsLanding(access('student:read'))).toBe('stay');
    expect(moneyAccountsLanding(null)).toBe('stay');
  });
});
