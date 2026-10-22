import { ForbiddenException } from '@nestjs/common';
import { missingPermissionMessage } from '@eduvault/api-contract';
import { holds, type Permission } from '@eduvault/policy';
import type { OrgContext } from './auth.types';

/** For a permission that depends on the payload, so the handler's guard cannot name it. */
export function requirePermission(
  ctx: Pick<OrgContext, 'permissions'>,
  permission: Permission
): void {
  if (!holds(ctx.permissions, permission)) {
    throw new ForbiddenException(missingPermissionMessage(permission));
  }
}
