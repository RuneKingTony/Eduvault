import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { zod } from './zod.pipe';

describe('ZodPipe', () => {
  const pipe = zod(z.object({ name: z.string().min(1) }));

  it('returns parsed data', () => {
    expect(pipe.transform({ name: 'Ada' })).toEqual({ name: 'Ada' });
  });

  it('throws a 400 whose body lists each issue path', () => {
    try {
      pipe.transform({ name: '' });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toMatchObject({
        code: 'ValidationError',
        issues: [{ path: 'name' }],
      });
    }
  });
});
