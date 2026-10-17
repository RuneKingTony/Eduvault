import { createFileRoute } from '@tanstack/react-router';
import { parseApprovalsSearch } from '../approvals-search';
import { ApprovalsPage } from '../pages/approvals-page';

export const Route = createFileRoute('/approvals')({
  validateSearch: parseApprovalsSearch,
  component: ApprovalsRoute,
});

function ApprovalsRoute() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <ApprovalsPage
      search={search}
      onSearchChange={(next) => {
        void navigate({ search: next, replace: true });
      }}
    />
  );
}
