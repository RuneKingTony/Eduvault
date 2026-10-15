import type { LedgerAccountType } from '@eduvault/api-contract';

const HIDDEN_KEYS: ReadonlySet<string> = new Set([
  'customer_credit_refunds',
  'other_charges',
]);
const CODE_STEP = 10;

export interface ChartAccount {
  id: string;
  code: number;
  name: string;
  type: LedgerAccountType;
  parentId: string | null;
  systemKey: string | null;
  debitMinor: number;
  creditMinor: number;
}

function childrenByParent(
  accounts: readonly ChartAccount[]
): Map<string | null, ChartAccount[]> {
  const children = new Map<string | null, ChartAccount[]>();
  for (const account of accounts) {
    const siblings = children.get(account.parentId) ?? [];
    siblings.push(account);
    children.set(account.parentId, siblings);
  }
  return children;
}

export function naturalBalance(
  type: LedgerAccountType,
  debitMinor: number,
  creditMinor: number
): number {
  return type === 'asset' || type === 'expense'
    ? debitMinor - creditMinor
    : creditMinor - debitMinor;
}

export function rollUpChart(accounts: readonly ChartAccount[]): ChartAccount[] {
  const childrenOf = childrenByParent(accounts);
  const totals = new Map<string, { debitMinor: number; creditMinor: number }>();
  const sumOf = (account: ChartAccount) => {
    const known = totals.get(account.id);
    if (known !== undefined) {
      return known;
    }
    const sum = {
      debitMinor: account.debitMinor,
      creditMinor: account.creditMinor,
    };
    for (const child of childrenOf.get(account.id) ?? []) {
      const below = sumOf(child);
      sum.debitMinor += below.debitMinor;
      sum.creditMinor += below.creditMinor;
    }
    totals.set(account.id, sum);
    return sum;
  };
  return accounts.map((account) => ({ ...account, ...sumOf(account) }));
}

export function visibleChart(
  accounts: readonly ChartAccount[]
): ChartAccount[] {
  const shown = accounts.filter(
    (account) =>
      account.systemKey === null || !HIDDEN_KEYS.has(account.systemKey)
  );
  const byCode = shown.toSorted((a, b) => a.code - b.code);
  const ids = new Set(byCode.map((account) => account.id));
  const childrenOf = childrenByParent(byCode);
  const walk = (account: ChartAccount): ChartAccount[] => [
    account,
    ...(childrenOf.get(account.id) ?? []).flatMap((child) => walk(child)),
  ];
  return byCode
    .filter(
      (account) => account.parentId === null || !ids.has(account.parentId)
    )
    .flatMap((account) => walk(account));
}

export function nextChildCode(
  parentCode: number,
  childCodes: readonly number[],
  takenCodes: readonly number[]
): number {
  const taken = new Set(takenCodes);
  let code = Math.max(parentCode, ...childCodes) + CODE_STEP;
  while (taken.has(code)) {
    code += CODE_STEP;
  }
  return code;
}
