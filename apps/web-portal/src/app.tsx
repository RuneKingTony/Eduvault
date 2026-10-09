import { RouterProvider } from '@tanstack/react-router';
import { MeGate, type EduvaultAuthClient } from '@eduvault/auth-client';
import { useApi } from './api';
import { router } from './router';

export function App({ authClient }: { authClient: EduvaultAuthClient }) {
  const api = useApi();
  return (
    <MeGate authClient={authClient} api={api} variant="portal">
      <RouterProvider router={router} />
    </MeGate>
  );
}
