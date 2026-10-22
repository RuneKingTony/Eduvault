import {
  keepPreviousData,
  queryOptions,
  type QueryClient,
} from '@tanstack/react-query';
import {
  FINANCE_PAGE_SIZE_MAX,
  SUBJECT_PAGE_SIZE_MAX,
  type AnnouncementStatus,
  type BalanceFilter,
  type ClassStatus,
  type FeeGroup,
  type InvoiceKind,
  type InvoiceStatus,
  type ApprovalPillar,
  type ItemKind,
  type PaymentStatus,
  type RouteQuery,
  type contract,
} from '@eduvault/api-contract';
import { termKeyOf } from '@eduvault/shared';
import type { ActingState } from './acting-store';
import type { Api } from './api';
import type { MembersSearch } from './members-search';
import type { StudentsSearch } from './students-search';

export const ME_PERMISSIONS_KEY = ['me', 'permissions'] as const;
export const PLATFORM_SCHOOLS_KEY = ['platform', 'schools'] as const;
const PLATFORM_AUDIT_KEY = ['platform', 'audit'] as const;

export const invalidatePlatformSchools = (queryClient: QueryClient) =>
  queryClient.invalidateQueries({ queryKey: PLATFORM_SCHOOLS_KEY });

export const invalidatePlatform = (queryClient: QueryClient) =>
  Promise.all([
    invalidatePlatformSchools(queryClient),
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

export const invalidatePermissions = (queryClient: QueryClient) =>
  queryClient.invalidateQueries({ queryKey: ME_PERMISSIONS_KEY });

export const invalidateSchool = (queryClient: QueryClient) =>
  queryClient.invalidateQueries({ queryKey: SCHOOL_KEY });

/** The campuses a member belongs to are part of their access, so a new campus refreshes it too. */
export const invalidateCampuses = (queryClient: QueryClient) =>
  Promise.all([
    queryClient.invalidateQueries({ queryKey: CAMPUSES_KEY }),
    invalidatePermissions(queryClient),
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
    invalidatePermissions(queryClient),
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
    editedSelf ? invalidatePermissions(queryClient) : undefined,
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

type DashboardView =
  'tasks' | 'roll' | 'my-classes' | 'money' | 'finance' | 'charged' | 'store';

const dashboardKey = <View extends DashboardView>(view: View) =>
  [...DASHBOARD_KEY, view] as const;
const ACTIVITY_KEY = ['activity'] as const;

export const dashboardTasksQueryOptions = (api: Api) =>
  queryOptions({
    queryKey: dashboardKey('tasks'),
    queryFn: () => api.dashboard.tasks({}),
  });

export const dashboardRollQueryOptions = (api: Api) =>
  queryOptions({
    queryKey: dashboardKey('roll'),
    queryFn: () => api.dashboard.roll({}),
  });

export const myClassesQueryOptions = (api: Api) =>
  queryOptions({
    queryKey: dashboardKey('my-classes'),
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
    queryClient.invalidateQueries({ queryKey: dashboardKey('tasks') }),
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
    queryFn: () => api.classes.teacherCandidates({ params: { id }, query: {} }),
  });

export const subjectCandidatesQueryOptions = (api: Api, id: string) =>
  queryOptions({
    queryKey: [...CLASSES_KEY, 'subject-candidates', id],
    queryFn: () =>
      api.classes.teacherCandidates({
        params: { id },
        query: { for: 'subject' },
      }),
  });

const SUBJECTS_KEY = ['subjects'] as const;

export const subjectsQueryOptions = (api: Api, page: number) =>
  queryOptions({
    queryKey: [...SUBJECTS_KEY, 'list', page],
    queryFn: () => api.subjects.list({ query: { page } }),
  });

export const levelSubjectsQueryOptions = (api: Api) =>
  queryOptions({
    queryKey: [...SUBJECTS_KEY, 'levels'],
    queryFn: () => api.levelSubjects.list({ query: {} }),
  });

export const electivesQueryOptions = (api: Api) =>
  queryOptions({
    queryKey: [...SUBJECTS_KEY, 'electives'],
    queryFn: () => api.electives.list({ query: {} }),
  });

export const allActiveSubjectsQueryOptions = (api: Api) =>
  queryOptions({
    queryKey: [...SUBJECTS_KEY, 'active'],
    queryFn: () =>
      api.subjects.list({
        query: { includeRetired: 'false', pageSize: SUBJECT_PAGE_SIZE_MAX },
      }),
  });

export const subjectTeachersQueryOptions = (api: Api) =>
  queryOptions({
    queryKey: [...SUBJECTS_KEY, 'teachers'],
    queryFn: () => api.subjectTeachers.list({}),
  });

export async function invalidateSubjects(
  queryClient: QueryClient
): Promise<void> {
  await queryClient.invalidateQueries({ queryKey: SUBJECTS_KEY });
}

/** A level list or an elective save changes the By level cards and the class roster column. */
export async function invalidateLevelLists(
  queryClient: QueryClient
): Promise<void> {
  await Promise.all([
    invalidateSubjects(queryClient),
    queryClient.invalidateQueries({ queryKey: CLASSES_KEY }),
  ]);
}

export async function invalidateSubjectTeachers(
  queryClient: QueryClient
): Promise<void> {
  await Promise.all([
    invalidateSubjects(queryClient),
    invalidateClassTeachers(queryClient),
  ]);
}

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
    invalidatePermissions(queryClient),
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
    queryKey: dashboardKey('money'),
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
      queryKey: dashboardKey('money'),
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

export const feeSetupQueryOptions = (api: Api) =>
  queryOptions({
    queryKey: [...FEES_KEY, 'setup'],
    queryFn: () => api.feeLines.setup({}),
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

export const feeCopySourceQueryOptions = (api: Api, termId: string) =>
  queryOptions({
    queryKey: [...FEES_KEY, 'copy-source', termId],
    queryFn: () => api.feeLines.copySource({ query: { termId } }),
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

export const feeOptInsQueryOptions = (
  api: Api,
  query: { feeTypeId: string; termId: string; q: string }
) =>
  queryOptions({
    queryKey: [...FEES_KEY, 'opt-ins', query.feeTypeId, query.termId, query.q],
    queryFn: () =>
      api.feeOptIns.list({
        params: { feeTypeId: query.feeTypeId },
        query: { termId: query.termId, q: query.q },
      }),
    placeholderData: keepPreviousData,
  });

export async function invalidateFees(queryClient: QueryClient): Promise<void> {
  await queryClient.invalidateQueries({ queryKey: FEES_KEY });
}

async function resetFees(queryClient: QueryClient): Promise<void> {
  await queryClient.resetQueries({ queryKey: FEES_KEY });
}

export async function refreshForCurrentTerm(
  queryClient: QueryClient
): Promise<void> {
  await Promise.all([invalidateCalendar(queryClient), resetFees(queryClient)]);
}

const BILLING_KEY = ['billing'] as const;
const INVOICES_KEY = ['invoices'] as const;

interface InvoiceFilters {
  q?: string;
  kind?: InvoiceKind;
  status?: InvoiceStatus;
  page?: number;
}

export const billingRunsQueryOptions = (api: Api, page: number) =>
  queryOptions({
    queryKey: [...BILLING_KEY, 'runs', page],
    queryFn: () => api.billingRuns.list({ query: { page } }),
    placeholderData: keepPreviousData,
  });

export const billingTermsQueryOptions = (api: Api) =>
  queryOptions({
    queryKey: [...BILLING_KEY, 'terms'],
    queryFn: () => api.billingRuns.terms({}),
  });

export const billingRunQueryOptions = (api: Api, id: string, page: number) =>
  queryOptions({
    queryKey: [...BILLING_KEY, 'run', id, page],
    queryFn: () => api.billingRuns.get({ params: { id }, query: { page } }),
    placeholderData: keepPreviousData,
  });

export const invoicesQueryOptions = (
  api: Api,
  { q, kind, status, page = 1 }: InvoiceFilters = {}
) =>
  queryOptions({
    queryKey: [...INVOICES_KEY, 'list', { q: q ?? '', kind, status, page }],
    queryFn: () =>
      api.invoices.list({
        query: { q: q === '' ? undefined : q, kind, status, page },
      }),
    placeholderData: keepPreviousData,
  });

export const invoiceQueryOptions = (api: Api, id: string) =>
  queryOptions({
    queryKey: [...INVOICES_KEY, 'one', id],
    queryFn: () => api.invoices.get({ params: { id } }),
  });

export const dashboardChargedQueryOptions = (api: Api) =>
  queryOptions({
    queryKey: dashboardKey('charged'),
    queryFn: () => api.dashboard.charged({}),
  });

export const dashboardFinanceQueryOptions = (api: Api) =>
  queryOptions({
    queryKey: dashboardKey('finance'),
    queryFn: () => api.dashboard.finance({}),
  });

const PAYMENTS_KEY = ['payments'] as const;
const BALANCES_KEY = ['balances'] as const;
const STATEMENTS_KEY = ['statements'] as const;

/** A round of charges, or one charge, moves the charge lists, who owes, statements, the ledger and the home figures. */
export const invalidateCharges = (queryClient: QueryClient): Promise<void> =>
  invalidateAll(queryClient, [
    BILLING_KEY,
    INVOICES_KEY,
    [...FEES_KEY, 'preview'],
    BALANCES_KEY,
    STATEMENTS_KEY,
    dashboardKey('tasks'),
    dashboardKey('charged'),
    dashboardKey('finance'),
    dashboardKey('roll'),
    dashboardKey('money'),
    LEDGER_KEY,
    MONEY_ACCOUNTS_KEY,
  ]);

interface PaymentFilters {
  q?: string;
  status?: PaymentStatus;
  page?: number;
}

interface BalanceFilters {
  filter?: BalanceFilter;
  q?: string;
  page?: number;
}

export const paymentsQueryOptions = (
  api: Api,
  { q, status, page = 1 }: PaymentFilters = {}
) =>
  queryOptions({
    queryKey: [...PAYMENTS_KEY, 'list', { q: q ?? '', status, page }],
    queryFn: () =>
      api.payments.list({
        query: { q: q === '' ? undefined : q, status, page },
      }),
    placeholderData: keepPreviousData,
  });

export const paymentQueryOptions = (api: Api, id: string) =>
  queryOptions({
    queryKey: [...PAYMENTS_KEY, 'one', id],
    queryFn: () => api.payments.get({ params: { id } }),
  });

export const recordingOptionsQueryOptions = (api: Api) =>
  queryOptions({
    queryKey: [...PAYMENTS_KEY, 'recording-options'],
    queryFn: () => api.payments.recordingOptions({}),
    gcTime: 0,
  });

export const balancesQueryOptions = (
  api: Api,
  { filter = 'owing', q, page = 1 }: BalanceFilters = {}
) =>
  queryOptions({
    queryKey: [...BALANCES_KEY, 'list', { filter, q: q ?? '', page }],
    queryFn: () =>
      api.studentAccounts.balances({
        query: { filter, q: q === '' ? undefined : q, page },
      }),
    placeholderData: keepPreviousData,
  });

export const statementQueryOptions = (
  api: Api,
  studentId: string,
  { page, termId }: { page?: number; termId?: string } = {}
) =>
  queryOptions({
    queryKey: [
      ...STATEMENTS_KEY,
      'student',
      studentId,
      termKeyOf(termId),
      page ?? 'last',
    ],
    queryFn: () =>
      api.studentAccounts.statement({
        params: { studentId },
        query: { page, termId },
      }),
    placeholderData: keepPreviousData,
  });

export const familyStatementQueryOptions = (
  api: Api,
  guardianId: string,
  { termId }: { termId?: string } = {}
) =>
  queryOptions({
    queryKey: [...STATEMENTS_KEY, 'family', guardianId, termKeyOf(termId)],
    queryFn: () =>
      api.studentAccounts.guardianStatement({
        params: { guardianId },
        query: { termId },
      }),
    meta: { guardianId },
    placeholderData: (previous, previousQuery) =>
      previousQuery?.meta?.['guardianId'] === guardianId ? previous : undefined,
  });

const APPROVALS_KEY = ['approvals'] as const;
const ADJUSTMENTS_KEY = ['adjustments'] as const;

const APPROVALS_REFRESH_MS = 60_000;

interface ApprovalsView {
  includeOthers: boolean;
  pillar: ApprovalPillar | undefined;
  campusId: string | undefined;
}

const PLAIN_VIEW: ApprovalsView = {
  includeOthers: false,
  pillar: undefined,
  campusId: undefined,
};

export const approvalsQueryOptions = (
  api: Api,
  page: number,
  { includeOthers, pillar, campusId }: ApprovalsView = PLAIN_VIEW
) =>
  queryOptions({
    queryKey: [
      ...APPROVALS_KEY,
      'list',
      { page, includeOthers, pillar, campusId },
    ],
    queryFn: () =>
      api.approvals.list({
        query: {
          page,
          includeOthers,
          ...(pillar === undefined ? {} : { pillar }),
          ...(campusId === undefined ? {} : { campusId }),
        },
      }),
    placeholderData: keepPreviousData,
  });

const LEAVE_KEY = ['leave'] as const;

export const myLeaveQueryOptions = (api: Api) =>
  queryOptions({
    queryKey: [...LEAVE_KEY, 'mine'],
    queryFn: () => api.leave.me({}),
  });

export const memberLeaveQueryOptions = (api: Api, userId: string) =>
  queryOptions({
    queryKey: [...LEAVE_KEY, 'member', userId],
    queryFn: () => api.leave.list({ query: { status: 'all', userId } }),
  });

export const approvalsSummaryQueryOptions = (api: Api) =>
  queryOptions({
    queryKey: [...APPROVALS_KEY, 'summary'],
    queryFn: () => api.approvals.summary({}),
    refetchInterval: APPROVALS_REFRESH_MS,
  });

export const adjustmentsQueryOptions = (api: Api, page: number) =>
  queryOptions({
    queryKey: [...ADJUSTMENTS_KEY, 'corrections', page],
    queryFn: () => api.adjustments.list({ query: { page } }),
    placeholderData: keepPreviousData,
  });

export const paymentVoidsQueryOptions = (api: Api, page: number) =>
  queryOptions({
    queryKey: [...ADJUSTMENTS_KEY, 'voids', page],
    queryFn: () => api.paymentVoids.list({ query: { page } }),
    placeholderData: keepPreviousData,
  });

export const discountsQueryOptions = (api: Api, page: number) =>
  queryOptions({
    queryKey: [...ADJUSTMENTS_KEY, 'discounts', page],
    queryFn: () => api.studentDiscounts.list({ query: { page } }),
    placeholderData: keepPreviousData,
  });

const REQUEST_STUDENT_CHOICES = 20;

export const discountTermsQueryOptions = (api: Api) =>
  queryOptions({
    queryKey: [...ADJUSTMENTS_KEY, 'terms'],
    queryFn: () => api.studentDiscounts.terms({}),
  });

export const requestStudentsQueryOptions = (api: Api, q: string) =>
  queryOptions({
    queryKey: [...ADJUSTMENTS_KEY, 'students', q],
    queryFn: () =>
      api.students.list({
        query: {
          tab: 'active',
          pageSize: REQUEST_STUDENT_CHOICES,
          q: q === '' ? undefined : q,
        },
      }),
    placeholderData: keepPreviousData,
    gcTime: 0,
  });

export const moneyAccountsForRecordingQueryOptions = (api: Api) =>
  queryOptions({
    queryKey: [...MONEY_ACCOUNTS_KEY, 'for-recording'],
    queryFn: () => api.moneyAccounts.forRecording({}),
    gcTime: 0,
  });

export const requestSheetChargesQueryOptions = (api: Api, studentId: string) =>
  queryOptions({
    queryKey: [...ADJUSTMENTS_KEY, 'charges', studentId],
    queryFn: () =>
      api.invoices.list({
        query: { studentId, status: 'issued', pageSize: FINANCE_PAGE_SIZE_MAX },
      }),
    gcTime: 0,
  });

const MONEY_VIEW_KEYS = [
  APPROVALS_KEY,
  ADJUSTMENTS_KEY,
  PAYMENTS_KEY,
  BALANCES_KEY,
  STATEMENTS_KEY,
  INVOICES_KEY,
  dashboardKey('tasks'),
  dashboardKey('money'),
  dashboardKey('finance'),
  dashboardKey('roll'),
  LEDGER_KEY,
  MONEY_ACCOUNTS_KEY,
];

async function invalidateAll(
  queryClient: QueryClient,
  keys: readonly (readonly unknown[])[]
): Promise<void> {
  await Promise.all(
    keys.map((queryKey) => queryClient.invalidateQueries({ queryKey }))
  );
}

const STORE_KEY = ['store'] as const;

interface StoreItemFilters {
  campusId?: string;
  kind?: ItemKind;
  q?: string;
  lowOnly?: boolean;
  includeRetired?: boolean;
  page?: number;
  pageSize?: number;
}

interface StorePagedFilters {
  campusId?: string;
  page?: number;
}

interface StoreSaleFilters extends StorePagedFilters {
  studentId?: string;
}

export const storeSummaryQueryOptions = (api: Api, campusId?: string) =>
  queryOptions({
    queryKey: [...STORE_KEY, 'summary', { campusId }],
    queryFn: () => api.store.summary({ query: { campusId } }),
    placeholderData: keepPreviousData,
  });

export const storeItemsQueryOptions = (
  api: Api,
  {
    campusId,
    kind,
    q,
    lowOnly = false,
    includeRetired = false,
    page = 1,
    pageSize,
  }: StoreItemFilters = {}
) =>
  queryOptions({
    queryKey: [
      ...STORE_KEY,
      'items',
      { campusId, kind, q: q ?? '', lowOnly, includeRetired, page, pageSize },
    ],
    queryFn: () =>
      api.store.items({
        query: {
          campusId,
          kind,
          q: q === '' ? undefined : q,
          lowOnly,
          includeRetired,
          page,
          pageSize,
        },
      }),
    placeholderData: keepPreviousData,
  });

export const storeAllItemsQueryOptions = (api: Api) =>
  queryOptions({
    queryKey: [...STORE_KEY, 'items', 'all'],
    queryFn: async () => {
      const query = { pageSize: FINANCE_PAGE_SIZE_MAX };
      const first = await api.store.items({ query: { ...query, page: 1 } });
      const pages = Math.ceil(first.total / FINANCE_PAGE_SIZE_MAX);
      const rest = await Promise.all(
        Array.from({ length: Math.max(pages - 1, 0) }, (_, index) =>
          api.store.items({ query: { ...query, page: index + 2 } })
        )
      );
      return { items: [first, ...rest].flatMap((page) => page.items) };
    },
  });

export const storeDeliveriesQueryOptions = (
  api: Api,
  { campusId, page = 1 }: StorePagedFilters = {}
) =>
  queryOptions({
    queryKey: [...STORE_KEY, 'deliveries', { campusId, page }],
    queryFn: () => api.store.deliveries({ query: { campusId, page } }),
    placeholderData: keepPreviousData,
  });

export const storeSalesQueryOptions = (
  api: Api,
  { campusId, studentId, page = 1 }: StoreSaleFilters = {}
) =>
  queryOptions({
    queryKey: [...STORE_KEY, 'sales', { campusId, studentId, page }],
    queryFn: () => api.store.sales({ query: { campusId, studentId, page } }),
    placeholderData: keepPreviousData,
  });

export const storeCountsQueryOptions = (
  api: Api,
  { campusId, page = 1 }: StorePagedFilters = {}
) =>
  queryOptions({
    queryKey: [...STORE_KEY, 'counts', { campusId, page }],
    queryFn: () => api.stockCounts.list({ query: { campusId, page } }),
    placeholderData: keepPreviousData,
  });

export const storeSaleQueryOptions = (api: Api, id: string) =>
  queryOptions({
    queryKey: [...STORE_KEY, 'sale', id],
    queryFn: () => api.store.sale({ params: { id } }),
  });

export const storeDeliveryQueryOptions = (api: Api, id: string) =>
  queryOptions({
    queryKey: [...STORE_KEY, 'delivery', id],
    queryFn: () => api.store.delivery({ params: { id } }),
  });

export const storeSaleOptionsQueryOptions = (api: Api) =>
  queryOptions({
    queryKey: [...STORE_KEY, 'sale-options'],
    queryFn: () => api.store.saleOptions({}),
    gcTime: 0,
  });

export const dashboardStoreQueryOptions = (api: Api) =>
  queryOptions({
    queryKey: dashboardKey('store'),
    queryFn: () => api.dashboard.store({}),
  });

/** A delivery posts a journal entry from a money account, so the ledger and accounts move too. */
export async function invalidateStore(queryClient: QueryClient): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: STORE_KEY }),
    queryClient.invalidateQueries({ queryKey: DASHBOARD_KEY }),
    queryClient.invalidateQueries({ queryKey: LEDGER_KEY }),
    queryClient.invalidateQueries({ queryKey: MONEY_ACCOUNTS_KEY }),
  ]);
}

export const invalidateApprovals = (queryClient: QueryClient): Promise<void> =>
  invalidateAll(queryClient, [
    ...MONEY_VIEW_KEYS,
    FEES_KEY,
    LEAVE_KEY,
    MEMBERS_KEY,
    STORE_KEY,
    dashboardKey('store'),
    ACTIVITY_KEY,
  ]);

export const invalidateLeave = (queryClient: QueryClient): Promise<void> =>
  invalidateAll(queryClient, [
    LEAVE_KEY,
    APPROVALS_KEY,
    dashboardKey('tasks'),
    ACTIVITY_KEY,
  ]);

export const invalidatePayments = (queryClient: QueryClient): Promise<void> =>
  invalidateAll(queryClient, MONEY_VIEW_KEYS);

export async function invalidateSale(queryClient: QueryClient): Promise<void> {
  await Promise.all([
    invalidateStore(queryClient),
    invalidatePayments(queryClient),
  ]);
}
