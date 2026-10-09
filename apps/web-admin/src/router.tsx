import { createRouter, type ErrorComponentProps } from '@tanstack/react-router';
import { ErrorMessage } from '@eduvault/ui';
import { defaultApi } from './api';
import { NotFoundPage, PendingPage } from './components/page-fallbacks';
import { queryClient } from './query-client';
import { routeTree } from './routeTree.gen';

function RouteError({ error }: ErrorComponentProps) {
  return <ErrorMessage error={error} />;
}

export const router = createRouter({
  routeTree,
  context: { queryClient, api: defaultApi },
  defaultPreload: 'intent',
  defaultPreloadStaleTime: 0,
  defaultPendingMs: 100,
  defaultPendingComponent: PendingPage,
  defaultErrorComponent: RouteError,
  defaultNotFoundComponent: NotFoundPage,
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
