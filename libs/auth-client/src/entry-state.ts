import type { Me } from '@eduvault/api-contract';

export type EntryState =
  | 'loading'
  | 'signed-out'
  | 'change-password'
  | 'platform'
  | 'no-school'
  | 'suspended'
  | 'ready';

interface EntryInput {
  session: {
    isPending: boolean;
    data:
      { session: { activeOrganizationId?: string | null } } | null | undefined;
  };
  me: { isPending: boolean; data: Me | undefined };
  /** Only web-admin has a platform console. */
  platform?: boolean;
}

function signedInState({
  session,
  me,
  platform,
}: {
  session: { session: { activeOrganizationId?: string | null } };
  me: Me;
  platform: boolean;
}): EntryState {
  if (me.mustChangePassword) {
    return 'change-password';
  }
  if (platform && me.platformRole === 'superadmin') {
    return 'platform';
  }
  const hasSchool =
    me.schoolCount > 0 &&
    (session.session.activeOrganizationId ?? null) !== null;
  if (!hasSchool) {
    return 'no-school';
  }
  return me.suspendedSchool === null ? 'ready' : 'suspended';
}

export function entryState({
  session,
  me,
  platform = false,
}: EntryInput): EntryState {
  if (session.isPending) {
    return 'loading';
  }
  if (!session.data) {
    return 'signed-out';
  }
  if (me.isPending || me.data === undefined) {
    return 'loading';
  }
  return signedInState({ session: session.data, me: me.data, platform });
}
