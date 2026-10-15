import type { MePermissions } from '@eduvault/api-contract';
import { canAny } from '@eduvault/policy';

export function moneyAccountsLanding(
  access: MePermissions | null
): 'stay' | '/finance/ledger' {
  const permissions = access?.permissions ?? {};
  return canAny(permissions, ['moneyAccount:read']) ||
    !canAny(permissions, ['ledger:read'])
    ? 'stay'
    : '/finance/ledger';
}
