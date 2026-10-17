import type { ReactNode } from 'react';
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import type {
  ActivityPage,
  AnnouncementSummary,
  DashboardCharged,
  DashboardFinance,
  DashboardMoney,
  DashboardRoll,
  DashboardTask,
  MePermissions,
  MyClass,
} from '@eduvault/api-contract';
import {
  AuthClientProvider,
  type EduvaultAuthClient,
} from '@eduvault/auth-client';
import type { DayOff } from '@eduvault/shared';
import { MyAccessProvider } from './components/my-access';
import { currentCalendar } from './test-calendar';
import { ownerAccess, renderWithApi } from './test-utils';

const authClient = {
  useSession: () => ({
    data: {
      session: { activeOrganizationId: 'o1' },
      user: { name: 'Funmi Adeyemi', email: 'funmi@school.test', image: null },
    },
  }),
  useListOrganizations: () => ({
    data: [{ id: 'o1', name: 'Greenfield College' }],
  }),
} as unknown as EduvaultAuthClient;

export const roll = (
  overrides: Partial<DashboardRoll> = {}
): DashboardRoll => ({
  active: 312,
  newIntakes: 24,
  inactive: 5,
  dueLeft: 2,
  left: 11,
  leftThisTerm: 3,
  graduated: 40,
  campusNames: null,
  ...overrides,
});

export const person = (n: number) => ({ id: `s${n}`, name: `Student ${n}` });

export const myClass = (overrides: Partial<MyClass> = {}): MyClass => ({
  armId: 'a1',
  name: 'JSS 3 Gold',
  campusName: 'Lekki',
  studentCount: 8,
  isClassTeacher: true,
  subjects: [],
  sampleStudents: [person(1), person(2)],
  ...overrides,
});

export const dayOff = (overrides: Partial<DayOff> = {}): DayOff => ({
  kind: 'holiday',
  name: 'Mid-term break',
  start: '2026-10-29',
  end: '2026-10-30',
  days: 2,
  ...overrides,
});

export const announcementSummary = (
  overrides: Partial<AnnouncementSummary> = {}
): AnnouncementSummary => ({
  id: 'n1',
  title: 'PTA meeting',
  body: 'Saturday at ten.',
  tag: 'event',
  pinned: false,
  publishedOn: '2026-10-09',
  ...overrides,
});

const emptyActivity = (): ActivityPage => ({ items: [], total: 0 });

const emptyMoney = (): DashboardMoney => ({
  currency: 'NGN',
  totalMinor: 0,
  accounts: [],
  hiddenSchoolWide: 0,
});

const chargedOf = (overrides: { charged?: DashboardCharged | null }) =>
  overrides.charged ?? null;

export const finance = (
  overrides: Partial<DashboardFinance> = {}
): DashboardFinance => ({
  currency: 'NGN',
  receivedMinor: 90_000_000,
  paymentCount: 12,
  owedMinor: 25_000_000,
  owingStudents: 9,
  ...overrides,
});

const financeOf = (overrides: { finance?: DashboardFinance | null }) =>
  overrides.finance === undefined ? finance() : overrides.finance;

export function dashboardApi(
  overrides: {
    calendar?: unknown;
    daysOff?: DayOff[];
    tasks?: DashboardTask[];
    roll?: unknown;
    myClasses?: MyClass[];
    activity?: ActivityPage;
    announcements?: AnnouncementSummary[];
    money?: DashboardMoney;
    charged?: DashboardCharged | null;
    finance?: DashboardFinance | null;
  } = {}
) {
  return {
    calendar: {
      current: vi
        .fn()
        .mockResolvedValue(overrides.calendar ?? currentCalendar()),
      daysOff: vi.fn().mockResolvedValue(overrides.daysOff ?? []),
    },
    dashboard: {
      tasks: vi.fn().mockResolvedValue(overrides.tasks ?? []),
      roll: vi.fn().mockResolvedValue(overrides.roll ?? roll()),
      myClasses: vi.fn().mockResolvedValue(overrides.myClasses ?? []),
      money: vi.fn().mockResolvedValue(overrides.money ?? emptyMoney()),
      charged: vi.fn().mockResolvedValue(chargedOf(overrides)),
      finance: vi.fn().mockResolvedValue(financeOf(overrides)),
    },
    activity: {
      list: vi.fn().mockResolvedValue(overrides.activity ?? emptyActivity()),
    },
    announcements: {
      feed: vi.fn().mockResolvedValue(overrides.announcements ?? []),
    },
  };
}

export function renderInRouter(
  ui: ReactNode,
  api: ReturnType<typeof dashboardApi>,
  access: MePermissions = ownerAccess()
) {
  const root = createRootRoute({
    component: () => <MyAccessProvider>{ui}</MyAccessProvider>,
  });
  const paths = [
    '/announcements',
    '/calendar',
    '/students',
    '/students/$studentId',
    '/classes',
    '/classes/$classId',
    '/finance/money-accounts',
    '/finance/invoices',
    '/finance/payments',
    '/finance/accounts',
    '/finance/billing',
    '/finance/billing/$runId',
    '/members/$memberId',
  ];
  const router = createRouter({
    routeTree: root.addChildren(
      paths.map((path) => createRoute({ getParentRoute: () => root, path }))
    ),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });
  renderWithApi(
    <AuthClientProvider authClient={authClient}>
      <RouterProvider router={router} />
    </AuthClientProvider>,
    api,
    access
  );
}
