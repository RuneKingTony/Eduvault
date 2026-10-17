import {
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import {
  ALREADY_DECIDED_MESSAGE,
  SELF_APPROVAL_MESSAGE,
  YEAR_OVERLAP_MESSAGE,
  apiErrorCodeSchema,
  type ApiErrorBody,
  type ApiErrorCode,
} from '@eduvault/api-contract';
import type { Response } from 'express';

const CODES: Partial<Record<number, ApiErrorCode>> = {
  400: 'BadRequest',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'NotFound',
  409: 'Conflict',
};

const codeFor = (status: number): ApiErrorCode =>
  CODES[status] ?? (status >= 500 ? 'InternalError' : 'BadRequest');

const PG_UNIQUE_VIOLATION = '23505';
const PG_FOREIGN_KEY_VIOLATION = '23503';
const PG_CHECK_VIOLATION = '23514';
const PG_EXCLUSION_VIOLATION = '23P01';

const pgConstraint = (error: unknown): string =>
  typeof error === 'object' && error !== null && 'constraint' in error
    ? String(error.constraint)
    : '';

const pgCode = (error: unknown): string | undefined =>
  typeof error === 'object' && error !== null && 'code' in error
    ? String(error.code)
    : undefined;

const conflict = (message: string, code: ApiErrorCode = 'Conflict') => ({
  status: HttpStatus.CONFLICT,
  body: { code, message },
});

function describeCheckViolation(exception: unknown) {
  const constraint = pgConstraint(exception);
  // Convention: a self-approval CHECK is named `<table>_<action>_not_self`.
  if (constraint.includes('not_self')) {
    return conflict(SELF_APPROVAL_MESSAGE, 'SelfApproval');
  }
  // The trigger on a decided approval record is named `<table>_decided_frozen`.
  if (constraint.endsWith('_decided_frozen')) {
    return conflict(ALREADY_DECIDED_MESSAGE, 'AlreadyDecided');
  }
  return conflict('The change breaks a rule on this record');
}

const describeExclusionViolation = (exception: unknown) =>
  conflict(
    pgConstraint(exception) === 'academic_session_no_overlap'
      ? YEAR_OVERLAP_MESSAGE
      : 'The change overlaps another record'
  );

const POSTGRES_VIOLATIONS: Partial<
  Record<string, (exception: unknown) => { status: number; body: ApiErrorBody }>
> = {
  [PG_UNIQUE_VIOLATION]: () => conflict('Resource already exists'),
  [PG_FOREIGN_KEY_VIOLATION]: () =>
    conflict('Resource is referenced by, or references, other records'),
  [PG_CHECK_VIOLATION]: describeCheckViolation,
  [PG_EXCLUSION_VIOLATION]: describeExclusionViolation,
};

const describePostgres = (
  exception: unknown
): { status: number; body: ApiErrorBody } | undefined => {
  const code = pgCode(exception);
  return code === undefined
    ? undefined
    : POSTGRES_VIOLATIONS[code]?.(exception);
};

/** Better Auth's server API throws APIError carrying an HTTP status. */
const betterAuthStatus = (
  error: unknown
): { status: number; message: string } | undefined => {
  if (!(error instanceof Error) || error.name !== 'APIError') {
    return undefined;
  }
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

  private describeHttp(exception: HttpException): {
    status: number;
    body: ApiErrorBody;
  } {
    const status = exception.getStatus();
    const raw = exception.getResponse();
    const payload =
      typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
    const named = apiErrorCodeSchema.safeParse(payload['code']);
    return {
      status,
      body: {
        code: named.success ? named.data : codeFor(status),
        message:
          typeof payload['message'] === 'string'
            ? payload['message']
            : exception.message,
        ...(typeof payload['creditMinor'] === 'number'
          ? { creditMinor: payload['creditMinor'] }
          : {}),
        ...(Array.isArray(payload['issues'])
          ? { issues: payload['issues'] as ApiErrorBody['issues'] }
          : {}),
      },
    };
  }

  private describe(exception: unknown): {
    status: number;
    body: ApiErrorBody;
  } {
    if (exception instanceof HttpException) {
      return this.describeHttp(exception);
    }

    const upstream = betterAuthStatus(exception);
    if (upstream) {
      return {
        status: upstream.status,
        body: {
          code: codeFor(upstream.status),
          message: upstream.message,
        },
      };
    }

    const violation = describePostgres(exception);
    if (violation) {
      return violation;
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
