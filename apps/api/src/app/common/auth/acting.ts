import { BadRequestException } from '@nestjs/common';
import {
  ACTING_REASON_HEADER,
  ACTING_REASON_MAX_LENGTH,
  actingReasonSchema,
  isReadMethod,
  type ApiErrorCode,
} from '@eduvault/api-contract';
import {
  ALL_PERMISSIONS,
  READ_PERMS,
  toPermissionMap,
  type PermissionMap,
} from '@eduvault/policy';

export const isWriteMethod = (method: string): boolean => !isReadMethod(method);

export const actingPermissions = (writes: boolean): PermissionMap =>
  toPermissionMap(writes ? ALL_PERMISSIONS : READ_PERMS);

const invalidReason = (message: string) =>
  new BadRequestException({
    code: 'ValidationError' satisfies ApiErrorCode,
    message: 'Request validation failed',
    issues: [{ path: ACTING_REASON_HEADER, message }],
  });

function decodeReason(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    throw invalidReason('The reason must be percent-encoded.');
  }
}

export function parseActingReason(
  header: string | string[] | undefined
): string | null {
  const raw = (Array.isArray(header) ? header[0] : header)?.trim() ?? '';
  if (raw === '') {
    return null;
  }
  const decoded = decodeReason(raw).trim();
  if (decoded === '') {
    return null;
  }
  const parsed = actingReasonSchema.safeParse(decoded);
  if (!parsed.success) {
    throw invalidReason(
      `The reason must be ${ACTING_REASON_MAX_LENGTH} characters or fewer.`
    );
  }
  return parsed.data;
}
