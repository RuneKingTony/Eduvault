import { BadRequestException, ConflictException } from '@nestjs/common';
import {
  ALREADY_DECIDED_MESSAGE,
  DECLINE_REASON_MESSAGE,
  SELF_APPROVAL_MESSAGE,
} from '@eduvault/api-contract';
import { assertDeclineReason, assertNotOwn, decide } from './decide';

const conflictBody = async (promise: Promise<unknown>) => {
  const error = await promise.then(
    () => undefined,
    (error_: unknown) => error_
  );
  expect(error).toBeInstanceOf(ConflictException);
  return (error as ConflictException).getResponse();
};

const own = () => assertNotOwn({ actorId: 'chika', createdBy: 'chika' });

describe('assertNotOwn', () => {
  it('refuses the creator with the SelfApproval code and the PRD words', () => {
    expect(() => own()).toThrow(ConflictException);
    expect(() => own()).toThrow(SELF_APPROVAL_MESSAGE);
  });

  it('lets someone else decide, and anyone decide a request with no creator', () => {
    expect(() =>
      assertNotOwn({ actorId: 'grace', createdBy: 'chika' })
    ).not.toThrow();
    expect(() =>
      assertNotOwn({ actorId: 'grace', createdBy: null })
    ).not.toThrow();
  });
});

describe('assertDeclineReason', () => {
  it('trims a reason', () => {
    expect(assertDeclineReason('  Not agreed ')).toBe('Not agreed');
  });

  it('refuses a blank reason with 400', () => {
    expect(() => assertDeclineReason('   ')).toThrow(BadRequestException);
    expect(() => assertDeclineReason('')).toThrow(DECLINE_REASON_MESSAGE);
  });
});

describe('decide', () => {
  it('runs the update for someone else and resolves', async () => {
    const apply = vi.fn(() => Promise.resolve(true));
    await decide({ actorId: 'grace', createdBy: 'chika' }, apply);
    expect(apply).toHaveBeenCalledTimes(1);
  });

  it('answers 409 SelfApproval before the update runs', async () => {
    const apply = vi.fn(() => Promise.resolve(true));
    const body = await conflictBody(
      decide({ actorId: 'chika', createdBy: 'chika' }, apply)
    );
    expect(body).toEqual({
      code: 'SelfApproval',
      message: SELF_APPROVAL_MESSAGE,
    });
    expect(apply).not.toHaveBeenCalled();
  });

  it('answers 409 AlreadyDecided when the conditional update changed no row', async () => {
    const body = await conflictBody(
      decide({ actorId: 'grace', createdBy: 'chika' }, () =>
        Promise.resolve(false)
      )
    );
    expect(body).toEqual({
      code: 'AlreadyDecided',
      message: ALREADY_DECIDED_MESSAGE,
    });
  });

  it('lets a failure inside the update pass through untouched', async () => {
    await expect(
      decide({ actorId: 'grace', createdBy: null }, () =>
        Promise.reject(new Error('boom'))
      )
    ).rejects.toThrow('boom');
  });
});
