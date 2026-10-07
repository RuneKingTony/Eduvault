import type { ActionOf, Resource } from '@eduvault/policy';

export const PERMISSION_KEY = 'eduvault:permission';

export interface RequiredPermission<R extends Resource = Resource> {
  resource: R;
  action: ActionOf<R>;
}
