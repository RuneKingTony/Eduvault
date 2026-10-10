import { betterAuth } from 'better-auth';
import type { Pool } from 'pg';
import type { Env } from '../config/env';
import {
  advancedBaseConfig,
  emailAndPasswordBaseConfig,
  getDatabaseHooks,
  getPlugins,
  userBaseConfig,
} from './better-auth-base';

const getTrustedOrigins = (env: Env): string[] =>
  env.NODE_ENV === 'test' ? ['*'] : [env.WEB_ADMIN_URL, env.WEB_PORTAL_URL];

// Better Auth's member, seat, invitation and role routes skip the members and
// roles modules' scope, escalation, last-owner, in-use and `member:read` rules.
const DISABLED_ORGANIZATION_PATHS = [
  'update-member-role',
  'add-member',
  'invite-member',
  'accept-invitation',
  'reject-invitation',
  'cancel-invitation',
  'get-invitation',
  'list-invitations',
  'list-user-invitations',
  'remove-member',
  'add-team-member',
  'remove-team-member',
  'leave',
  'list-members',
  'get-full-organization',
  'get-active-member-role',
  'list-user-teams',
  'create-role',
  'update-role',
  'delete-role',
  'list-roles',
  'get-role',
].map((path) => `/organization/${path}`);

export const isSignInLimited = (env: Env): boolean =>
  env.NODE_ENV === 'production' || env.AUTH_RATE_LIMIT;

export function createAuth(pool: Pool, env: Env) {
  return betterAuth({
    appName: 'Eduvault',
    database: pool,
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: getTrustedOrigins(env),
    emailAndPassword: emailAndPasswordBaseConfig,
    user: userBaseConfig,
    databaseHooks: getDatabaseHooks(pool),
    rateLimit: {
      enabled: isSignInLimited(env),
      customRules: { '/sign-in/*': { window: 60, max: 5 } },
    },
    advanced: {
      ...advancedBaseConfig,
      defaultCookieAttributes: {
        ...advancedBaseConfig.defaultCookieAttributes,
        secure: env.NODE_ENV === 'production',
      },
    },
    plugins: getPlugins(pool),
    disabledPaths: DISABLED_ORGANIZATION_PATHS,
    // AuthModule fills this from @Hook providers and refuses to start without it.
    hooks: {},
  });
}

export type AppAuth = ReturnType<typeof createAuth>;
