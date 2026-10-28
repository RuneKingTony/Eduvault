import { Pool } from 'pg';
import { loadEnv } from '../config/env';
import { createAuth } from './better-auth';

const base = {
  DATABASE_URL: 'postgres://u:p@localhost:5434/db',
  BETTER_AUTH_SECRET: 'x'.repeat(32),
  BETTER_AUTH_URL: 'https://api.staging.example.com',
  WEB_ADMIN_URL: 'https://admin.staging.example.com',
  WEB_PORTAL_URL: 'https://portal.staging.example.com',
};

describe('createAuth cookie scope', () => {
  const pool = new Pool();

  afterAll(() => pool.end());

  it('shares the cookie across the domain when AUTH_COOKIE_DOMAIN is set', () => {
    const auth = createAuth(
      pool,
      loadEnv({ ...base, AUTH_COOKIE_DOMAIN: '.staging.example.com' })
    );
    expect(auth.options.advanced.crossSubDomainCookies).toEqual({
      enabled: true,
      domain: '.staging.example.com',
    });
  });

  it('keeps cookies host-scoped when it is unset', () => {
    const auth = createAuth(pool, loadEnv(base));
    expect(auth.options.advanced.crossSubDomainCookies).toBeUndefined();
  });
});
