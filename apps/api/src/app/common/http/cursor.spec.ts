import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { decodeCursor, encodeCursor } from './cursor';

const key = z.object({ name: z.string(), id: z.string() });

describe('cursor', () => {
  it('round-trips a sort key through base64url', () => {
    const cursor = encodeCursor({ name: 'Greenfield', id: 'o1' });
    expect(cursor).toMatch(/^[\w-]+$/);
    expect(decodeCursor(cursor, key)).toEqual({ name: 'Greenfield', id: 'o1' });
  });

  it.each([
    ['not base64 json', '%%%'],
    ['json of the wrong shape', encodeCursor({ other: 1 })],
    ['not json', Buffer.from('plain text').toString('base64url')],
  ])('answers 400 for %s', (_name, cursor) => {
    expect(() => decodeCursor(cursor, key)).toThrow(BadRequestException);
  });
});
