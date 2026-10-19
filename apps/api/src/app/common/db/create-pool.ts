import { Logger } from '@nestjs/common';
import { Pool } from 'pg';
import type { Env } from '../config/env';

type PoolEnv = Pick<
  Env,
  'DATABASE_URL' | 'DATABASE_POOL_MAX' | 'DATABASE_CONNECT_TIMEOUT_MS'
>;

export function createPool(env: PoolEnv): Pool {
  const pool = new Pool({
    connectionString: env.DATABASE_URL,
    max: env.DATABASE_POOL_MAX,
    connectionTimeoutMillis: env.DATABASE_CONNECT_TIMEOUT_MS,
  });
  const logger = new Logger('DatabasePool');
  // An idle client dropped by the server (a database restart) is emitted here; unhandled, it would crash the process.
  pool.on('error', (error) => {
    logger.error(`Idle database client failed: ${error.message}`, error.stack);
  });
  return pool;
}
