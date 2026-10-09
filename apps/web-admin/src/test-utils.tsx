import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { MePermissions, Student } from '@eduvault/api-contract';
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
