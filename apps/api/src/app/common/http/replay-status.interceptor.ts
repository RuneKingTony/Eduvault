import {
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import type { Response } from 'express';
import { tap, type Observable } from 'rxjs';

const isReplay = (result: unknown): boolean =>
  typeof result === 'object' &&
  result !== null &&
  'replayed' in result &&
  result.replayed === true;

@Injectable()
export class ReplayStatusInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      tap((result) => {
        if (isReplay(result)) {
          context.switchToHttp().getResponse<Response>().status(200);
        }
      })
    );
  }
}
