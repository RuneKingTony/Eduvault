import { queryOptions } from '@tanstack/react-query';
import type { Api } from './api';

export const ME_PERMISSIONS_KEY = ['me', 'permissions'] as const;

/** Stale after a minute and refetched on focus, so a role change shows up in the open app. */
export const mePermissionsQueryOptions = (api: Api) =>
  queryOptions({
    queryKey: ME_PERMISSIONS_KEY,
    queryFn: () => api.me.permissions({}),
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });

export const studentsQueryOptions = (api: Api) =>
  queryOptions({
    queryKey: ['students'],
    queryFn: () => api.students.list({ query: {} }),
  });

export const campusesQueryOptions = (api: Api) =>
  queryOptions({
    queryKey: ['campuses'],
    queryFn: () => api.campuses.list({}),
  });

export const feeSchedulesQueryOptions = (api: Api) =>
  queryOptions({
    queryKey: ['fee-schedules'],
    queryFn: () => api.feeSchedules.list({ query: {} }),
  });
