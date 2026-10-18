import {
  keepPreviousData,
  queryOptions,
  type QueryClient,
  type QueryExecuteOptions,
  type QueryKey,
} from '@tanstack/react-query';
import type { Api } from './api';

const ME_PERMISSIONS_KEY = ['me', 'permissions'] as const;
const PORTAL_KEY = ['portal'] as const;
const CALENDAR_KEY = ['calendar'] as const;

export const mePermissionsQueryOptions = (api: Api) =>
  queryOptions({
    queryKey: ME_PERMISSIONS_KEY,
    queryFn: () => api.me.permissions({}),
    staleTime: 60_000,
    refetchOnWindowFocus: 'always',
  });

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
      termId ?? 'all',
      page ?? 'last',
    ],
    queryFn: () =>
      api.portal.statement({
        params: { studentId },
        query: {
          ...(page === undefined ? {} : { page }),
          ...(termId === undefined ? {} : { termId }),
        },
      }),
    placeholderData: keepPreviousData,
  });

export const portalFamilyStatementQueryOptions = (api: Api) =>
  queryOptions({
    queryKey: [...PORTAL_KEY, 'family-statement'],
    queryFn: () => api.portal.familyStatement({}),
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
