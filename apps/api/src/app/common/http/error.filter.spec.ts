import {
  ForbiddenException,
  Logger,
  type ArgumentsHost,
  NotFoundException,
  UnprocessableEntityException,
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

  it('keeps a listed code from the exception and falls back to the status for any other', () => {
    expect(
      run(new ForbiddenException({ code: 'NoSchool', message: 'No school' }))
        .body.code
    ).toBe('NoSchool');
    expect(
      run(new ForbiddenException({ code: 'Made up', message: 'x' })).body.code
    ).toBe('Forbidden');
    expect(run(new UnprocessableEntityException('x')).body.code).toBe(
      'BadRequest'
    );
  });

  it('maps Postgres violations to 409', () => {
    expect(run({ code: '23505' }).status).toBe(409);
    expect(run({ code: '23503' }).status).toBe(409);
  });

  it('maps a self-approval check violation to SelfApproval', () => {
    expect(
      run({ code: '23514', constraint: 'payment_void_approved_by_not_self' })
    ).toEqual({
      status: 409,
      body: {
        code: 'SelfApproval',
        message: 'You created this. Someone else must approve it.',
      },
    });
  });

  it('maps any other check violation to Conflict', () => {
    expect(
      run({ code: '23514', constraint: 'fee_amount_nonnegative' })
    ).toEqual({
      status: 409,
      body: {
        code: 'Conflict',
        message: 'The change breaks a rule on this record',
      },
    });
    expect(run({ code: '23514' }).body.code).toBe('Conflict');
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
