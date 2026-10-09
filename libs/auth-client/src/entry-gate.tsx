import type { ReactNode } from 'react';
import { ErrorMessage } from '@eduvault/ui';
import type { Me } from '@eduvault/api-contract';
import type { EduvaultAuthClient } from './auth-client';
import type { AuthVariant } from './auth-card';
import { AuthClientProvider } from './auth-client-context';
import { ChangePasswordForm } from './change-password-form';
import { entryState } from './entry-state';
import { NoSchoolScreen } from './no-school-screen';
import { SchoolSwitcher } from './school-switcher';
import { SignInForm } from './sign-in-form';
import { SuspendedScreen } from './suspended-screen';

interface EntryGateProps {
  authClient: EduvaultAuthClient;
  variant: AuthVariant;
  /** Only web-admin has a platform console. */
  platform?: boolean;
  me: {
    isPending: boolean;
    isError: boolean;
    error: unknown;
    data: Me | undefined;
    refetch: () => Promise<unknown>;
  };
  onSetPassword: (newPassword: string) => Promise<void>;
  onSignedOut: () => void;
  onSchoolSwitched: () => void;
  children: ReactNode;
}

const MeFailure = ({ error }: { error: unknown }) => (
  <main className="p-6">
    <ErrorMessage error={error} />
  </main>
);

function SuspendedEntry({
  authClient,
  variant,
  me,
  onSignOut,
  onRetry,
  onSchoolSwitched,
}: {
  authClient: EduvaultAuthClient;
  variant: AuthVariant;
  me: Me | undefined;
  onSignOut: () => void;
  onRetry: () => Promise<unknown>;
  onSchoolSwitched: () => void;
}) {
  return (
    <SuspendedScreen
      schoolName={me?.suspendedSchool?.name ?? 'This school'}
      variant={variant}
      onSignOut={onSignOut}
      onRetry={() => {
        void onRetry();
      }}
      switcher={
        (me?.schoolCount ?? 0) > 1 ? (
          <SchoolSwitcher
            authClient={authClient}
            appearance="button"
            onSwitched={onSchoolSwitched}
          />
        ) : null
      }
    />
  );
}

export function EntryGate({
  authClient,
  variant,
  platform,
  me,
  onSetPassword,
  onSignedOut,
  onSchoolSwitched,
  children,
}: EntryGateProps) {
  const session = authClient.useSession();
  const state = entryState({ session, me, platform });
  const signOut = () => {
    void authClient.signOut().then(onSignedOut);
  };

  if (me.isError && state !== 'signed-out') {
    return <MeFailure error={me.error} />;
  }
  switch (state) {
    case 'loading': {
      return <p className="p-6">Loading…</p>;
    }
    case 'signed-out': {
      return <SignInForm authClient={authClient} variant={variant} />;
    }
    case 'change-password': {
      return (
        <ChangePasswordForm
          variant={variant}
          onSubmit={onSetPassword}
          onSignOut={signOut}
        />
      );
    }
    case 'no-school': {
      return <NoSchoolScreen variant={variant} onSignOut={signOut} />;
    }
    case 'suspended': {
      return (
        <SuspendedEntry
          authClient={authClient}
          variant={variant}
          me={me.data}
          onSignOut={signOut}
          onRetry={me.refetch}
          onSchoolSwitched={onSchoolSwitched}
        />
      );
    }
    case 'platform':
    case 'ready': {
      return (
        <AuthClientProvider authClient={authClient}>
          {children}
        </AuthClientProvider>
      );
    }
  }
}
