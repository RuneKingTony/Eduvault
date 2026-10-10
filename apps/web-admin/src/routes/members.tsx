import { createFileRoute, useRouter } from '@tanstack/react-router';
import { useAuthClient } from '@eduvault/auth-client';
import { requireGate } from '../access';
import { parseMembersSearch } from '../members-search';
import { MembersPage } from '../pages/members-page';
import {
  campusesQueryOptions,
  membersQueryOptions,
  schoolRolesQueryOptions,
} from '../queries';
import { useSchool } from '../use-school';

export const Route = createFileRoute('/members')({
  validateSearch: parseMembersSearch,
  // Typing in the search box reloads this route; the pending page would remount it and drop focus.
  pendingMs: 3000,
  beforeLoad: ({ context }) => {
    requireGate(context.access, '/members');
  },
  loaderDeps: ({ search: { q, role, page } }) => ({ q, role, page }),
  loader: async ({ context: { queryClient, api }, deps }) => {
    await Promise.all([
      queryClient.query({
        ...membersQueryOptions(api, deps),
        staleTime: 'static',
      }),
      queryClient.query({
        ...membersQueryOptions(api, {}),
        staleTime: 'static',
      }),
      queryClient.query({
        ...schoolRolesQueryOptions(api),
        staleTime: 'static',
      }),
      queryClient.query({ ...campusesQueryOptions(api), staleTime: 'static' }),
    ]);
  },
  component: MembersRoute,
});

function MembersRoute() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const router = useRouter();
  const { schoolName } = useSchool(useAuthClient());
  return (
    <MembersPage
      search={search}
      schoolName={schoolName}
      onSearchChange={(next) => {
        void navigate({ search: next, replace: true });
      }}
      onOpenMember={(memberId) => {
        void navigate({ to: '/members/$memberId', params: { memberId } });
      }}
      onMemberAdded={({ member, temporaryPassword }) => {
        router.history.push(`/members/${member.id}`, {
          newMember: { temporaryPassword },
        });
      }}
      onOpenCampuses={() => {
        void navigate({ to: '/campuses' });
      }}
    />
  );
}
