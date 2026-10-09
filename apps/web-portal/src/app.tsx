import { RouterProvider } from '@tanstack/react-router';
import {
  AuthClientProvider,
  SignInForm,
  type EduvaultAuthClient,
} from '@eduvault/auth-client';
import { router } from './router';

export function App({ authClient }: { authClient: EduvaultAuthClient }) {
  const session = authClient.useSession();

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
      <p className="p-6 text-muted-foreground">
        You have not been added to a school yet. Ask your school to invite you,
        then sign in again.
      </p>
    );
  }
  return (
    <AuthClientProvider authClient={authClient}>
      <RouterProvider router={router} />
    </AuthClientProvider>
  );
}
