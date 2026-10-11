import { createFileRoute } from '@tanstack/react-router';
import { requireGate } from '../access';
import { parseClassesSearch, statusOf } from '../classes-search';
import { ClassesPage } from '../pages/classes-page';
import {
  classLevelsQueryOptions,
  classesQueryOptions,
  currentTermQueryOptions,
} from '../queries';

export const Route = createFileRoute('/classes')({
  validateSearch: parseClassesSearch,
  beforeLoad: ({ context }) => {
    requireGate(context.access, '/classes');
  },
  loaderDeps: ({ search }) => ({ status: statusOf(search) }),
  loader: async ({ context: { queryClient, api }, deps }) => {
    await Promise.all([
      queryClient.query({
        ...classesQueryOptions(api, deps.status),
        staleTime: 'static',
      }),
      queryClient.query({
        ...classesQueryOptions(api, 'active'),
        staleTime: 'static',
      }),
      queryClient.query({
        ...currentTermQueryOptions(api),
        staleTime: 'static',
      }),
      queryClient.query({
        ...classLevelsQueryOptions(api),
        staleTime: 'static',
      }),
    ]);
  },
  component: ClassesRoute,
});

function ClassesRoute() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <ClassesPage
      status={statusOf(search)}
      onStatusChange={(status) => {
        void navigate({
          search: { status: status === 'active' ? undefined : status },
          replace: true,
        });
      }}
      onOpenClass={(classId) => {
        void navigate({ to: '/classes/$classId', params: { classId } });
      }}
    />
  );
}
