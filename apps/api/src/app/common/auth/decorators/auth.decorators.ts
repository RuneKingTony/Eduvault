import {
  SetMetadata,
  UnauthorizedException,
  UseGuards,
  applyDecorators,
  createParamDecorator,
  type ExecutionContext,
} from '@nestjs/common';
import type { ActionOf, Resource } from '@eduvault/policy';
import type { AuthedRequest, OrgContext, SessionContext } from '../auth.types';
import { OrganizationAuthGuard } from '../guards/organization-auth.guard';
import { SessionAuthGuard } from '../guards/session-auth.guard';
import { PERMISSION_KEY, type RequiredPermission } from './tokens';

/** Requires a signed-in, non-banned user. */
export const SessionAuth = () => UseGuards(SessionAuthGuard);

/**
 * Requires a signed-in user acting in a school, and — when given — that their
 * role there grants the permission. Put it on each handler, not the class, so
 * the guard runs once per request.
 */
export const OrganizationAuth = <R extends Resource>(
  resource?: R,
  action?: ActionOf<R>
) =>
  applyDecorators(
    SetMetadata(
      PERMISSION_KEY,
      resource && action
        ? ({ resource, action } satisfies RequiredPermission<R>)
        : undefined
    ),
    UseGuards(OrganizationAuthGuard)
  );

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
