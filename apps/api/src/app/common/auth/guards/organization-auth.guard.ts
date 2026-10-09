import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { can } from '@eduvault/policy';
import { AuthContextService } from '../auth-context.service';
import type { AuthedRequest } from '../auth.types';
import { PERMISSION_KEY, type RequiredPermission } from '../decorators/tokens';

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

    const org = await this.context.resolveOrganization(session);
    if (!org) {
      throw new ForbiddenException({
        code: 'NoSchool',
        message: 'No active school for this session',
      });
    }

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
}
