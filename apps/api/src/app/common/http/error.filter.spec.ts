import {
  ForbiddenException,
  Logger,
  type ArgumentsHost,
  NotFoundException,
} from '@nestjs/common';
import { ErrorFilter } from './error.filter';

function run(exception: unknown) {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({ getResponse: () => ({ status }) }),
  } as unknown as ArgumentsHost;
  new ErrorFilter().catch(exception, host);
  return { status: status.mock.calls[0]?.[0], body: json.mock.calls[0]?.[0] };
}

describe('ErrorFilter', () => {
  beforeEach(() => {
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  it('maps HTTP exceptions to the contract error body', () => {
    expect(run(new NotFoundException('Student not found'))).toEqual({
      status: 404,
      body: { code: 'NotFound', message: 'Student not found' },
    });
    expect(run(new ForbiddenException('nope')).body.code).toBe('Forbidden');
  });

  it('maps Postgres violations to 409', () => {
    expect(run({ code: '23505' }).status).toBe(409);
    expect(run({ code: '23503' }).status).toBe(409);
  });

  it('maps Better Auth 4xx errors to their status', () => {
    const error = Object.assign(new Error('Banned'), {
      name: 'APIError',
      statusCode: 403,
    });
    expect(run(error)).toEqual({
      status: 403,
      body: { code: 'Forbidden', message: 'Banned' },
    });
  });

  it('hides unexpected errors behind a 500', () => {
    const { status, body } = run(new Error('db password is hunter2'));
    expect(status).toBe(500);
    expect(body.message).toBe('Internal server error');
  });
});
