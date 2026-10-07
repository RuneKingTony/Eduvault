import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { Student } from '@eduvault/api-contract';
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
