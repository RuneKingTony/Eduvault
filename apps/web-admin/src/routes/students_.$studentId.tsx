import { useEffect, useState } from 'react';
import {
  createFileRoute,
  useLocation,
  useRouter,
} from '@tanstack/react-router';
import {
  loginCredentialSchema,
  type LoginCredential,
} from '@eduvault/api-contract';
import { useAuthClient } from '@eduvault/auth-client';
import { requireGate } from '../access';
import { StudentPage } from '../pages/student-page';
import { studentQueryOptions } from '../queries';
import { parseStudentSearch } from '../students-search';
import { useSchool } from '../use-school';

export const Route = createFileRoute('/students_/$studentId')({
  validateSearch: parseStudentSearch,
  beforeLoad: ({ context }) => {
    requireGate(context.access, '/students');
  },
  loader: async ({ context: { queryClient, api }, params: { studentId } }) => {
    await queryClient
      .query({ ...studentQueryOptions(api, studentId), staleTime: 'static' })
      .catch(() => undefined);
  },
  component: StudentRoute,
});

function loginsOf(state: unknown): LoginCredential[] | null {
  if (typeof state !== 'object' || state === null || !('admitted' in state)) {
    return null;
  }
  const { admitted } = state;
  if (
    typeof admitted !== 'object' ||
    admitted === null ||
    !('logins' in admitted)
  ) {
    return null;
  }
  const parsed = loginCredentialSchema.array().safeParse(admitted.logins);
  return parsed.success ? parsed.data : null;
}

function StudentRoute() {
  const { studentId } = Route.useParams();
  return <StudentRouteBody key={studentId} studentId={studentId} />;
}

function StudentRouteBody({ studentId }: { studentId: string }) {
  const navigate = Route.useNavigate();
  const router = useRouter();
  const { dialog } = Route.useSearch();
  const state = useLocation({ select: (location) => location.state });
  const { schoolName } = useSchool(useAuthClient());
  const [logins] = useState(() => loginsOf(state));

  useEffect(() => {
    if (logins !== null) {
      router.history.replace(router.history.location.href);
    }
  }, [logins, router]);

  return (
    <StudentPage
      studentId={studentId}
      schoolName={schoolName}
      logins={logins ?? undefined}
      initialDialog={dialog}
      onDialogClosed={() => {
        void navigate({ search: {}, replace: true });
      }}
      onOpenTab={(tab) => {
        void navigate({ to: '/students', search: { tab } });
      }}
      onBack={() => {
        void navigate({ to: '/students' });
      }}
    />
  );
}
