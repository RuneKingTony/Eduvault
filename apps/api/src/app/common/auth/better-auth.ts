import { betterAuth } from 'better-auth';
import type { Pool } from 'pg';
import type { Env } from '../config/env';
import {
  advancedBaseConfig,
  emailAndPasswordBaseConfig,
  getDatabaseHooks,
  getPlugins,
} from './better-auth-base';

const getTrustedOrigins = (env: Env): string[] =>
  env.NODE_ENV === 'test' ? ['*'] : [env.WEB_ADMIN_URL, env.WEB_PORTAL_URL];

export function createAuth(pool: Pool, env: Env) {
  return betterAuth({
    appName: 'Eduvault',
    database: pool,
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: getTrustedOrigins(env),
    emailAndPassword: emailAndPasswordBaseConfig,
    databaseHooks: getDatabaseHooks(pool),
    rateLimit: { enabled: env.NODE_ENV === 'production' },
    advanced: {
      ...advancedBaseConfig,
      defaultCookieAttributes: {
        ...advancedBaseConfig.defaultCookieAttributes,
        secure: env.NODE_ENV === 'production',
      },
    },
    plugins: getPlugins(pool, { trustInvitees: env.E2E_TRUST_INVITEES }),
    // AuthModule fills this from @Hook providers and refuses to start without it.
    hooks: {},
  });
}

export type AppAuth = ReturnType<typeof createAuth>;
