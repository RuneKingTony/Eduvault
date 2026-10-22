import { createHash } from 'node:crypto';
import type { Pool } from 'pg';
import { expect } from './base-test';

const keyOf = (teamId: string, userId: string): string =>
  createHash('sha256')
    .update(JSON.stringify([teamId, userId]))
    .digest('base64url');

/** Every campus seat of the school is backed by a member, carries the key Better Auth derives, and is counted once. */
export async function expectSeatsConsistent(
  pool: Pool,
  organizationId: string
): Promise<void> {
  const teams = await pool.query<{ id: string; memberCount: number }>(
    'SELECT id, "memberCount" FROM team WHERE "organizationId" = $1',
    [organizationId]
  );
  const seats = await pool.query<{
    teamId: string;
    userId: string;
    membershipKey: string;
    isMember: boolean;
  }>(
    `SELECT tm."teamId", tm."userId", tm."membershipKey",
       EXISTS (
         SELECT 1 FROM member m
         WHERE m."organizationId" = $1 AND m."userId" = tm."userId"
       ) AS "isMember"
     FROM "teamMember" tm
     JOIN team t ON t.id = tm."teamId"
     WHERE t."organizationId" = $1`,
    [organizationId]
  );
  for (const team of teams.rows) {
    const held = seats.rows.filter((seat) => seat.teamId === team.id);
    expect(team.memberCount).toBe(held.length);
  }
  for (const seat of seats.rows) {
    expect(seat.isMember).toBe(true);
    expect(seat.membershipKey).toBe(keyOf(seat.teamId, seat.userId));
  }
}
