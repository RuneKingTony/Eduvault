import type { ActionOf, Resource } from '@eduvault/policy';

export const PERMISSION_KEY = 'eduvault:permission';

export interface RequiredPermission<R extends Resource = Resource> {
  resource: R;
  action: ActionOf<R>;
}

export const STAFF_ONLY_KEY = 'eduvault:staff-only';

export const ALLOW_TEMPORARY_PASSWORD_KEY = 'eduvault:allow-temporary-password';
