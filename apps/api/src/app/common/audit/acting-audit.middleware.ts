import { Injectable, Logger, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Response } from 'express';
import type { AuthedRequest } from '../auth/auth.types';
import { errorMessage } from '../http/error-message';
import { AuditRepository } from './audit.repository';

const pathOf = (url: string): string => url.split('?', 1)[0] ?? url;

/**
 * A guard-thrown refusal never reaches an interceptor, so the row is written
 * when the response closes, from what the guard stashed on the request.
 */
@Injectable()
export class ActingAuditMiddleware implements NestMiddleware {
  private readonly logger = new Logger(ActingAuditMiddleware.name);

  constructor(private readonly audit: AuditRepository) {}

  use(req: AuthedRequest, res: Response, next: NextFunction): void {
    res.once('close', () => {
      const { actingAudit } = req;
      if (actingAudit === undefined) {
        return;
      }
      this.audit
        .recordActing({
          actorUserId: actingAudit.actorUserId,
          organizationId: actingAudit.organizationId,
          method: req.method,
          path: pathOf(req.originalUrl),
          status: res.statusCode,
          reason: actingAudit.reason,
        })
        .catch((error: unknown) => {
          this.logger.error(
            `Could not write an acting audit row: ${errorMessage(error)}`
          );
        });
    });
    next();
  }
}
