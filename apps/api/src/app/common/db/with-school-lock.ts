import { ServiceUnavailableException } from '@nestjs/common';
import type { Pool, PoolClient } from 'pg';

const TRY_LOCK =
  'SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS locked';
const UNLOCK = 'SELECT pg_advisory_unlock(hashtextextended($1, 0))';

export const LOCK_RETRY_MS = 50;
export const LOCK_WAIT_MS = 10_000;

const pause = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

// A waiter hands its pool client back between attempts, so a queue of waiters
// cannot take every connection and starve the holder's own transaction.
async function acquire(
  pool: Pool,
  organizationId: string
): Promise<PoolClient> {
  const deadline = Date.now() + LOCK_WAIT_MS;
  for (;;) {
    const client = await pool.connect();
    try {
      const { rows } = await client.query<{ locked: boolean }>(TRY_LOCK, [
        organizationId,
      ]);
      if (rows[0]?.locked === true) {
        return client;
      }
    } catch (error) {
      client.release(true);
      throw error;
    }
    client.release();
    if (Date.now() >= deadline) {
      throw new ServiceUnavailableException(
        'Another change to this school is in progress. Try again.'
      );
    }
    await pause(LOCK_RETRY_MS);
  }
}

/**
 * Serialises a school's read-then-write membership changes (last owner,
 * duplicate add). The lock is per session, so it holds its own client.
 */
export async function withSchoolLock<T>(
  pool: Pool,
  organizationId: string,
  fn: () => Promise<T>
): Promise<T> {
  const client = await acquire(pool, organizationId);
  let healthy = true;
  try {
    return await fn();
  } finally {
    try {
      await client.query(UNLOCK, [organizationId]);
    } catch {
      healthy = false;
    }
    // A client that could not unlock is destroyed so its session lock dies with it.
    client.release(!healthy);
  }
}
