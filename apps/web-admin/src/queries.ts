import { queryOptions } from '@tanstack/react-query';
import type { Api } from './api';

export const ME_PERMISSIONS_KEY = ['me', 'permissions'] as const;
export const PLATFORM_SCHOOLS_KEY = ['platform', 'schools'] as const;

export const platformSchoolsQueryOptions = (api: Api) =>
  queryOptions({
    queryKey: PLATFORM_SCHOOLS_KEY,
    queryFn: () => api.platform.schools.list({}),
  });

export const mePermissionsQueryOptions = (api: Api) =>
  queryOptions({
    queryKey: ME_PERMISSIONS_KEY,
    queryFn: () => api.me.permissions({}),
    staleTime: 60_000,
    refetchOnWindowFocus: 'always',
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
