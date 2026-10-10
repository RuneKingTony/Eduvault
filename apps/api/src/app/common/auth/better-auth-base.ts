import type { BetterAuthOptions } from 'better-auth';
import {
  admin,
  organization,
  type OrganizationOptions,
} from 'better-auth/plugins';
import type { Pool } from 'pg';
import {
  betterAuthAc,
  betterAuthRoles,
  platformAc,
  platformRoles,
} from '@eduvault/policy';
import {
  BANNED_USER_MESSAGE,
  PASSWORD_MIN_LENGTH,
} from '@eduvault/api-contract';
import { insertDefaultLevels } from './default-levels';
import { syncStarterRoles } from './starter-roles';

// Shared by the Nest factory (better-auth.ts) and the CLI shim (apps/api/auth.ts).
// Keep it free of Nest imports so `api:auth-generate` runs without the app.

export const emailAndPasswordBaseConfig: NonNullable<
  BetterAuthOptions['emailAndPassword']
> = {
  enabled: true,
  autoSignIn: true,
  disableSignUp: true,
  minPasswordLength: PASSWORD_MIN_LENGTH,
  requireEmailVerification: false,
};

export const userBaseConfig: NonNullable<BetterAuthOptions['user']> = {
  additionalFields: {
    mustChangePassword: {
      type: 'boolean',
      required: true,
      defaultValue: false,
      input: false,
    },
  },
};

export const advancedBaseConfig: NonNullable<BetterAuthOptions['advanced']> = {
  database: { generateId: false },
  defaultCookieAttributes: { httpOnly: true, sameSite: 'lax' },
};

export const getOrganizationOptions = (pool: Pool) =>
  ({
    allowUserToCreateOrganization: false,
    requireEmailVerificationOnInvitation: true,
    ac: betterAuthAc,
    roles: betterAuthRoles,
    creatorRole: 'owner',
    dynamicAccessControl: { enabled: true },
    schema: {
      member: {
        additionalFields: {
          title: { type: 'string', required: false },
        },
      },
      organizationRole: {
        additionalFields: {
          label: { type: 'string', required: true },
          description: { type: 'string', required: false },
          source: { type: 'string', required: true },
          editedAt: { type: 'date', required: false },
        },
      },
    },
    organizationHooks: {
      afterCreateOrganization: async ({ organization: school }) => {
        await syncStarterRoles(pool, school.id);
        await insertDefaultLevels(pool, school.id);
      },
    },
    // A campus is a team plus a domain row; an automatic team would have no row.
    teams: {
      enabled: true,
      defaultTeam: { enabled: false },
      allowRemovingAllTeams: true,
    },
  }) satisfies OrganizationOptions;

export const getPlugins = (pool: Pool) => [
  admin({
    adminRoles: ['superadmin'],
    defaultRole: 'user',
    ac: platformAc,
    roles: platformRoles,
    bannedUserMessage: BANNED_USER_MESSAGE,
  }),
  organization(getOrganizationOptions(pool)),
];

/**
 * Every new session starts in the user's first school and first campus there.
 * Without it, sessions created outside the web flow (scripts, direct sign-in
 * calls) have no active school and every school-scoped route is refused.
 */
export const getDatabaseHooks = (
  pool: Pool
): NonNullable<BetterAuthOptions['databaseHooks']> => ({
  session: {
    create: {
      before: async (session) => {
        const active: unknown = session['activeOrganizationId'];
        if (typeof active === 'string' && active !== '') {
          return;
        }
        const school = await pool.query<{ organizationId: string }>(
          `SELECT "organizationId" FROM member
           WHERE "userId" = $1 ORDER BY "createdAt", id LIMIT 1`,
          [session.userId]
        );
        const organizationId = school.rows[0]?.organizationId;
        if (organizationId === undefined) {
          return;
        }

        const campus = await pool.query<{ teamId: string }>(
          `SELECT tm."teamId" FROM "teamMember" tm
           JOIN team t ON t.id = tm."teamId"
           WHERE tm."userId" = $1 AND t."organizationId" = $2
           ORDER BY tm."createdAt", tm.id LIMIT 1`,
          [session.userId, organizationId]
        );
        return {
          data: {
            ...session,
            activeOrganizationId: organizationId,
            activeTeamId: campus.rows[0]?.teamId ?? null,
          },
        };
      },
    },
  },
});
