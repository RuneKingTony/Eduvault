import { useQueryClient } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import {
  Button,
  ContextSwitchers,
  SignInForm,
  type EduvaultAuthClient,
} from '@eduvault/ui';
import { router } from './router';

export function App({ authClient }: { authClient: EduvaultAuthClient }) {
  const session = authClient.useSession();
  const queryClient = useQueryClient();

  if (session.isPending) return <p className="p-6">Loading…</p>;
  if (!session.data) {
    return (
      <main className="p-6">
        <SignInForm authClient={authClient} />
      </main>
    );
  }

  const refresh = () => {
    void queryClient.invalidateQueries();
  };
  const hasSchool = Boolean(session.data.session.activeOrganizationId);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 p-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <span className="font-semibold">Eduvault Portal</span>
        <ContextSwitchers authClient={authClient} onChanged={refresh} />
        <Button onClick={() => void authClient.signOut()}>Sign out</Button>
      </header>
      {hasSchool ? (
        <RouterProvider router={router} />
      ) : (
        <p className="text-slate-600">
          You have not been added to a school yet. Ask your school to invite
          you, then sign in again.
        </p>
      )}
    </div>
  );
}
