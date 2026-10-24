import {
  keepPreviousData,
  mutationOptions,
  queryOptions,
  type QueryClient,
  type QueryExecuteOptions,
  type QueryKey,
} from '@tanstack/react-query';
import type {
  EarmarkInput,
  SetAutoPayInput,
  SpendWalletInput,
} from '@eduvault/api-contract';
import { termKeyOf } from '@eduvault/shared';
import type { Api } from './api';

const PORTAL_KEY = ['portal'] as const;
const CALENDAR_KEY = ['calendar'] as const;
const WALLET_KEY = [...PORTAL_KEY, 'wallet'] as const;

export const portalMeQueryOptions = (api: Api) =>
  queryOptions({
    queryKey: [...PORTAL_KEY, 'me'],
    queryFn: () => api.portal.me({}),
  });

export const portalChildrenQueryOptions = (api: Api) =>
  queryOptions({
    queryKey: [...PORTAL_KEY, 'children'],
    queryFn: () => api.portal.children({}),
  });

export const portalStudentQueryOptions = (api: Api, studentId: string) =>
  queryOptions({
    queryKey: [...PORTAL_KEY, 'student', studentId],
    queryFn: () => api.portal.student({ params: { studentId } }),
  });

export const portalAnnouncementsQueryOptions = (api: Api, studentId: string) =>
  queryOptions({
    queryKey: [...PORTAL_KEY, 'announcements', studentId],
    queryFn: () =>
      api.portal.announcements({ params: { studentId }, query: {} }),
  });

export const ANNOUNCEMENTS_PAGE_SIZE = 10;

export const portalAnnouncementListQueryOptions = (
  api: Api,
  studentId: string,
  page: number
) =>
  queryOptions({
    queryKey: [...PORTAL_KEY, 'announcements', studentId, 'all', page],
    queryFn: () =>
      api.portal.announcementList({
        params: { studentId },
        query: { page, pageSize: ANNOUNCEMENTS_PAGE_SIZE },
      }),
    placeholderData: keepPreviousData,
  });

const termQueryOf = (termId: string | undefined) =>
  termId === undefined ? {} : { termId };

export const portalStatementQueryOptions = (
  api: Api,
  studentId: string,
  { page, termId }: { page?: number; termId?: string } = {}
) =>
  queryOptions({
    queryKey: [
      ...PORTAL_KEY,
      'statement',
      studentId,
      termKeyOf(termId),
      page ?? 'last',
    ],
    queryFn: () =>
      api.portal.statement({
        params: { studentId },
        query: {
          ...(page === undefined ? {} : { page }),
          ...termQueryOf(termId),
        },
      }),
    placeholderData: keepPreviousData,
  });

export const portalFamilyStatementQueryOptions = (
  api: Api,
  { termId }: { termId?: string } = {}
) =>
  queryOptions({
    queryKey: [...PORTAL_KEY, 'family-statement', termKeyOf(termId)],
    queryFn: () => api.portal.familyStatement({ query: termQueryOf(termId) }),
    placeholderData: keepPreviousData,
  });

export const portalPurchasesQueryOptions = (api: Api, studentId: string) =>
  queryOptions({
    queryKey: [...PORTAL_KEY, 'purchases', studentId],
    queryFn: () => api.portal.purchases({ params: { studentId } }),
  });

export const portalPriceListQueryOptions = (api: Api, studentId: string) =>
  queryOptions({
    queryKey: [...PORTAL_KEY, 'price-list', studentId],
    queryFn: () => api.portal.priceList({ params: { studentId } }),
  });

export const WALLET_MOVEMENTS_PAGE_SIZE = 10;

export const portalWalletQueryOptions = (api: Api) =>
  queryOptions({
    queryKey: WALLET_KEY,
    queryFn: () => api.portalWallet.get({}),
  });

export const portalWalletMovementsQueryOptions = (api: Api, page: number) =>
  queryOptions({
    queryKey: [...WALLET_KEY, 'movements', page],
    queryFn: () =>
      api.portalWallet.movements({
        query: { page, pageSize: WALLET_MOVEMENTS_PAGE_SIZE },
      }),
    placeholderData: keepPreviousData,
  });

/** Money that moves changes the wallet and its history, every child's statement, the family total and the balances on the children list. */
const invalidatePortalMoney = async (
  queryClient: QueryClient
): Promise<void> => {
  await Promise.all(
    [
      WALLET_KEY,
      [...PORTAL_KEY, 'statement'],
      [...PORTAL_KEY, 'family-statement'],
      [...PORTAL_KEY, 'children'],
    ].map((queryKey) => queryClient.invalidateQueries({ queryKey }))
  );
};

export const spendWalletMutationOptions = (
  api: Api,
  queryClient: QueryClient
) =>
  mutationOptions({
    mutationFn: (body: SpendWalletInput) => api.portalWallet.spend({ body }),
    onSuccess: () => invalidatePortalMoney(queryClient),
  });

export const setAsideMutationOptions = (api: Api, queryClient: QueryClient) =>
  mutationOptions({
    mutationFn: (body: EarmarkInput) => api.portalWallet.setAside({ body }),
    onSuccess: () => invalidatePortalMoney(queryClient),
  });

export const releaseMutationOptions = (api: Api, queryClient: QueryClient) =>
  mutationOptions({
    mutationFn: (body: EarmarkInput) => api.portalWallet.release({ body }),
    onSuccess: () => invalidatePortalMoney(queryClient),
  });

export const autoPayMutationOptions = (api: Api, queryClient: QueryClient) =>
  mutationOptions({
    mutationFn: (body: SetAutoPayInput) =>
      api.portalWallet.setAutoPay({ body }),
    onSuccess: () => invalidatePortalMoney(queryClient),
  });

export const calendarCurrentQueryOptions = (api: Api) =>
  queryOptions({
    queryKey: [...CALENDAR_KEY, 'current'],
    queryFn: () => api.calendar.current({}),
  });

const DAYS_OFF_LIMIT = 4;

export const daysOffQueryOptions = (api: Api) =>
  queryOptions({
    queryKey: [...CALENDAR_KEY, 'days-off', DAYS_OFF_LIMIT],
    queryFn: () => api.calendar.daysOff({ query: { limit: DAYS_OFF_LIMIT } }),
  });

export const prefetchStatic = <TData, TKey extends QueryKey>(
  queryClient: QueryClient,
  options: QueryExecuteOptions<TData, Error, TData, TData, TKey>
): Promise<void> =>
  queryClient.query({ ...options, staleTime: 'static' }).then(
    () => undefined,
    () => undefined
  );
