import type { ReactNode } from 'react';
import { ErrorMessage } from '@eduvault/ui';
import type { Me } from '@eduvault/api-contract';
import type { EduvaultAuthClient } from './auth-client';
import type { AuthVariant } from './auth-card';
import { AuthClientProvider } from './auth-client-context';
import { ChangePasswordForm } from './change-password-form';
import { entryState } from './entry-state';
import { NoSchoolScreen } from './no-school-screen';
import { SignInForm } from './sign-in-form';

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
  };
  onSetPassword: (newPassword: string) => Promise<void>;
  onSignedOut: () => void;
  children: ReactNode;
}

export function EntryGate({
  authClient,
  variant,
  platform = false,
  me,
  onSetPassword,
  onSignedOut,
  children,
}: EntryGateProps) {
  const session = authClient.useSession();
  const state = entryState({ session, me, platform });
  const signOut = () => {
    void authClient.signOut().then(onSignedOut);
  };

  if (me.isError && state !== 'signed-out') {
    return (
      <main className="p-6">
        <ErrorMessage error={me.error} />
      </main>
    );
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
