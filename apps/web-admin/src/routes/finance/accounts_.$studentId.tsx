import { createFileRoute } from '@tanstack/react-router';
import { requireGate } from '../../access';
import { parseStatementSearch } from '../../accounts-search';
import { StatementPage } from '../../pages/statement-page';
import { statementQueryOptions } from '../../queries';

export const Route = createFileRoute('/finance/accounts_/$studentId')({
  validateSearch: parseStatementSearch,
  beforeLoad: ({ context }) => {
    requireGate(context.access, '/finance/accounts');
  },
  loaderDeps: ({ search }) => ({ termId: search.term }),
  loader: async ({
    context: { queryClient, api },
    params: { studentId },
    deps: { termId },
  }) => {
    await queryClient
      .query({
        ...statementQueryOptions(api, studentId, { termId }),
        staleTime: 'static',
      })
      .catch(() => undefined);
  },
  component: StatementRoute,
});

function StatementRoute() {
  const { studentId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <StatementPage
      key={studentId}
      studentId={studentId}
      search={search}
      onSearchChange={(next) => {
        void navigate({ search: next, replace: true });
      }}
    />
  );
}
