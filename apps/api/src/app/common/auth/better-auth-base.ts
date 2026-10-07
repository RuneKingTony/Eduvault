import type { BetterAuthOptions } from 'better-auth';
import { admin, organization } from 'better-auth/plugins';
import type { Pool } from 'pg';
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
    // A campus is a team plus a domain row; an automatic team would have no row.
    teams: {
      enabled: true,
      defaultTeam: { enabled: false },
      allowRemovingAllTeams: true,
    },
  }),
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
        if (session['activeOrganizationId']) return;
        const school = await pool.query<{ organizationId: string }>(
          `SELECT "organizationId" FROM member
           WHERE "userId" = $1 ORDER BY "createdAt", id LIMIT 1`,
          [session.userId]
        );
        const organizationId = school.rows[0]?.organizationId;
        if (!organizationId) return;

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
