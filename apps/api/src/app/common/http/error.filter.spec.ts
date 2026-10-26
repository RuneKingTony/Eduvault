import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Logger,
  type ArgumentsHost,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { JOURNAL_REFERENCE_CLASH_MESSAGE } from '@eduvault/api-contract';
import { ReferenceClashError } from '../ledger/ledger-lines';
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

  it('maps an exclusion violation to Conflict, naming the school year overlap', () => {
    expect(
      run({ code: '23P01', constraint: 'academic_session_no_overlap' })
    ).toEqual({
      status: 409,
      body: {
        code: 'Conflict',
        message: 'These dates overlap another school year.',
      },
    });
    expect(
      run({ code: '23P01', constraint: 'staff_leave_no_overlap' })
    ).toEqual({
      status: 409,
      body: {
        code: 'Conflict',
        message: 'You already asked for leave on some of these days.',
      },
    });
    expect(run({ code: '23P01', constraint: 'other_no_overlap' })).toEqual({
      status: 409,
      body: { code: 'Conflict', message: 'The change overlaps another record' },
    });
  });

  it('maps an update of a decided approval record to AlreadyDecided', () => {
    for (const constraint of [
      'adjustment_decided_frozen',
      'payment_void_decided_frozen',
      'staff_leave_decided_frozen',
    ]) {
      expect(run({ code: '23514', constraint })).toEqual({
        status: 409,
        body: {
          code: 'AlreadyDecided',
          message: 'This has already been decided.',
        },
      });
    }
  });

  it('answers a refused delete of a leave request with a plain 409', () => {
    expect(
      run({ code: '23514', constraint: 'staff_leave_never_deleted' })
    ).toEqual({
      status: 409,
      body: {
        code: 'Conflict',
        message: 'The change breaks a rule on this record',
      },
    });
  });

  it('keeps a creditMinor from the exception in the body', () => {
    expect(
      run(
        new BadRequestException({
          message: 'A refund pays back credit held.',
          creditMinor: 500_000,
        })
      ).body
    ).toEqual({
      code: 'BadRequest',
      message: 'A refund pays back credit held.',
      creditMinor: 500_000,
    });
  });

  it('keeps a report from the exception in the body', () => {
    expect(
      run(
        new ConflictException({
          code: 'CreditMigrationChanged',
          message: 'The figures changed. Check them again.',
          report: { totals: { familyCount: 1 } },
        })
      ).body
    ).toEqual({
      code: 'CreditMigrationChanged',
      message: 'The figures changed. Check them again.',
      report: { totals: { familyCount: 1 } },
    });
  });

  it('words the store payment guard with the sale copy', () => {
    expect(
      run({ code: '23514', constraint: 'payment_store_sale_stays_posted' })
    ).toEqual({
      status: 409,
      body: {
        code: 'Conflict',
        message:
          'This payment is for a store sale. It can’t be cancelled on its own.',
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

  it('answers a journal reference clash with a plain 409', () => {
    expect(run(new ReferenceClashError('ADJ-2026-0001'))).toEqual({
      status: 409,
      body: { code: 'Conflict', message: JOURNAL_REFERENCE_CLASH_MESSAGE },
    });
  });

  it('hides unexpected errors behind a 500', () => {
    const { status, body } = run(new Error('db password is hunter2'));
    expect(status).toBe(500);
    expect(body.message).toBe('Internal server error');
  });
});
