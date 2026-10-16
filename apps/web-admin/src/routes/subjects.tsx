import { createFileRoute } from '@tanstack/react-router';
import { requireGate } from '../access';
import { SubjectsPage } from '../pages/subjects-page';
import {
  classLevelsQueryOptions,
  levelSubjectsQueryOptions,
  subjectTeachersQueryOptions,
  subjectsQueryOptions,
} from '../queries';
import { pageOf, parseSubjectsSearch, tabOf } from '../subjects-search';

export const Route = createFileRoute('/subjects')({
  validateSearch: parseSubjectsSearch,
  beforeLoad: ({ context }) => {
    requireGate(context.access, '/subjects');
  },
  loaderDeps: ({ search }) => ({ page: pageOf(search) }),
  loader: async ({ context: { queryClient, api }, deps }) => {
    await Promise.all([
      queryClient.query({
        ...subjectsQueryOptions(api, deps.page),
        staleTime: 'static',
      }),
      queryClient.query({
        ...classLevelsQueryOptions(api),
        staleTime: 'static',
      }),
      queryClient.query({
        ...levelSubjectsQueryOptions(api),
        staleTime: 'static',
      }),
      queryClient.query({
        ...subjectTeachersQueryOptions(api),
        staleTime: 'static',
      }),
    ]);
  },
  component: SubjectsRoute,
});

function SubjectsRoute() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <SubjectsPage
      tab={tabOf(search)}
      page={pageOf(search)}
      onTab={(tab) => {
        void navigate({
          search: { tab: tab === 'catalogue' ? undefined : tab },
          replace: true,
        });
      }}
      onPage={(page) => {
        void navigate({
          search: (previous) => ({
            ...previous,
            page: page > 1 ? page : undefined,
          }),
          replace: true,
        });
      }}
    />
  );
}
