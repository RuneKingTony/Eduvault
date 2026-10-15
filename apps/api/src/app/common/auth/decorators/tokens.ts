import type { ActionOf, Permission, Resource } from '@eduvault/policy';

export const PERMISSION_KEY = 'eduvault:permission';

export interface RequiredPermission<R extends Resource = Resource> {
  resource: R;
  action: ActionOf<R>;
}

export const ANY_PERMISSION_KEY = 'eduvault:any-permission';

export type AnyPermission = readonly Permission[];

export const STAFF_ONLY_KEY = 'eduvault:staff-only';

export const ALLOW_TEMPORARY_PASSWORD_KEY = 'eduvault:allow-temporary-password';
