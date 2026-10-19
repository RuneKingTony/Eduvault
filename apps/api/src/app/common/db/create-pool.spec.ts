import { Logger } from '@nestjs/common';
import type { Pool } from 'pg';
import { createPool } from './create-pool';

const env = {
  DATABASE_URL: 'postgres://u:p@localhost:5434/db',
  DATABASE_POOL_MAX: 20,
  DATABASE_CONNECT_TIMEOUT_MS: 10_000,
};

describe('createPool', () => {
  const pools: Pool[] = [];
  const make = (overrides: Partial<typeof env> = {}) => {
    const pool = createPool({ ...env, ...overrides });
    pools.push(pool);
    return pool;
  };

  afterEach(async () => {
    vi.restoreAllMocks();
    await Promise.all(pools.splice(0).map((pool) => pool.end()));
  });

  it('caps the pool and stops waiting for a connection from the environment', () => {
    const pool = make({
      DATABASE_POOL_MAX: 7,
      DATABASE_CONNECT_TIMEOUT_MS: 2500,
    });
    expect(pool.options).toMatchObject({
      max: 7,
      connectionTimeoutMillis: 2500,
    });
  });

  it('logs an idle client that errors instead of leaving an unhandled event', () => {
    const logged = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    const pool = make();

    expect(() =>
      pool.emit('error', new Error('terminating connection'))
    ).not.toThrow();

    expect(logged).toHaveBeenCalledWith(
      expect.stringContaining('terminating connection'),
      expect.any(String)
    );
  });
});
