import { QueryClient } from '@tanstack/react-query';
import type { Api } from './api';
import {
  adjustmentsQueryOptions,
  approvalsSummaryQueryOptions,
  balancesQueryOptions,
  billingRunsQueryOptions,
  dashboardChargedQueryOptions,
  dashboardFinanceQueryOptions,
  dashboardMoneyQueryOptions,
  dashboardRollQueryOptions,
  dashboardStoreQueryOptions,
  dashboardTasksQueryOptions,
  feePreviewQueryOptions,
  invalidateApprovals,
  invalidateCharges,
  invalidateLeave,
  invalidatePayments,
  invalidateSale,
  invoicesQueryOptions,
  ledgerAccountsQueryOptions,
  memberLeaveQueryOptions,
  moneyAccountsQueryOptions,
  paymentsQueryOptions,
  classLevelsQueryOptions,
  statementQueryOptions,
  storeItemsQueryOptions,
} from './queries';

const api = {} as Api;

const VIEWS = {
  billingRuns: billingRunsQueryOptions(api, 1).queryKey,
  invoices: invoicesQueryOptions(api).queryKey,
  feePreview: feePreviewQueryOptions(api, 't', 's').queryKey,
  payments: paymentsQueryOptions(api).queryKey,
  adjustments: adjustmentsQueryOptions(api, 1).queryKey,
  approvals: approvalsSummaryQueryOptions(api).queryKey,
  balances: balancesQueryOptions(api).queryKey,
  statement: statementQueryOptions(api, 's1').queryKey,
  ledger: ledgerAccountsQueryOptions(api).queryKey,
  moneyAccounts: moneyAccountsQueryOptions(api).queryKey,
  homeTasks: dashboardTasksQueryOptions(api).queryKey,
  homeRoll: dashboardRollQueryOptions(api).queryKey,
  homeMoney: dashboardMoneyQueryOptions(api).queryKey,
  homeFinance: dashboardFinanceQueryOptions(api).queryKey,
  homeCharged: dashboardChargedQueryOptions(api).queryKey,
  homeStore: dashboardStoreQueryOptions(api).queryKey,
  storeItems: storeItemsQueryOptions(api).queryKey,
  leave: memberLeaveQueryOptions(api, 'u1').queryKey,
  levels: classLevelsQueryOptions(api).queryKey,
} as const;

type View = keyof typeof VIEWS;

const MONEY_VIEWS: View[] = [
  'payments',
  'adjustments',
  'approvals',
  'balances',
  'statement',
  'invoices',
  'homeTasks',
  'homeRoll',
  'homeMoney',
  'homeFinance',
  'ledger',
  'moneyAccounts',
];

const CHARGE_VIEWS: View[] = [
  'billingRuns',
  'invoices',
  'feePreview',
  'balances',
  'statement',
  'homeTasks',
  'homeRoll',
  'homeMoney',
  'homeFinance',
  'homeCharged',
  'ledger',
  'moneyAccounts',
];

const STORE_VIEWS: View[] = ['storeItems', 'homeStore'];

async function invalidatedBy(
  helper: (queryClient: QueryClient) => Promise<unknown>
): Promise<View[]> {
  const queryClient = new QueryClient();
  const names = Object.keys(VIEWS) as View[];
  for (const name of names) {
    queryClient.setQueryData([...VIEWS[name]], name);
  }
  await helper(queryClient);
  return names.filter(
    (name) => queryClient.getQueryState(VIEWS[name])?.isInvalidated === true
  );
}

describe('what each mutation helper refreshes', () => {
  it.each([
    {
      helper: 'invalidateCharges',
      run: invalidateCharges,
      covers: CHARGE_VIEWS,
    },
    {
      helper: 'invalidatePayments',
      run: invalidatePayments,
      covers: MONEY_VIEWS,
    },
    {
      helper: 'invalidateApprovals',
      run: invalidateApprovals,
      covers: [...MONEY_VIEWS, ...STORE_VIEWS],
    },
    {
      helper: 'invalidateSale',
      run: invalidateSale,
      covers: [...MONEY_VIEWS, ...STORE_VIEWS],
    },
    {
      helper: 'invalidateLeave',
      run: invalidateLeave,
      covers: ['leave', 'approvals', 'homeTasks'],
    },
  ] satisfies {
    helper: string;
    run: typeof invalidateCharges;
    covers: View[];
  }[])(
    '$helper refreshes every view that reads what it changes',
    async ({ run, covers }) => {
      const refreshed = await invalidatedBy(run);

      expect(covers.filter((name) => !refreshed.includes(name))).toEqual([]);
      expect(refreshed).not.toContain('levels');
    }
  );
});
