import type { BalanceFilter, StudentLife } from '@eduvault/api-contract';

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
