import {
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import type { ApiErrorBody } from '@eduvault/api-contract';
import type { Response } from 'express';

const CODES: Record<number, string> = {
  400: 'BadRequest',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'NotFound',
  409: 'Conflict',
};

const PG_UNIQUE_VIOLATION = '23505';
const PG_FOREIGN_KEY_VIOLATION = '23503';

const pgCode = (error: unknown): string | undefined =>
  typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code: unknown }).code)
    : undefined;

/** Better Auth's server API throws APIError carrying an HTTP status. */
const betterAuthStatus = (
  error: unknown
): { status: number; message: string } | undefined => {
  if (!(error instanceof Error) || error.name !== 'APIError') return undefined;
  const status = (error as { statusCode?: unknown }).statusCode;
  return typeof status === 'number' && status >= 400 && status < 500
    ? { status, message: error.message }
    : undefined;
};

@Catch()
export class ErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger(ErrorFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const { status, body } = this.describe(exception);
    response.status(status).json(body);
  }

  private describe(exception: unknown): {
    status: number;
    body: ApiErrorBody;
  } {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const raw = exception.getResponse();
      const payload =
        typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
      return {
        status,
        body: {
          code:
            typeof payload['code'] === 'string'
              ? payload['code']
              : (CODES[status] ?? 'Error'),
          message:
            typeof payload['message'] === 'string'
              ? payload['message']
              : exception.message,
          ...(Array.isArray(payload['issues'])
            ? { issues: payload['issues'] as ApiErrorBody['issues'] }
            : {}),
        },
      };
    }

    const upstream = betterAuthStatus(exception);
    if (upstream) {
      return {
        status: upstream.status,
        body: {
          code: CODES[upstream.status] ?? 'Error',
          message: upstream.message,
        },
      };
    }

    const code = pgCode(exception);
    if (code === PG_UNIQUE_VIOLATION) {
      return {
        status: HttpStatus.CONFLICT,
        body: { code: 'Conflict', message: 'Resource already exists' },
      };
    }
    if (code === PG_FOREIGN_KEY_VIOLATION) {
      return {
        status: HttpStatus.CONFLICT,
        body: {
          code: 'Conflict',
          message: 'Resource is referenced by, or references, other records',
        },
      };
    }

    this.logger.error(
      exception instanceof Error ? exception.stack : String(exception)
    );
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      body: { code: 'InternalError', message: 'Internal server error' },
    };
  }
}
