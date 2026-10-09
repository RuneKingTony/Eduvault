import { isAPIError } from 'better-auth/api';

const hasProp = <K extends string>(
  value: unknown,
  key: K
): value is Record<K, unknown> =>
  typeof value === 'object' && value !== null && key in value;

/** Better Auth checks the slug before it inserts, so a lost race arrives as a unique violation. */
export function isSlugConflict(error: unknown): boolean {
  if (isAPIError(error)) {
    return (
      (error.body as { code?: string } | undefined)?.code ===
      'ORGANIZATION_ALREADY_EXISTS'
    );
  }
  if (hasProp(error, 'code') && error.code === '23505') {
    return (
      hasProp(error, 'constraint') && String(error.constraint).includes('slug')
    );
  }
  return hasProp(error, 'cause') && isSlugConflict(error.cause);
}
