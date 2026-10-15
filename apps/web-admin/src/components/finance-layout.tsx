import type { ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { useCan } from '@eduvault/auth-client';

const TAB =
  'rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground';
const ACTIVE = { className: 'bg-muted text-foreground' };

export function FinanceLayout({ children }: { children: ReactNode }) {
  const canSeeAccounts = useCan('moneyAccount', 'read');
  const canSeeCategories = useCan('ledger', 'read');
  return (
    <div className="flex flex-col gap-4">
      {canSeeAccounts || canSeeCategories ? (
        <nav aria-label="Accounts" className="flex gap-1">
          {canSeeAccounts ? (
            <Link
              to="/finance/money-accounts"
              className={TAB}
              activeProps={ACTIVE}
            >
              Money accounts
            </Link>
          ) : null}
          {canSeeCategories ? (
            <Link
              to="/finance/ledger"
              search={{ tab: undefined }}
              className={TAB}
              activeProps={ACTIVE}
            >
              Money categories
            </Link>
          ) : null}
        </nav>
      ) : null}
      {children}
    </div>
  );
}
