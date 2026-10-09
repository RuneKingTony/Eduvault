import { RouterProvider } from '@tanstack/react-router';
import { MeGate, type EduvaultAuthClient } from '@eduvault/auth-client';
import { Toaster, useThemeChoice } from '@eduvault/ui';
import { useApi } from './api';
import { router } from './router';

export function App({ authClient }: { authClient: EduvaultAuthClient }) {
  const { resolved } = useThemeChoice();
  const api = useApi();
  return (
    <>
      <MeGate authClient={authClient} api={api} variant="staff" platform>
        <RouterProvider router={router} />
      </MeGate>
      <Toaster theme={resolved} />
    </>
  );
}
