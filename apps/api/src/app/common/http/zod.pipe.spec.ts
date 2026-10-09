import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { zod } from './zod.pipe';

describe('ZodPipe', () => {
  const pipe = zod(z.object({ name: z.string().min(1) }));
  const failure = (): unknown => pipe.transform({ name: '' });

  it('returns parsed data', () => {
    expect(pipe.transform({ name: 'Ada' })).toEqual({ name: 'Ada' });
  });

  it('throws a 400 whose body lists each issue path', () => {
    expect(failure).toThrow(BadRequestException);
    expect(failure).toThrow(
      expect.objectContaining({
        response: expect.objectContaining({
          code: 'ValidationError',
          issues: [expect.objectContaining({ path: 'name' })],
        }),
      })
    );
  });
});
