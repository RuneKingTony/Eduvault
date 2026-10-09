import { useQueryClient } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import {
  AuthClientProvider,
  SignInForm,
  SignOutButton,
  type EduvaultAuthClient,
} from '@eduvault/auth-client';
import { router } from './router';

export function App({ authClient }: { authClient: EduvaultAuthClient }) {
  const session = authClient.useSession();
  const queryClient = useQueryClient();

  if (session.isPending) {
    return <p className="p-6">Loading…</p>;
  }
  const hasSchool = Boolean(session.data?.session.activeOrganizationId);
  if (!session.data) {
    return (
      <main className="p-6">
        <SignInForm authClient={authClient} />
      </main>
    );
  }
  if (!hasSchool) {
    return (
      <main className="flex flex-col items-start gap-4 p-6">
        <p className="text-muted-foreground">
          You have not been added to a school yet. Ask your school to invite
          you, then sign in again.
        </p>
        <SignOutButton
          authClient={authClient}
          onSignedOut={() => {
            queryClient.clear();
          }}
        />
      </main>
    );
  }
  return (
    <AuthClientProvider authClient={authClient}>
      <RouterProvider router={router} />
    </AuthClientProvider>
  );
}
