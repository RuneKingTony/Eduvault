import type { PortalKind } from '@eduvault/api-contract';

interface Landing {
  kind: PortalKind;
  path: '/' | '/children';
  child: string | undefined;
}

export function landingRedirect({
  kind,
  path,
  child,
}: Landing): '/' | '/children' | undefined {
  if (kind === 'guardian' && path === '/' && child === undefined) {
    return '/children';
  }
  return kind === 'student' && path === '/children' ? '/' : undefined;
}
