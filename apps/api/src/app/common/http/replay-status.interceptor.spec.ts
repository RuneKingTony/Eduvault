import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { lastValueFrom, of } from 'rxjs';
import { ReplayStatusInterceptor } from './replay-status.interceptor';

async function run(result: unknown) {
  const status = vi.fn();
  const context = {
    switchToHttp: () => ({ getResponse: () => ({ status }) }),
  } as unknown as ExecutionContext;
  const handler: CallHandler = { handle: () => of(result) };
  const answered = await lastValueFrom(
    new ReplayStatusInterceptor().intercept(context, handler)
  );
  return { answered, status };
}

describe('ReplayStatusInterceptor', () => {
  it('answers 200 when the result says it was replayed, and returns it unchanged', async () => {
    const result = { id: 'topup-1', replayed: true };
    const { answered, status } = await run(result);
    expect(answered).toBe(result);
    expect(status).toHaveBeenCalledExactlyOnceWith(200);
  });

  it('leaves the default status for a first success', async () => {
    const { status } = await run({ id: 'topup-1', replayed: false });
    expect(status).not.toHaveBeenCalled();
  });

  it.each([undefined, null, 'replayed', 7, { replayed: 'true' }, {}])(
    'ignores a result that is not a replay: %j',
    async (result) => {
      const { status } = await run(result);
      expect(status).not.toHaveBeenCalled();
    }
  );
});
