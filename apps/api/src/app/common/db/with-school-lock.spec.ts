import { ServiceUnavailableException } from '@nestjs/common';
import type { Pool } from 'pg';
import {
  LOCK_RETRY_MS,
  LOCK_WAIT_MS,
  withSchoolLock,
} from './with-school-lock';

const fakePool = ({
  locks = [true],
  unlockFails = false,
}: { locks?: boolean[]; unlockFails?: boolean } = {}) => {
  const attempts = [...locks];
  const query = vi.fn((sql: string) => {
    if (sql.includes('unlock')) {
      return unlockFails
        ? Promise.reject(new Error('connection lost'))
        : Promise.resolve({ rows: [] });
    }
    return Promise.resolve({ rows: [{ locked: attempts.shift() ?? false }] });
  });
  const release = vi.fn();
  const connect = vi.fn(() => Promise.resolve({ query, release }));
  return { pool: { connect } as unknown as Pool, query, release, connect };
};

describe('withSchoolLock', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('holds the lock on one client while fn runs, then unlocks and releases', async () => {
    const { pool, query, release, connect } = fakePool();
    const order: string[] = [];
    query.mockImplementation((sql: string) => {
      order.push(sql.includes('unlock') ? 'unlock' : 'lock');
      return Promise.resolve({ rows: [{ locked: true }] });
    });

    const result = await withSchoolLock(pool, 'school-1', () => {
      order.push('fn');
      return Promise.resolve(42);
    });

    expect(result).toBe(42);
    expect(connect).toHaveBeenCalledTimes(1);
    expect(order).toEqual(['lock', 'fn', 'unlock']);
    expect(query).toHaveBeenCalledWith(expect.any(String), ['school-1']);
    expect(release).toHaveBeenCalledWith(false);
  });

  it('unlocks and releases when fn throws', async () => {
    const { pool, query, release } = fakePool();

    await expect(
      withSchoolLock(pool, 'school-1', () => Promise.reject(new Error('boom')))
    ).rejects.toThrow('boom');

    expect(query).toHaveBeenCalledTimes(2);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('destroys a client that could not unlock', async () => {
    const { pool, release } = fakePool({ unlockFails: true });

    await withSchoolLock(pool, 'school-1', () => Promise.resolve());

    expect(release).toHaveBeenCalledWith(true);
  });

  it('gives its client back between attempts while the lock is taken', async () => {
    vi.useFakeTimers();
    const { pool, release, connect } = fakePool({
      locks: [false, false, true],
    });

    const pending = withSchoolLock(pool, 'school-1', () =>
      Promise.resolve('done')
    );
    await vi.advanceTimersByTimeAsync(LOCK_RETRY_MS * 2);

    await expect(pending).resolves.toBe('done');
    expect(connect).toHaveBeenCalledTimes(3);
    expect(release).toHaveBeenNthCalledWith(1);
    expect(release).toHaveBeenNthCalledWith(2);
  });

  it('answers 503 and holds no client when the lock never frees', async () => {
    vi.useFakeTimers();
    const { pool, release, connect } = fakePool({ locks: [] });
    const fn = vi.fn();

    const pending = withSchoolLock(pool, 'school-1', fn);
    await Promise.all([
      expect(pending).rejects.toBeInstanceOf(ServiceUnavailableException),
      vi.advanceTimersByTimeAsync(LOCK_WAIT_MS + LOCK_RETRY_MS),
    ]);

    expect(fn).not.toHaveBeenCalled();
    expect(release).toHaveBeenCalledTimes(connect.mock.calls.length);
  });

  it('destroys a client whose lock attempt failed', async () => {
    const { pool, query, release } = fakePool();
    query.mockRejectedValueOnce(new Error('connection lost'));

    await expect(
      withSchoolLock(pool, 'school-1', () => Promise.resolve())
    ).rejects.toThrow('connection lost');

    expect(release).toHaveBeenCalledWith(true);
  });
});
