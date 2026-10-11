import { redirect } from '@tanstack/react-router';
import type { PortalMe } from '@eduvault/api-contract';
import { landingRedirect } from './default-page';

export function redirectFromLanding(
  portal: Pick<PortalMe, 'kind'> | null,
  path: '/' | '/children',
  child: string | undefined
): void {
  const to =
    portal === null
      ? undefined
      : landingRedirect({ kind: portal.kind, path, child });
  if (to !== undefined) {
    // eslint-disable-next-line @typescript-eslint/only-throw-error -- redirects are thrown objects
    throw redirect({ to });
  }
}
