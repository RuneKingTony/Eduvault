import { APIError } from 'better-auth/api';
import type { Pool } from 'pg';
import {
  OWNER_ROLE,
  SUPERSEDED_BY_OWNER,
  splitRoles,
  withMemberRole,
} from '@eduvault/policy';

export const LAST_OWNER_MESSAGE =
  'Refused: the school can’t be left without an owner.';

interface CampusName {
  organizationId: string;
  name: string;
  exceptTeamId?: string;
}

/** Backstop for Better Auth's own team routes; the campus service checks first, under the school lock. */
export async function assertCampusNameFree(
  pool: Pool,
  { organizationId, name, exceptTeamId }: CampusName
): Promise<void> {
  const { rowCount } = await pool.query(
    `SELECT 1 FROM team
     WHERE "organizationId" = $1 AND lower(name) = lower($2)
       AND ($3::text IS NULL OR id <> $3)
     LIMIT 1`,
    [organizationId, name, exceptTeamId ?? null]
  );
  if (rowCount !== null && rowCount > 0) {
    throw new APIError('CONFLICT', { message: `${name} already exists.` });
  }
}

interface RoleChange {
  member: { id: string; organizationId: string; role: string };
  newRole: string;
}

export async function ownerRule(
  pool: Pool,
  { member, newRole }: RoleChange
): Promise<{ data: { role: string } } | undefined> {
  const before = splitRoles(member.role);
  const after = splitRoles(newRole);
  const gains = after.includes(OWNER_ROLE) && !before.includes(OWNER_ROLE);
  const loses = before.includes(OWNER_ROLE) && !after.includes(OWNER_ROLE);
  if (gains) {
    return {
      data: {
        role: withMemberRole(
          after.filter((slug) => !SUPERSEDED_BY_OWNER.includes(slug))
        ).join(','),
      },
    };
  }
  if (loses) {
    const { rows } = await pool.query<{ others: string }>(
      `SELECT count(*) AS others FROM member
       WHERE "organizationId" = $1 AND id <> $2
         AND $3 = ANY (string_to_array(role, ','))`,
      [member.organizationId, member.id, OWNER_ROLE]
    );
    if (Number(rows[0]?.others ?? 0) === 0) {
      throw new APIError('CONFLICT', { message: LAST_OWNER_MESSAGE });
    }
  }
  return undefined;
}
