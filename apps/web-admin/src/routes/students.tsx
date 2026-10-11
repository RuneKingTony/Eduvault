import { createFileRoute, useRouter } from '@tanstack/react-router';
import { useAuthClient } from '@eduvault/auth-client';
import { toast } from '@eduvault/ui';
import { requireGate } from '../access';
import { StudentsPage } from '../pages/students-page';
import { campusesQueryOptions, studentsQueryOptions } from '../queries';
import { parseStudentsSearch } from '../students-search';
import { useSchool } from '../use-school';

export const Route = createFileRoute('/students')({
  validateSearch: parseStudentsSearch,
  // Typing in the search box reloads this route; the pending page would remount it and drop focus.
  pendingMs: 3000,
  beforeLoad: ({ context }) => {
    requireGate(context.access, '/students');
  },
  loaderDeps: ({ search: { tab, q, campusId, levelId, page } }) => ({
    tab,
    q,
    campusId,
    levelId,
    page,
  }),
  loader: async ({ context: { queryClient, api }, deps }) => {
    await Promise.all([
      queryClient.query({
        ...studentsQueryOptions(api, deps),
        staleTime: 'static',
      }),
      queryClient.query({ ...campusesQueryOptions(api), staleTime: 'static' }),
    ]);
  },
  component: StudentsRoute,
});

function StudentsRoute() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const router = useRouter();
  const { schoolName } = useSchool(useAuthClient());
  return (
    <StudentsPage
      search={search}
      schoolName={schoolName}
      onSearchChange={(next) => {
        void navigate({ search: next, replace: true });
      }}
      onOpenStudent={(studentId) => {
        void navigate({ to: '/students/$studentId', params: { studentId } });
      }}
      onRecordLeaving={(studentId) => {
        void navigate({
          to: '/students/$studentId',
          params: { studentId },
          search: { dialog: 'leave' },
        });
      }}
      onAdmitted={({ student, logins }) => {
        toast.success(
          `${student.firstName} ${student.lastName} admitted as ${student.admissionNumber}.`
        );
        router.history.push(`/students/${student.id}`, {
          admitted: { logins },
        });
      }}
      onOpenCalendar={() => {
        void navigate({ to: '/calendar' });
      }}
    />
  );
}
