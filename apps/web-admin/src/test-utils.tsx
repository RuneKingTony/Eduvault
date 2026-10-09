import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type {
  AuditRow,
  MePermissions,
  PlatformSchool,
  Student,
} from '@eduvault/api-contract';
import {
  PermissionsProvider,
  accessOfStarter,
  fakeAccess,
} from '@eduvault/auth-client';
import { ALL_PERMISSIONS, toPermissionMap } from '@eduvault/policy';
import { ApiProvider, type Api } from './api';

export const student = (overrides: Partial<Student> = {}): Student => ({
  id: '5b0f1e1e-6e53-4c52-9f1c-0a1d7a7f9c11',
  organizationId: '9c0f1e1e-6e53-4c52-9f1c-0a1d7a7f9c22',
  campusId: '7d0f1e1e-6e53-4c52-9f1c-0a1d7a7f9c33',
  fullName: 'Ada Obi',
  admissionNumber: 'GF-001',
  createdAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

export const platformSchool = (
  overrides: Partial<PlatformSchool> = {}
): PlatformSchool => ({
  id: 's1',
  name: 'Greenfield College',
  slug: 'greenfield',
  admissionPrefix: 'GF',
  city: 'Lagos',
  owners: [{ id: 'o1', name: 'Funmi Adeyemi', email: 'funmi@greenfield.test' }],
  students: 28,
  campuses: 2,
  status: 'active',
  createdAt: '2026-08-12T10:00:00.000Z',
  ...overrides,
});

export const auditRow = (overrides: Partial<AuditRow> = {}): AuditRow => ({
  id: 'a1',
  kind: 'acting',
  actor: { id: 'u1', name: 'Jude' },
  school: { id: 's1', name: 'Greenfield College' },
  method: 'GET',
  action: null,
  path: '/students',
  status: 200,
  reason: null,
  createdAt: '2026-10-07T09:05:00.000Z',
  ...overrides,
});

export const schoolList = (
  items: PlatformSchool[],
  overrides: Partial<{
    totals: {
      schools: number;
      active: number;
      students: number;
      actingRequests: number;
    };
    nextCursor: string | null;
  }> = {}
) => ({
  items,
  totals: {
    schools: items.length,
    active: items.filter((school) => school.status === 'active').length,
    students: items.reduce((total, school) => total + school.students, 0),
    actingRequests: 0,
  },
  nextCursor: null,
  ...overrides,
});

export const ownerAccess = (): MePermissions =>
  fakeAccess({
    roles: ['owner'],
    permissions: toPermissionMap(ALL_PERMISSIONS),
    campusScope: 'all',
  });

export const starterAccess = (slug: string): MePermissions =>
  accessOfStarter(slug, slug === 'administrator' ? 'all' : ['c1']);

export function renderWithApi(
  ui: ReactElement,
  api: Partial<Record<keyof Api, unknown>>,
  access: MePermissions = ownerAccess()
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ApiProvider api={api as unknown as Api}>
        <PermissionsProvider value={access}>{ui}</PermissionsProvider>
      </ApiProvider>
    </QueryClientProvider>
  );
}

export { fakeAccess } from '@eduvault/auth-client';
