import { Link } from '@tanstack/react-router';
import { useCanAny } from '@eduvault/auth-client';
import { FINANCE_READ_GATE, type Gate } from '@eduvault/policy';
import { NO_ACCOUNT_FILTERS } from '../../accounts-search';
import { searchFor } from '../../route-search-defaults';

const TAB =
  'rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground';
const ACTIVE = { className: 'bg-muted text-foreground' };

type FeeTab =
  | {
      id: string;
      label: string;
      to: '/finance/accounts';
      gate: Gate;
    }
  | {
      id: string;
      label: string;
      to: '/finance/school-fees' | '/finance/other-fees';
      gate: Gate;
    }
  | {
      id: string;
      label: string;
      to: '/finance/billing' | '/finance/invoices';
      gate: Gate;
    };

export const FEE_TABS: readonly FeeTab[] = [
  {
    id: 'accounts',
    label: 'Who owes',
    to: '/finance/accounts',
    gate: FINANCE_READ_GATE,
  },
  {
    id: 'school-fees',
    label: 'School fees',
    to: '/finance/school-fees',
    gate: ['feeLine:read'],
  },
  {
    id: 'other-fees',
    label: 'Other fees',
    to: '/finance/other-fees',
    gate: ['feeLine:read'],
  },
  {
    id: 'billing',
    label: 'Charge students',
    to: '/finance/billing',
    gate: ['invoice:bill', 'invoice:read'],
  },
  {
    id: 'invoices',
    label: 'Charges',
    to: '/finance/invoices',
    gate: ['invoice:read'],
  },
];

function Tab({ tab, term }: { tab: FeeTab; term: string | undefined }) {
  const allowed = useCanAny(tab.gate);
  if (!allowed) {
    return null;
  }
  if (tab.to === '/finance/accounts') {
    return (
      <Link
        to={tab.to}
        search={NO_ACCOUNT_FILTERS}
        className={TAB}
        activeProps={ACTIVE}
      >
        {tab.label}
      </Link>
    );
  }
  if (tab.to === '/finance/billing' || tab.to === '/finance/invoices') {
    return (
      <Link
        to={tab.to}
        search={searchFor(tab.to)}
        className={TAB}
        activeProps={ACTIVE}
      >
        {tab.label}
      </Link>
    );
  }
  return (
    <Link
      to={tab.to}
      search={{ term, type: undefined, add: undefined }}
      className={TAB}
      activeProps={ACTIVE}
    >
      {tab.label}
    </Link>
  );
}

export function FeesTabs({ term }: { term: string | undefined }) {
  return (
    <nav aria-label="Fees" className="flex gap-1">
      {FEE_TABS.map((tab) => (
        <Tab key={tab.id} tab={tab} term={term} />
      ))}
    </nav>
  );
}
