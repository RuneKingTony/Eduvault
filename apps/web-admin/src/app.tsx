import { useQueryClient } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import {
  AuthClientProvider,
  SignInForm,
  SignOutButton,
  type EduvaultAuthClient,
} from '@eduvault/auth-client';
import { Toaster, useThemeChoice } from '@eduvault/ui';
import { CreateSchoolForm } from './components/create-school-form';
import { router } from './router';

function Gate({ authClient }: { authClient: EduvaultAuthClient }) {
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
      <div className="mx-auto flex max-w-4xl flex-col items-start gap-6 p-6">
        <CreateSchoolForm
          authClient={authClient}
          onCreated={() => {
            void queryClient.invalidateQueries();
          }}
        />
        <SignOutButton
          authClient={authClient}
          onSignedOut={() => {
            queryClient.clear();
          }}
        />
      </div>
    );
  }
  return (
    <AuthClientProvider authClient={authClient}>
      <RouterProvider router={router} />
    </AuthClientProvider>
  );
}

export function App({ authClient }: { authClient: EduvaultAuthClient }) {
  const { resolved } = useThemeChoice();
  return (
    <>
      <Gate authClient={authClient} />
      <Toaster theme={resolved} />
    </>
  );
}
