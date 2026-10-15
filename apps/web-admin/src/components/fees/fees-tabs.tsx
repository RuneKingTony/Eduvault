import { Link } from '@tanstack/react-router';
import { useCanAny } from '@eduvault/auth-client';
import type { Gate } from '@eduvault/policy';

const TAB =
  'rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground';
const ACTIVE = { className: 'bg-muted text-foreground' };

interface FeeTab {
  id: string;
  label: string;
  to: '/finance/school-fees' | '/finance/other-fees';
  gate: Gate;
}

export const FEE_TABS: readonly FeeTab[] = [
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
];

function Tab({ tab, term }: { tab: FeeTab; term: string | undefined }) {
  const allowed = useCanAny(tab.gate);
  return allowed ? (
    <Link
      to={tab.to}
      search={{ term, type: undefined, add: undefined }}
      className={TAB}
      activeProps={ACTIVE}
    >
      {tab.label}
    </Link>
  ) : null;
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
