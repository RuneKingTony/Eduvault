import type { NextFunction, Response } from 'express';
import type { AuthedRequest } from '../auth/auth.types';
import { ActingAuditMiddleware } from './acting-audit.middleware';
import type { AuditRepository } from './audit.repository';

function setup(recordActing = vi.fn().mockResolvedValue(undefined)) {
  const audit = { recordActing } as unknown as AuditRepository;
  const middleware = new ActingAuditMiddleware(audit);
  const closers: (() => void)[] = [];
  const res = {
    statusCode: 200,
    once: (_event: string, listener: () => void) => closers.push(listener),
    emit: () => {
      for (const close of closers) {
        close();
      }
    },
  } as unknown as Response & { emit: (event: string) => void };
  const next = vi.fn() as unknown as NextFunction;
  const run = (req: Partial<AuthedRequest>) => {
    middleware.use(
      {
        method: 'PATCH',
        originalUrl: '/students/s1?x=1',
        ...req,
      } as AuthedRequest,
      res,
      next
    );
    return { next };
  };
  return { run, res, recordActing };
}

describe('ActingAuditMiddleware', () => {
  it('writes no row when the guard stashed nothing', async () => {
    const { run, res, recordActing } = setup();
    run({});
    res.emit('close');
    await Promise.resolve();
    expect(recordActing).not.toHaveBeenCalled();
  });

  it('passes the request on, then writes one row with the final status', async () => {
    const { run, res, recordActing } = setup();
    const { next } = run({
      actingAudit: {
        actorUserId: 'super-1',
        organizationId: 'school-a',
        reason: 'SUP-2207',
      },
    });
    expect(next).toHaveBeenCalledOnce();
    expect(recordActing).not.toHaveBeenCalled();

    (res as { statusCode: number }).statusCode = 403;
    res.emit('close');
    await Promise.resolve();

    expect(recordActing).toHaveBeenCalledExactlyOnceWith({
      actorUserId: 'super-1',
      organizationId: 'school-a',
      method: 'PATCH',
      path: '/students/s1',
      status: 403,
      reason: 'SUP-2207',
    });
  });

  it('does not throw when the insert fails', async () => {
    const { run, res, recordActing } = setup(
      vi.fn().mockRejectedValue(new Error('db down'))
    );
    run({
      actingAudit: {
        actorUserId: 'super-1',
        organizationId: 'school-a',
        reason: null,
      },
    });
    expect(() => res.emit('close')).not.toThrow();
    await Promise.resolve();
    expect(recordActing).toHaveBeenCalledOnce();
  });
});
