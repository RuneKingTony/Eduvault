import { redirect } from '@tanstack/react-router';
import type { MePermissions } from '@eduvault/api-contract';
import { canAny } from '@eduvault/policy';
import { routeGate } from './nav';

/** Sends a member without the route's permission to the Dashboard, with no message. */
export function requireGate(access: MePermissions, route: string): void {
  const gate = routeGate(route);
  if (gate !== undefined && !canAny(access.permissions, gate)) {
    // eslint-disable-next-line @typescript-eslint/only-throw-error -- TanStack Router redirects are thrown objects
    throw redirect({ to: '/' });
  }
}
