import {
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { AuthContextService } from '../auth-context.service';
import type { AuthedRequest } from '../auth.types';

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(private readonly context: AuthContextService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthedRequest>();
    const session = await this.context.resolveSession(request);
    if (!session) throw new UnauthorizedException('Authentication is required');
    request.authSession = session;
    return true;
  }
}
