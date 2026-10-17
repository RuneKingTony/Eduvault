import type { BalanceFilter, StudentLife } from '@eduvault/api-contract';

interface BalanceFilterRule {
  balance: 'owing' | 'settled' | 'any';
  lives: readonly StudentLife[] | null;
}

const CURRENT: readonly StudentLife[] = ['active', 'inactive'];
const GONE: readonly StudentLife[] = ['left', 'graduated'];

export function balanceFilterRule(filter: BalanceFilter): BalanceFilterRule {
  switch (filter) {
    case 'owing': {
      return { balance: 'owing', lives: null };
    }
    case 'owing_current': {
      return { balance: 'owing', lives: CURRENT };
    }
    case 'owing_gone': {
      return { balance: 'owing', lives: GONE };
    }
    case 'paid': {
      return { balance: 'settled', lives: null };
    }
    case 'all': {
      return { balance: 'any', lives: null };
    }
  }
}
