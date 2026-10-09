import { BadRequestException } from '@nestjs/common';
import type { ApiErrorCode } from '@eduvault/api-contract';
import type { z } from 'zod';

/** Cursors are opaque to clients: base64url JSON of the sort key. */
export const encodeCursor = (key: unknown): string =>
  Buffer.from(JSON.stringify(key)).toString('base64url');

const parseJson = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
};

export function decodeCursor<S extends z.ZodType>(
  cursor: string,
  schema: S
): z.output<S> {
  const parsed = schema.safeParse(
    parseJson(Buffer.from(cursor, 'base64url').toString('utf8'))
  );
  if (parsed.success) {
    return parsed.data;
  }
  throw new BadRequestException({
    code: 'ValidationError' satisfies ApiErrorCode,
    message: 'Request validation failed',
    issues: [{ path: 'cursor', message: 'The cursor is not valid.' }],
  });
}
