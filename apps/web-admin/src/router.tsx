import { createRouter, type ErrorComponentProps } from '@tanstack/react-router';
import { defaultApi } from './api';
import { ErrorMessage } from './components/error-message';
import { queryClient } from './query-client';
import { routeTree } from './routeTree.gen';

function RouteError({ error }: ErrorComponentProps) {
  return <ErrorMessage error={error} />;
}

function NotFound() {
  return <p className="text-muted-foreground">Page not found.</p>;
}

export const router = createRouter({
  routeTree,
  context: { queryClient, api: defaultApi },
  defaultPreload: 'intent',
  defaultPreloadStaleTime: 0,
  defaultErrorComponent: RouteError,
  defaultNotFoundComponent: NotFound,
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
