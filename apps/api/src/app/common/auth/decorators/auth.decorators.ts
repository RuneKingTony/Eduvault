import {
  SetMetadata,
  UnauthorizedException,
  UseGuards,
  applyDecorators,
  createParamDecorator,
  type ExecutionContext,
} from '@nestjs/common';
import type { ActionOf, Permission, Resource } from '@eduvault/policy';
import type { AuthedRequest, OrgContext, SessionContext } from '../auth.types';
import { OrganizationAuthGuard } from '../guards/organization-auth.guard';
import { PlatformAuthGuard } from '../guards/platform-auth.guard';
import { SessionAuthGuard } from '../guards/session-auth.guard';
import {
  ALLOW_TEMPORARY_PASSWORD_KEY,
  ANY_PERMISSION_KEY,
  PERMISSION_KEY,
  STAFF_ONLY_KEY,
  type RequiredPermission,
} from './tokens';

interface SessionAuthOptions {
  allowTemporaryPassword?: boolean;
}

export const SessionAuth = ({
  allowTemporaryPassword = false,
}: SessionAuthOptions = {}) =>
  applyDecorators(
    SetMetadata(ALLOW_TEMPORARY_PASSWORD_KEY, allowTemporaryPassword),
    UseGuards(SessionAuthGuard)
  );

export const PlatformAuth = () => UseGuards(PlatformAuthGuard);

/**
 * Requires a signed-in user acting in a school, and — when given — that their
 * role there grants the permission, or any one of a list of permissions.
 * Put it on each handler, not the class, so the guard runs once per request.
 */
export function OrganizationAuth(
  anyOf?: readonly Permission[]
): MethodDecorator;
export function OrganizationAuth<R extends Resource>(
  resource: R,
  action: ActionOf<R>
): MethodDecorator;
export function OrganizationAuth<R extends Resource>(
  first?: R | readonly Permission[],
  action?: ActionOf<R>
): MethodDecorator {
  const anyOf = Array.isArray(first)
    ? (first as readonly Permission[])
    : undefined;
  const resource = typeof first === 'string' ? first : undefined;
  return applyDecorators(
    SetMetadata(
      PERMISSION_KEY,
      resource !== undefined && action !== undefined
        ? ({ resource, action } satisfies RequiredPermission<R>)
        : undefined
    ),
    SetMetadata(ANY_PERMISSION_KEY, anyOf),
    UseGuards(OrganizationAuthGuard)
  );
}

export const StaffOnlyAuth = (message: string) =>
  applyDecorators(SetMetadata(STAFF_ONLY_KEY, message), OrganizationAuth());

export const CurrentSession = createParamDecorator(
  (_data: unknown, context: ExecutionContext): SessionContext => {
    const { authSession } = context.switchToHttp().getRequest<AuthedRequest>();
    if (!authSession) {
      throw new UnauthorizedException();
    }
    return authSession;
  }
);

/** The active school, role and campus scope; only valid behind OrganizationAuth. */
export const Org = createParamDecorator(
  (_data: unknown, context: ExecutionContext): OrgContext => {
    const { org } = context.switchToHttp().getRequest<AuthedRequest>();
    if (!org) {
      throw new UnauthorizedException();
    }
    return org;
  }
);
