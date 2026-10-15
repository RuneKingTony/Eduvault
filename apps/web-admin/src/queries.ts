import {
  keepPreviousData,
  queryOptions,
  type QueryClient,
} from '@tanstack/react-query';
import type {
  AnnouncementStatus,
  ClassStatus,
  FeeGroup,
  RouteQuery,
  contract,
} from '@eduvault/api-contract';
import type { ActingState } from './acting-store';
import type { Api } from './api';
import type { MembersSearch } from './members-search';
import type { StudentsSearch } from './students-search';

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

const STUDENTS_KEY = ['students'] as const;

export const studentsQueryOptions = (
  api: Api,
  {
    tab = 'active',
    q,
    campusId,
    levelId,
    page = 1,
  }: Omit<StudentsSearch, 'admit'>
) =>
  queryOptions({
    queryKey: [...STUDENTS_KEY, 'list', { tab, q, campusId, levelId, page }],
    queryFn: () =>
      api.students.list({ query: { tab, q, campusId, levelId, page } }),
    placeholderData: keepPreviousData,
  });

export const studentQueryOptions = (api: Api, id: string) =>
  queryOptions({
    queryKey: [...STUDENTS_KEY, 'one', id],
    queryFn: () => api.students.get({ params: { id } }),
  });

export const nextTermClassesQueryOptions = (api: Api, id: string) =>
  queryOptions({
    queryKey: [...STUDENTS_KEY, 'next-term-classes', id],
    queryFn: () => api.students.nextTermClasses({ params: { id } }),
  });

export const studentGuardiansQueryOptions = (api: Api, id: string) =>
  queryOptions({
    queryKey: [...STUDENTS_KEY, 'guardians', id],
    queryFn: () => api.students.guardians({ params: { id } }),
  });

export const admissionPreviewQueryOptions = (api: Api) =>
  queryOptions({
    queryKey: [...STUDENTS_KEY, 'admission-preview'],
    queryFn: () => api.admissions.preview({}),
    gcTime: 0,
  });

export const newSchoolYearQueryOptions = (api: Api) =>
  queryOptions({
    queryKey: [...STUDENTS_KEY, 'new-school-year'],
    queryFn: () => api.students.newSchoolYearPreview({}),
    gcTime: 0,
  });

export const guardiansQueryOptions = (
  api: Api,
  query: { q?: string; excludeStudentId?: string }
) =>
  queryOptions({
    queryKey: [
      'guardians',
      'list',
      query.q ?? '',
      query.excludeStudentId ?? '',
    ],
    queryFn: () => api.guardians.list({ query }),
  });

export const guardianQueryOptions = (api: Api, id: string) =>
  queryOptions({
    queryKey: ['guardians', 'one', id],
    queryFn: () => api.guardians.get({ params: { id } }),
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

const SCHOOL_YEARS_KEY = ['school-years'] as const;
const CALENDAR_KEY = ['calendar'] as const;

export const schoolYearsQueryOptions = (api: Api, page: number) =>
  queryOptions({
    queryKey: [...SCHOOL_YEARS_KEY, 'list', page],
    queryFn: () => api.schoolYears.list({ query: { page } }),
    placeholderData: keepPreviousData,
  });

export const currentTermQueryOptions = (api: Api) =>
  queryOptions({
    queryKey: [...CALENDAR_KEY, 'current'],
    queryFn: () => api.calendar.current({}),
  });

const DASHBOARD_KEY = ['dashboard'] as const;
const ACTIVITY_KEY = ['activity'] as const;

export const dashboardTasksQueryOptions = (api: Api) =>
  queryOptions({
    queryKey: [...DASHBOARD_KEY, 'tasks'],
    queryFn: () => api.dashboard.tasks({}),
  });

export const dashboardRollQueryOptions = (api: Api) =>
  queryOptions({
    queryKey: [...DASHBOARD_KEY, 'roll'],
    queryFn: () => api.dashboard.roll({}),
  });

export const myClassesQueryOptions = (api: Api) =>
  queryOptions({
    queryKey: [...DASHBOARD_KEY, 'my-classes'],
    queryFn: () => api.dashboard.myClasses({}),
  });

export const activityQueryOptions = (api: Api, page: number) =>
  queryOptions({
    queryKey: [...ACTIVITY_KEY, page],
    queryFn: () => api.activity.list({ query: { page } }),
    placeholderData: keepPreviousData,
  });

export const daysOffQueryOptions = (api: Api, limit: number) =>
  queryOptions({
    queryKey: [...CALENDAR_KEY, 'days-off', limit],
    queryFn: () => api.calendar.daysOff({ query: { limit } }),
  });

export async function invalidateCalendar(
  queryClient: QueryClient
): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: SCHOOL_YEARS_KEY }),
    queryClient.invalidateQueries({ queryKey: CALENDAR_KEY }),
  ]);
}

const ANNOUNCEMENTS_KEY = ['announcements'] as const;

export const announcementsQueryOptions = (
  api: Api,
  status: AnnouncementStatus,
  page: number
) =>
  queryOptions({
    queryKey: [...ANNOUNCEMENTS_KEY, 'list', status, page],
    queryFn: () => api.announcements.list({ query: { status, page } }),
    placeholderData: keepPreviousData,
  });

export const announcementFeedQueryOptions = (api: Api, limit: number) =>
  queryOptions({
    queryKey: [...ANNOUNCEMENTS_KEY, 'feed', limit],
    queryFn: () => api.announcements.feed({ query: { limit } }),
  });

export async function invalidateAnnouncements(
  queryClient: QueryClient
): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ANNOUNCEMENTS_KEY }),
    queryClient.invalidateQueries({ queryKey: [...DASHBOARD_KEY, 'tasks'] }),
    queryClient.invalidateQueries({ queryKey: ACTIVITY_KEY }),
  ]);
}

const CLASS_LEVELS_KEY = ['class-levels'] as const;
const CLASSES_KEY = ['classes'] as const;

export const classLevelsQueryOptions = (api: Api) =>
  queryOptions({
    queryKey: CLASS_LEVELS_KEY,
    queryFn: () => api.classLevels.list({}),
  });

export const classesQueryOptions = (api: Api, status: ClassStatus) =>
  queryOptions({
    queryKey: [...CLASSES_KEY, 'list', status],
    queryFn: () => api.classes.list({ query: { status } }),
  });

export const classQueryOptions = (api: Api, id: string) =>
  queryOptions({
    queryKey: [...CLASSES_KEY, 'one', id],
    queryFn: () => api.classes.get({ params: { id } }),
  });

export const teacherCandidatesQueryOptions = (api: Api, id: string) =>
  queryOptions({
    queryKey: [...CLASSES_KEY, 'candidates', id],
    queryFn: () => api.classes.teacherCandidates({ params: { id } }),
  });

export async function invalidateLevels(
  queryClient: QueryClient
): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: CLASS_LEVELS_KEY }),
    queryClient.invalidateQueries({ queryKey: CLASSES_KEY }),
  ]);
}

export async function invalidateClasses(
  queryClient: QueryClient
): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: CLASSES_KEY }),
    queryClient.invalidateQueries({ queryKey: CAMPUSES_KEY }),
  ]);
}

export async function invalidateClassTeachers(
  queryClient: QueryClient
): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: CLASSES_KEY }),
    queryClient.invalidateQueries({ queryKey: ME_PERMISSIONS_KEY }),
    queryClient.invalidateQueries({ queryKey: DASHBOARD_KEY }),
  ]);
}

/** A student write can change the roll, the class lists and the campus counts. */
export async function invalidateStudents(
  queryClient: QueryClient
): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: STUDENTS_KEY }),
    queryClient.invalidateQueries({ queryKey: ['guardians'] }),
    queryClient.invalidateQueries({ queryKey: CLASSES_KEY }),
    queryClient.invalidateQueries({ queryKey: CAMPUSES_KEY }),
    queryClient.invalidateQueries({ queryKey: DASHBOARD_KEY }),
    queryClient.invalidateQueries({ queryKey: ACTIVITY_KEY }),
  ]);
}

export async function invalidateYearStart(
  queryClient: QueryClient
): Promise<void> {
  await Promise.all([
    invalidateStudents(queryClient),
    invalidateCalendar(queryClient),
  ]);
}

const MONEY_ACCOUNTS_KEY = ['money-accounts'] as const;
const LEDGER_KEY = ['ledger'] as const;

type JournalFilters = Partial<
  Pick<RouteQuery<typeof contract.journal.list>, 'from' | 'to' | 'kind'>
> & { page?: number };

export const moneyAccountsQueryOptions = (api: Api) =>
  queryOptions({
    queryKey: [...MONEY_ACCOUNTS_KEY, 'list'],
    queryFn: () => api.moneyAccounts.list({}),
  });

export const cashBookQueryOptions = (api: Api, id: string, page: number) =>
  queryOptions({
    queryKey: [...MONEY_ACCOUNTS_KEY, 'cash-book', id, page],
    queryFn: () =>
      api.moneyAccounts.cashBook({ params: { id }, query: { page } }),
    placeholderData: keepPreviousData,
  });

export const ledgerAccountsQueryOptions = (api: Api) =>
  queryOptions({
    queryKey: [...LEDGER_KEY, 'accounts'],
    queryFn: () => api.ledgerAccounts.list({}),
  });

export const journalQueryOptions = (
  api: Api,
  { from, to, kind, page = 1 }: JournalFilters = {}
) =>
  queryOptions({
    queryKey: [...LEDGER_KEY, 'journal', { from, to, kind, page }],
    queryFn: () => api.journal.list({ query: { from, to, kind, page } }),
    placeholderData: keepPreviousData,
  });

export const dashboardMoneyQueryOptions = (api: Api) =>
  queryOptions({
    queryKey: [...DASHBOARD_KEY, 'money'],
    queryFn: () => api.dashboard.money({}),
  });

/** A money account is also a ledger account, so the chart and journal move with it. */
export async function invalidateMoneyAccounts(
  queryClient: QueryClient
): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: MONEY_ACCOUNTS_KEY }),
    queryClient.invalidateQueries({ queryKey: LEDGER_KEY }),
    queryClient.invalidateQueries({
      queryKey: [...DASHBOARD_KEY, 'money'],
    }),
  ]);
}

export async function invalidateLedger(
  queryClient: QueryClient
): Promise<void> {
  await queryClient.invalidateQueries({ queryKey: LEDGER_KEY });
}

const FEES_KEY = ['fees'] as const;

export const feeCandidatesQueryOptions = (
  api: Api,
  termId: string,
  q: string
) =>
  queryOptions({
    queryKey: [...STUDENTS_KEY, 'fee-candidates', termId, q],
    queryFn: () =>
      api.feeLines.candidates({
        query: { termId, q: q === '' ? undefined : q },
      }),
    placeholderData: keepPreviousData,
  });

export const feeLinesQueryOptions = (
  api: Api,
  termId: string,
  group: FeeGroup
) =>
  queryOptions({
    queryKey: [...FEES_KEY, 'lines', termId, group],
    queryFn: () => api.feeLines.list({ query: { termId, group } }),
  });

export const feeGridQueryOptions = (
  api: Api,
  query: { termId: string; group: FeeGroup; feeTypeId?: string }
) =>
  queryOptions({
    queryKey: [
      ...FEES_KEY,
      'grid',
      query.termId,
      query.group,
      query.feeTypeId ?? '',
    ],
    queryFn: () => api.feeLines.grid({ query }),
  });

export const feeTypesQueryOptions = (api: Api) =>
  queryOptions({
    queryKey: [...FEES_KEY, 'types'],
    queryFn: () => api.feeTypes.list({}),
  });

export const feePreviewQueryOptions = (
  api: Api,
  termId: string,
  studentId: string
) =>
  queryOptions({
    queryKey: [...FEES_KEY, 'preview', termId, studentId],
    queryFn: () => api.feeLines.preview({ query: { termId, studentId } }),
  });

export const feeOptionsQueryOptions = (api: Api, studentId: string) =>
  queryOptions({
    queryKey: [...FEES_KEY, 'options', studentId],
    queryFn: () => api.feeOptions.list({ params: { studentId }, query: {} }),
  });

export async function invalidateFees(queryClient: QueryClient): Promise<void> {
  await queryClient.invalidateQueries({ queryKey: FEES_KEY });
}
