import type { Wallet } from '@eduvault/api-contract';

/** What the Owing tile shows: the debts added up, or the credits added up (negative) when nothing is owed; one child's credit never offsets another's debt. */
export function familyBalanceMinor(children: Wallet['children']): number {
  const owed = children.reduce(
    (sum, child) => sum + Math.max(0, child.owedMinor),
    0
  );
  if (owed > 0) {
    return owed;
  }
  const credit = children.reduce(
    (sum, child) => sum + Math.max(0, -child.owedMinor),
    0
  );
  return credit === 0 ? 0 : -credit;
}
