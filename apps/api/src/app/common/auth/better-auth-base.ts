import type { BetterAuthOptions } from 'better-auth';
import { admin, organization } from 'better-auth/plugins';
import { ac, roles } from '@eduvault/policy';

// Shared by the Nest factory (better-auth.ts) and the CLI shim (apps/api/auth.ts).
// Keep it free of Nest imports so `api:auth-generate` runs without the app.

export const emailAndPasswordBaseConfig: NonNullable<
  BetterAuthOptions['emailAndPassword']
> = {
  enabled: true,
  autoSignIn: true,
  requireEmailVerification: false,
};

export const advancedBaseConfig: NonNullable<BetterAuthOptions['advanced']> = {
  database: { generateId: false },
  defaultCookieAttributes: { httpOnly: true, sameSite: 'lax' },
};

export const getPlugins = () => [
  admin(),
  organization({
    ac,
    roles,
    creatorRole: 'owner',
    teams: { enabled: true },
  }),
];
