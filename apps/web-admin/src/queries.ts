import {
  keepPreviousData,
  queryOptions,
  type QueryClient,
} from '@tanstack/react-query';
import type { RouteQuery, contract } from '@eduvault/api-contract';
import type { ActingState } from './acting-store';
import type { Api } from './api';
import type { MembersSearch } from './members-search';

export const ME_PERMISSIONS_KEY = ['me', 'permissions'] as const;
export const PLATFORM_SCHOOLS_KEY = ['platform', 'schools'] as const;
const PLATFORM_AUDIT_KEY = ['platform', 'audit'] as const;

export const invalidatePlatform = (queryClient: QueryClient) =>
  Promise.all([
    queryClient.invalidateQueries({ queryKey: PLATFORM_SCHOOLS_KEY }),
    queryClient.invalidateQueries({ queryKey: PLATFORM_AUDIT_KEY }),
  ]);

type SchoolListQuery = RouteQuery<typeof contract.platform.schools.list>;
type AuditQuery = Partial<RouteQuery<typeof contract.platform.audit.list>>;

export const platformSchoolsQueryOptions = (
  api: Api,
  query: SchoolListQuery = {}
) =>
  queryOptions({
    queryKey: [
      ...PLATFORM_SCHOOLS_KEY,
      'list',
      query.q ?? '',
      query.cursor ?? '',
    ],
    queryFn: () => api.platform.schools.list({ query }),
  });

export const platformSchoolQueryOptions = (api: Api, schoolId: string) =>
  queryOptions({
    queryKey: [...PLATFORM_SCHOOLS_KEY, 'one', schoolId],
    queryFn: () => api.platform.schools.get({ params: { id: schoolId } }),
  });

export const platformMembersQueryOptions = (api: Api, schoolId: string) =>
  queryOptions({
    queryKey: [...PLATFORM_SCHOOLS_KEY, 'members', schoolId],
    queryFn: () => api.platform.schools.members({ params: { id: schoolId } }),
  });

export const platformAuditQueryOptions = (api: Api, query: AuditQuery = {}) =>
  queryOptions({
    queryKey: [
      ...PLATFORM_AUDIT_KEY,
      query.schoolId ?? '',
      query.writesOnly === true,
      query.kind ?? '',
      query.limit ?? '',
      query.cursor ?? '',
    ],
    queryFn: () => api.platform.audit.list({ query }),
  });

export const mePermissionsQueryOptions = (
  api: Api,
  acting: ActingState | null = null
) =>
  queryOptions({
    queryKey:
      acting === null
        ? ME_PERMISSIONS_KEY
        : [
            ...ME_PERMISSIONS_KEY,
            'acting',
            acting.organizationId,
            acting.reason !== null,
          ],
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
    queryKey: ['campuses', 'list'],
    queryFn: () => api.campuses.list({}),
  });

const CAMPUSES_KEY = ['campuses'] as const;

export const campusSummaryQueryOptions = (api: Api) =>
  queryOptions({
    queryKey: [...CAMPUSES_KEY, 'summary'],
    queryFn: () => api.campuses.summary({}),
  });

const SCHOOL_KEY = ['school'] as const;

export const schoolProfileQueryOptions = (api: Api) =>
  queryOptions({
    queryKey: [...SCHOOL_KEY, 'profile'],
    queryFn: () => api.schoolAccount.get({}),
  });

export const schoolSettingsQueryOptions = (api: Api) =>
  queryOptions({
    queryKey: [...SCHOOL_KEY, 'settings'],
    queryFn: () => api.schoolSettings.get({}),
  });

export const handoverCandidatesQueryOptions = (api: Api) =>
  queryOptions({
    queryKey: [...SCHOOL_KEY, 'handover-candidates'],
    queryFn: () => api.school.handoverCandidates({}),
  });

export const deletableQueryOptions = (api: Api) =>
  queryOptions({
    queryKey: [...SCHOOL_KEY, 'deletable'],
    queryFn: () => api.school.deletable({}),
  });

export const invalidateSchool = (queryClient: QueryClient) =>
  queryClient.invalidateQueries({ queryKey: SCHOOL_KEY });

/** The campuses a member belongs to are part of their access, so a new campus refreshes it too. */
export const invalidateCampuses = (queryClient: QueryClient) =>
  Promise.all([
    queryClient.invalidateQueries({ queryKey: CAMPUSES_KEY }),
    queryClient.invalidateQueries({ queryKey: ME_PERMISSIONS_KEY }),
  ]);

export const feeSchedulesQueryOptions = (api: Api) =>
  queryOptions({
    queryKey: ['fee-schedules'],
    queryFn: () => api.feeSchedules.list({ query: {} }),
  });

const MEMBERS_KEY = ['members'] as const;

const memberKey = (id: string) => [...MEMBERS_KEY, id] as const;

export const membersQueryOptions = (
  api: Api,
  { q, role, page = 1 }: Pick<MembersSearch, 'q' | 'role' | 'page'>
) =>
  queryOptions({
    queryKey: [...MEMBERS_KEY, 'list', { q, role, page }],
    queryFn: () => api.members.list({ query: { q, role, page } }),
    placeholderData: keepPreviousData,
  });

export const memberQueryOptions = (api: Api, id: string) =>
  queryOptions({
    queryKey: memberKey(id),
    queryFn: () => api.members.get({ params: { id } }),
  });

export const schoolRolesQueryOptions = (api: Api) =>
  queryOptions({
    queryKey: [...MEMBERS_KEY, 'roles'],
    queryFn: () => api.members.roles({}),
  });

const ROLES_KEY = ['roles'] as const;

export const rolesQueryOptions = (api: Api) =>
  queryOptions({
    queryKey: [...ROLES_KEY, 'list'],
    queryFn: () => api.roles.list({}),
  });

export const roleQueryOptions = (api: Api, slug: string) =>
  queryOptions({
    queryKey: [...ROLES_KEY, 'one', slug],
    queryFn: () => api.roles.get({ params: { slug } }),
  });

/** A role write changes the catalogue the members pages read, and can change a holder's own access. */
export async function invalidateRoles(queryClient: QueryClient): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ROLES_KEY }),
    queryClient.invalidateQueries({ queryKey: [...MEMBERS_KEY, 'roles'] }),
    queryClient.invalidateQueries({ queryKey: ME_PERMISSIONS_KEY }),
  ]);
}

/** The removed member's own query would answer 404 while their page is still open. */
export async function invalidateAfterRemoval(
  queryClient: QueryClient,
  memberId: string
): Promise<void> {
  await queryClient.invalidateQueries({
    queryKey: MEMBERS_KEY,
    predicate: (query) => query.queryKey[1] !== memberId,
  });
}

export function forgetMember(queryClient: QueryClient, memberId: string): void {
  queryClient.removeQueries({ queryKey: memberKey(memberId), exact: true });
}

export async function invalidateMembers(
  queryClient: QueryClient,
  editedSelf: boolean
): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: MEMBERS_KEY }),
    editedSelf
      ? queryClient.invalidateQueries({ queryKey: ME_PERMISSIONS_KEY })
      : undefined,
  ]);
}
