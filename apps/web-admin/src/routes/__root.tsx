import type { QueryClient } from '@tanstack/react-query';
import {
  Link,
  Outlet,
  createRootRouteWithContext,
} from '@tanstack/react-router';
import type { Api } from '../api';

interface RouterContext {
  queryClient: QueryClient;
  api: Api;
}

const navLinkClass = 'text-sm text-muted-foreground hover:text-foreground';

function Layout() {
  return (
    <div className="flex flex-col gap-6">
      <nav className="flex gap-4">
        <Link to="/" className={navLinkClass}>
          Students
        </Link>
        <Link to="/campuses" className={navLinkClass}>
          Campuses
        </Link>
        <Link to="/fees" className={navLinkClass}>
          Fees
        </Link>
      </nav>
      <Outlet />
    </div>
  );
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: Layout,
});
