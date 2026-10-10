import { useEffect, useState } from 'react';
import {
  createFileRoute,
  useLocation,
  useRouter,
} from '@tanstack/react-router';
import { useAuthClient } from '@eduvault/auth-client';
import { requireGate } from '../access';
import { MemberPage, type NewAccountNotice } from '../pages/member-page';
import {
  campusesQueryOptions,
  memberQueryOptions,
  schoolRolesQueryOptions,
} from '../queries';
import { useSchool } from '../use-school';

export const Route = createFileRoute('/members_/$memberId')({
  beforeLoad: ({ context }) => {
    requireGate(context.access, '/members');
  },
  loader: async ({ context: { queryClient, api }, params: { memberId } }) => {
    await Promise.all([
      queryClient
        .query({ ...memberQueryOptions(api, memberId), staleTime: 'static' })
        .catch(() => undefined),
      queryClient.query({
        ...schoolRolesQueryOptions(api),
        staleTime: 'static',
      }),
      queryClient.query({ ...campusesQueryOptions(api), staleTime: 'static' }),
    ]);
  },
  component: MemberRoute,
});

function noticeOf(state: unknown): NewAccountNotice | undefined {
  if (typeof state !== 'object' || state === null || !('newMember' in state)) {
    return undefined;
  }
  const { newMember } = state;
  if (
    typeof newMember !== 'object' ||
    newMember === null ||
    !('temporaryPassword' in newMember)
  ) {
    return undefined;
  }
  const { temporaryPassword } = newMember;
  return {
    temporaryPassword:
      typeof temporaryPassword === 'string' ? temporaryPassword : null,
  };
}

function MemberRoute() {
  const { memberId } = Route.useParams();
  return <MemberRouteBody key={memberId} memberId={memberId} />;
}

function MemberRouteBody({ memberId }: { memberId: string }) {
  const navigate = Route.useNavigate();
  const router = useRouter();
  const state = useLocation({ select: (location) => location.state });
  const { schoolName } = useSchool(useAuthClient());
  const [notice] = useState(() => noticeOf(state));

  useEffect(() => {
    if (notice !== undefined) {
      router.history.replace(router.history.location.href);
    }
  }, [notice, router]);

  return (
    <MemberPage
      memberId={memberId}
      schoolName={schoolName}
      notice={notice}
      onBack={() => {
        void navigate({ to: '/members' });
      }}
      onRemoved={() => navigate({ to: '/members' })}
    />
  );
}
