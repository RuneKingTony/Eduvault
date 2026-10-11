import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type {
  CalendarCurrent,
  DayOffEntry,
  PortalAnnouncements,
  PortalChild,
  PortalMe,
  PortalStudent,
} from '@eduvault/api-contract';
import { ApiProvider, type Api } from './api';

export const portalChild = (
  overrides: Partial<PortalChild> = {}
): PortalChild => ({
  id: '5b0f1e1e-6e53-4c52-9f1c-0a1d7a7f9c11',
  firstName: 'Ada',
  lastName: 'Okeke',
  className: 'JSS 1 Gold',
  campusName: 'Lekki',
  archived: false,
  ...overrides,
});

export const portalMe = (overrides: Partial<PortalMe> = {}): PortalMe => ({
  kind: 'guardian',
  name: 'Ngozi Okeke',
  firstName: 'Ngozi',
  login: { username: 'okeke-family', email: null },
  school: { name: 'Greenfield College', admissionPrefix: 'GF', logoUrl: null },
  children: [portalChild()],
  ...overrides,
});

export const portalStudent = (
  overrides: Partial<PortalStudent> = {}
): PortalStudent => ({
  id: '5b0f1e1e-6e53-4c52-9f1c-0a1d7a7f9c11',
  firstName: 'Ada',
  lastName: 'Okeke',
  admissionNumber: 'GF-0123',
  dateOfBirth: '2014-05-02',
  className: 'JSS 1 Gold',
  campusName: 'Lekki',
  classTeacherName: 'Zainab Lead',
  username: 'greenfield-0123',
  archived: false,
  ...overrides,
});

export const portalAnnouncements = (
  overrides: Partial<PortalAnnouncements> = {}
): PortalAnnouncements => ({ items: [], newThisWeek: 0, ...overrides });

export const calendarCurrent = (
  overrides: Partial<CalendarCurrent> = {}
): CalendarCurrent => ({
  term: {
    id: 'b0f1e1e5-6e53-4c52-9f1c-0a1d7a7f9c11',
    schoolYearId: 'd0f1e1e5-6e53-4c52-9f1c-0a1d7a7f9c11',
    sequence: 1,
    name: 'First term',
    startsOn: '2026-09-07',
    endsOn: '2026-12-11',
    isCurrent: true,
    ended: false,
    schoolDays: 70,
    holidayCount: 0,
    holidays: [],
    canMakeCurrent: false,
  },
  schoolYear: {
    id: 'd0f1e1e5-6e53-4c52-9f1c-0a1d7a7f9c11',
    name: '2026/2027',
    startsOn: '2026-09-07',
    endsOn: '2027-07-23',
  },
  schoolDays: 70,
  schoolDaysSoFar: 24,
  ...overrides,
});

export const dayOffEntry = (
  overrides: Partial<DayOffEntry> = {}
): DayOffEntry => ({
  kind: 'holiday',
  name: 'Founders day',
  start: '2026-10-29',
  end: '2026-10-29',
  days: 1,
  ...overrides,
});

export function renderWithApi(
  ui: ReactElement,
  api: Partial<Record<keyof Api, unknown>>
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ApiProvider api={api as unknown as Api}>{ui}</ApiProvider>
    </QueryClientProvider>
  );
}
