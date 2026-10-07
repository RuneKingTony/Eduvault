import { queryOptions } from '@tanstack/react-query';
import type { Api } from './api';

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
