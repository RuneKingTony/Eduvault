import type { EduvaultAuthClient } from '@eduvault/auth-client';

const personOf = (
  user: { name: string; email: string; image?: string | null } | undefined
) => ({
  name: user?.name ?? '',
  email: user?.email ?? '',
  image: user?.image ?? null,
});

/** The signed-in person and the active school, as the auth client reports them. */
export function useSchool(authClient: EduvaultAuthClient) {
  const session = authClient.useSession();
  const schools = authClient.useListOrganizations();
  const activeId = session.data?.session.activeOrganizationId;
  const active = schools.data?.find((school) => school.id === activeId);
  return {
    schoolName: active?.name ?? 'your school',
    user: personOf(session.data?.user),
  };
}
