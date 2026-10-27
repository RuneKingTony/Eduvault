import type { Pool, PoolClient } from 'pg';
import { expect } from 'vitest';

export async function waitForLockWait(
  pool: Pool,
  holder: PoolClient,
  waiting = 1
): Promise<void> {
  const { rows } = await holder.query<{ pid: number }>(
    'SELECT pg_backend_pid() AS pid'
  );
  const holderPid = rows[0]?.pid;
  await expect
    .poll(
      async () => {
        const blocked = await pool.query<{ n: number }>(
          `WITH direct AS (
             SELECT pid FROM pg_stat_activity WHERE $1 = ANY(pg_blocking_pids(pid))
           )
           SELECT count(*)::int AS n FROM pg_stat_activity a
           WHERE a.pid IN (SELECT pid FROM direct)
              OR EXISTS (
                SELECT 1 FROM unnest(pg_blocking_pids(a.pid)) b
                WHERE b IN (SELECT pid FROM direct))`,
          [holderPid]
        );
        return blocked.rows[0]?.n;
      },
      { timeout: 5000, interval: 50 }
    )
    .toBeGreaterThanOrEqual(waiting);
}
