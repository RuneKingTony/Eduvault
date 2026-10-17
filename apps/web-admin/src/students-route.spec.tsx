import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  RouterProvider,
  createMemoryHistory,
  createRouter,
} from '@tanstack/react-router';
import { fireEvent, render, screen } from '@testing-library/react';
import {
  AuthClientProvider,
  type EduvaultAuthClient,
} from '@eduvault/auth-client';
import type { Me } from '@eduvault/api-contract';
import { toast } from '@eduvault/ui';
import { stubMatchMedia } from '@eduvault/ui/testing';
import { ApiProvider, type Api } from './api';
import { NotFoundPage } from './components/page-fallbacks';
import { routeTree } from './routeTree.gen';
import { ownerAccess } from './test-utils';

vi.mock('@eduvault/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@eduvault/ui')>()),
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('./pages/students-page', () => ({
  StudentsPage: ({ onAdmitted }: { onAdmitted: (result: unknown) => void }) => (
    <button
      type="button"
      onClick={() => {
        onAdmitted({
          student: {
            id: 's1',
            firstName: 'Peace',
            lastName: 'Udoh',
            admissionNumber: 'GF-0234',
            currentPlacement: { className: 'JSS 1' },
            history: [],
          },
          logins: [],
        });
      }}
    >
      Admit
    </button>
  ),
}));

const authClient = {
  useSession: () => ({
    data: {
      session: { activeOrganizationId: 'o1' },
      user: { name: 'Ngozi Okeke', email: 'n@mail.test', image: null },
    },
  }),
  useListOrganizations: () => ({
    data: [{ id: 'o1', name: 'Greenfield College' }],
  }),
  useActiveMember: () => ({ data: { role: 'owner' } }),
  signOut: vi.fn(),
} as unknown as EduvaultAuthClient;

const me: Me = {
  user: { id: 'u1', email: 'n@mail.test', name: 'Ngozi Okeke' },
  activeOrganizationId: 'o1',
  activeCampusId: null,
  mustChangePassword: false,
  platformRole: null,
  schoolCount: 1,
  suspendedSchool: null,
};

function renderStudents() {
  const api = {
    me: {
      get: vi.fn().mockResolvedValue(me),
      permissions: vi.fn().mockResolvedValue(ownerAccess()),
    },
    students: { list: vi.fn().mockResolvedValue({}) },
    campuses: { list: vi.fn().mockResolvedValue([]) },
  } as unknown as Api;
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const router = createRouter({
    routeTree,
    context: { queryClient, api },
    history: createMemoryHistory({ initialEntries: ['/students'] }),
    defaultNotFoundComponent: NotFoundPage,
  });
  const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(undefined);
  vi.spyOn(router.history, 'push').mockImplementation(() => undefined);
  render(
    <QueryClientProvider client={queryClient}>
      <ApiProvider api={api}>
        <AuthClientProvider authClient={authClient}>
          <RouterProvider router={router} />
        </AuthClientProvider>
      </ApiProvider>
    </QueryClientProvider>
  );
  return navigate;
}

describe('the students route', () => {
  beforeEach(() => {
    stubMatchMedia({ '(max-width: 820px)': false });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends "Charge this student" to the billing page with the prepare sheet open', async () => {
    const navigate = renderStudents();
    fireEvent.click(await screen.findByRole('button', { name: 'Admit' }));

    const options = vi
      .mocked(toast.success)
      .mock.calls.at(-1)?.[1] as unknown as {
      action: { onClick: () => void };
    };
    options.action.onClick();

    expect(navigate).toHaveBeenCalledWith(
      expect.objectContaining({
        to: '/finance/billing',
        search: { page: undefined, prepare: 1 },
      })
    );
  });
});
