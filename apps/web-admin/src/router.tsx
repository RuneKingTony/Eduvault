import {
  Link,
  Outlet,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { CampusesPage } from './pages/campuses-page';
import { FeesPage } from './pages/fees-page';
import { StudentsPage } from './pages/students-page';

const navLinkClass = 'text-sm text-slate-600 hover:text-slate-900';

function Layout() {
  return (
    <div className="flex flex-col gap-6">
      <Nav />
      <Outlet />
    </div>
  );
}

const rootRoute = createRootRoute({ component: Layout });

const routeTree = rootRoute.addChildren([
  createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: StudentsPage,
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: '/campuses',
    component: CampusesPage,
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: '/fees',
    component: FeesPage,
  }),
]);

export const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

function Nav() {
  return (
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
  );
}
