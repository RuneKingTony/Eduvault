import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { StudentList, StudentRow } from '@eduvault/api-contract';
import { ApiProvider, type Api } from './api';

export const student = (overrides: Partial<StudentRow> = {}): StudentRow => ({
  id: '5b0f1e1e-6e53-4c52-9f1c-0a1d7a7f9c11',
  firstName: 'Ada',
  lastName: 'Obi',
  admissionNumber: 'GF-001',
  life: 'active',
  dueLeft: false,
  isNewIntake: false,
  notSeenSince: null,
  notSeenBy: null,
  weeksAway: null,
  currentPlacement: null,
  latestClassName: null,
  effectiveCampus: {
    id: '7d0f1e1e-6e53-4c52-9f1c-0a1d7a7f9c33',
    name: 'Main Campus',
  },
  admittedOn: '2026-01-01',
  exit: null,
  graduatedSessionName: null,
  ...overrides,
});

export const studentList = (items: StudentRow[]): StudentList => ({
  items,
  total: items.length,
  counts: { active: items.length, new: 0, inactive: 0, left: 0, graduated: 0 },
  startYear: null,
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
