import {
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthContextService } from '../auth-context.service';
import type { AuthedRequest } from '../auth.types';
import { assertPasswordSettled } from './password-rule';

@Injectable()
export class SessionAuthGuard implements CanActivate {
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
    request.authSession = session;
    return true;
  }
}
