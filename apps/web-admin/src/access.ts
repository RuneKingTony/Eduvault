import type { MePermissions } from '@eduvault/api-contract';
import { canAny } from '@eduvault/policy';
import { routeGate } from './nav';
import { redirectTo } from './redirect-to';

export function requireGate(access: MePermissions | null, route: string): void {
  const gate = routeGate(route);
  if (gate !== undefined && !canAny(access?.permissions ?? {}, gate)) {
    redirectTo('/');
  }
}
