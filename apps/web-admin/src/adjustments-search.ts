import { ADJUSTMENT_KINDS, type AdjustmentKind } from '@eduvault/api-contract';
import { oneOf, pageOf, textOf } from '@eduvault/shared';

export const ADJUSTMENT_TABS = ['corrections', 'voids', 'discounts'] as const;
export type AdjustmentsTab = (typeof ADJUSTMENT_TABS)[number];

export interface AdjustmentsSearch {
  tab?: AdjustmentsTab;
  page?: number;
  new?: 1;
  kind?: AdjustmentKind;
  student?: string;
  amount?: number;
}

export const NO_ADJUSTMENT_SEARCH = {
  tab: undefined,
  page: undefined,
  new: undefined,
  kind: undefined,
  student: undefined,
  amount: undefined,
} as const satisfies AdjustmentsSearch;

const amountOf = (value: unknown): number | undefined => {
  const amount = Number(textOf(value));
  return Number.isSafeInteger(amount) && amount > 0 ? amount : undefined;
};

export function parseAdjustmentsSearch(
  search: Record<string, unknown>
): AdjustmentsSearch {
  const tab = oneOf(ADJUSTMENT_TABS, search['tab']);
  return {
    tab: tab === 'corrections' ? undefined : tab,
    page: pageOf(search['page']),
    new: textOf(search['new']) === '1' ? 1 : undefined,
    kind: oneOf(ADJUSTMENT_KINDS, search['kind']),
    student: textOf(search['student']),
    amount: amountOf(search['amount']),
  };
}

export const tabOf = (search: AdjustmentsSearch): AdjustmentsTab =>
  search.tab ?? 'corrections';
