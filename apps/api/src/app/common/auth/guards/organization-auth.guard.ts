import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { ApiErrorCode } from '@eduvault/api-contract';
import { can } from '@eduvault/policy';
import { isWriteMethod } from '../acting';
import { AuthContextService } from '../auth-context.service';
import type { AuthedRequest, OrgContext, SessionContext } from '../auth.types';
import { PERMISSION_KEY, type RequiredPermission } from '../decorators/tokens';
import { assertPasswordSettled } from './password-rule';

@Injectable()
export class OrganizationAuthGuard implements CanActivate {
  constructor(
    private readonly context: AuthContextService,
    private readonly reflector: Reflector
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthedRequest>();
    const session = await this.context.resolveSession(request);
    if (!session) {
      throw new UnauthorizedException('Authentication is required');
    }

    assertPasswordSettled(this.reflector, context, session);

    const org = await this.resolveOrg(request, session);
    assertWritable(org, request.method);

    const required = this.reflector.get<RequiredPermission | undefined>(
      PERMISSION_KEY,
      context.getHandler()
    );
    if (required && !can(org.permissions, required.resource, required.action)) {
      throw new ForbiddenException(
        `Missing permission ${required.resource}:${required.action}`
      );
    }

    request.authSession = session;
    request.org = org;
    return true;
  }

  private async resolveOrg(
    request: AuthedRequest,
    session: SessionContext
  ): Promise<OrgContext> {
    const acting = await this.context.resolveActing(session, request);
    if (acting) {
      return acting;
    }

    const [org, paused] = await Promise.all([
      this.context.resolveOrganization(session),
      session.activeOrganizationId === null
        ? null
        : this.context.findSuspendedSchool(session.activeOrganizationId),
    ]);
    if (!org) {
      throw new ForbiddenException({
        code: 'NoSchool' satisfies ApiErrorCode,
        message: 'No active school for this session',
      });
    }
    if (paused !== null) {
      throw new ForbiddenException({
        code: 'SchoolSuspended' satisfies ApiErrorCode,
        message: `${paused.name} is paused on Eduvault. Contact the school for details.`,
      });
    }
    return org;
  }
}

function assertWritable(org: OrgContext, method: string): void {
  if (org.acting && !org.acting.writes && isWriteMethod(method)) {
    throw new ForbiddenException({
      code: 'ActingReadOnly' satisfies ApiErrorCode,
      message: 'Acting read-only. A write needs a reason.',
    });
  }
}
