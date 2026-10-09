import { RouterProvider } from '@tanstack/react-router';
import { MeGate, type EduvaultAuthClient } from '@eduvault/auth-client';
import { Toaster, useThemeChoice } from '@eduvault/ui';
import { useEffect } from 'react';
import { clearActing } from './acting-store';
import { useApi } from './api';
import { router } from './router';

function useEndActingOnSignOut(authClient: EduvaultAuthClient) {
  const session = authClient.useSession();
  const signedOut = !session.isPending && !session.data;
  useEffect(() => {
    if (signedOut) {
      clearActing();
    }
  }, [signedOut]);
}

export function App({ authClient }: { authClient: EduvaultAuthClient }) {
  const { resolved } = useThemeChoice();
  const api = useApi();
  useEndActingOnSignOut(authClient);
  return (
    <>
      <MeGate authClient={authClient} api={api} variant="staff" platform>
        <RouterProvider router={router} />
      </MeGate>
      <Toaster theme={resolved} />
    </>
  );
}
