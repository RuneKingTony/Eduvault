import type {
  BalanceFilter,
  StatementRowStatus,
  StudentLife,
} from '@eduvault/api-contract';
import { money } from '@eduvault/shared';

export const ROW_STATUS_LABELS: Record<StatementRowStatus, string> = {
  charged: 'Charged',
  paid: 'Paid',
  reduced: 'Reduced',
  cancelled: 'Payment cancelled',
  refunded: 'Refunded',
};

export const isOwingRow = (status: StatementRowStatus): boolean =>
  status === 'charged' || status === 'cancelled' || status === 'refunded';

export const FILTER_LABELS: Record<BalanceFilter, string> = {
  owing: 'Owing',
  owing_current: 'Owing: current students',
  owing_gone: 'Owing: left or graduated',
  paid: 'Paid up',
  all: 'Everyone',
};

export function lifeSuffix(life: StudentLife): string {
  return life === 'active' ? '' : ` · ${life}`;
}

interface Tile {
  label: string;
  value: string;
}

export function balanceTile(balanceMinor: number, currency: string): Tile {
  if (balanceMinor < 0) {
    return { label: 'Extra paid', value: money(-balanceMinor, currency) };
  }
  return {
    label: 'Owing',
    value: balanceMinor === 0 ? 'Nothing' : money(balanceMinor, currency),
  };
}

export function entriesFooter(balanceMinor: number, currency: string): Tile {
  if (balanceMinor > 0) {
    return { label: 'Owing now', value: money(balanceMinor, currency) };
  }
  if (balanceMinor < 0) {
    return { label: 'Extra paid', value: money(-balanceMinor, currency) };
  }
  return { label: 'Nothing owing', value: money(0, currency) };
}

export const creditCallout = (creditMinor: number, currency: string): string =>
  `${money(creditMinor, currency)} was paid in extra. It is taken off the next fees automatically, or you can pay it back.`;

export function familyTotalSubline(
  owedMinor: number,
  creditMinor: number,
  currency: string
): string {
  const base = owedMinor > 0 ? 'Owed across all children' : 'Nothing owed';
  return creditMinor > 0
    ? `${base} · ${money(creditMinor, currency)} extra paid kept separately`
    : base;
}

export const familyDescription = (children: number): string =>
  `${children} children. Each keeps their own account; this view combines them.`;
