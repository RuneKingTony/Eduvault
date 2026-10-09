import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import {
  MUST_CHANGE_PASSWORD_MESSAGE,
  type ApiErrorCode,
} from '@eduvault/api-contract';
import type { SessionContext } from '../auth.types';
import { ALLOW_TEMPORARY_PASSWORD_KEY } from '../decorators/tokens';

export function assertPasswordSettled(
  reflector: Reflector,
  context: ExecutionContext,
  session: SessionContext
): void {
  if (!session.mustChangePassword) {
    return;
  }
  const allowed = reflector.get<boolean | undefined>(
    ALLOW_TEMPORARY_PASSWORD_KEY,
    context.getHandler()
  );
  if (allowed !== true) {
    throw new ForbiddenException({
      code: 'MustChangePassword' satisfies ApiErrorCode,
      message: MUST_CHANGE_PASSWORD_MESSAGE,
    });
  }
}
