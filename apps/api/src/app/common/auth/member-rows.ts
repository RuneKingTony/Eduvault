import { sql, type Kysely } from 'kysely';
import { OWNER_ROLE, splitRoles } from '@eduvault/policy';
import type { DB } from '../../../db/db-types';
import { endClassTeaching } from '../db/end-class-teaching';
import { ownerRoles } from './owner-roles';

/**
 * The raw writer of `member` rows for callers that already hold a
 * transaction (platform handover, portal logins, graduation, the seed).
 * It reproduces what Better Auth's organization adapter keeps true when
 * `MemberAdminService` writes: a member who goes takes their campus seats
 * with them and each campus's `memberCount` follows. Seats are only ever
 * created through the adapter, which owns `membershipKey`.
 */
interface MemberKey {
  organizationId: string;
  userId: string;
}

async function findMember(db: Kysely<DB>, key: MemberKey) {
  return db
    .selectFrom('member')
    .select(['id', 'role'])
    .where('organizationId', '=', key.organizationId)
    .where('userId', '=', key.userId)
    .executeTakeFirst();
}

export async function addMemberRole(
  db: Kysely<DB>,
  key: MemberKey & { role: string }
): Promise<void> {
  const member = await findMember(db, key);
  if (member === undefined) {
    await db
      .insertInto('member')
      .values({
        organizationId: key.organizationId,
        userId: key.userId,
        role: key.role,
        createdAt: new Date(),
      })
      .execute();
    return;
  }
  const roles = splitRoles(member.role);
  if (!roles.includes(key.role)) {
    await db
      .updateTable('member')
      .set({ role: [...roles, key.role].join(',') })
      .where('id', '=', member.id)
      .execute();
  }
}

/** Returns the roles left; a member with none left is removed. */
export async function stripMemberRole(
  db: Kysely<DB>,
  key: MemberKey & { role: string }
): Promise<string[]> {
  const member = await findMember(db, key);
  if (member === undefined) {
    return [];
  }
  const rest = splitRoles(member.role).filter((role) => role !== key.role);
  if (rest.length === 0) {
    await removeMember(db, { ...key, memberId: member.id });
    return rest;
  }
  await setMemberRoles(db, { memberId: member.id, roles: rest });
  return rest;
}

export async function setMemberRoles(
  db: Kysely<DB>,
  input: { memberId: string; roles: readonly string[] }
): Promise<void> {
  await db
    .updateTable('member')
    .set({ role: input.roles.join(',') })
    .where('id', '=', input.memberId)
    .execute();
}

/** Gives the user the owner role beside any they hold, adding them to the school if need be. */
export async function makeOwner(db: Kysely<DB>, key: MemberKey): Promise<void> {
  const current = await findMember(db, key);
  if (current === undefined) {
    await db
      .insertInto('member')
      .values({
        organizationId: key.organizationId,
        userId: key.userId,
        role: OWNER_ROLE,
        createdAt: sql`now()`,
      })
      .execute();
    return;
  }
  await setMemberRoles(db, {
    memberId: current.id,
    roles: ownerRoles(splitRoles(current.role)),
  });
}

/** The user account stays; their campus seats, counts and class teaching go with the member. */
export async function removeMember(
  db: Kysely<DB>,
  input: MemberKey & { memberId: string }
): Promise<void> {
  const { organizationId, userId } = input;
  const released = await db
    .deleteFrom('teamMember')
    .where('userId', '=', userId)
    .where(
      'teamId',
      'in',
      db
        .selectFrom('team')
        .select('id')
        .where('organizationId', '=', organizationId)
    )
    .returning('teamId')
    .execute();
  if (released.length > 0) {
    await db
      .updateTable('team')
      .set({ memberCount: sql`GREATEST("memberCount" - 1, 0)` })
      .where(
        'id',
        'in',
        released.map((row) => row.teamId)
      )
      .execute();
  }
  await db.deleteFrom('member').where('id', '=', input.memberId).execute();
  await endClassTeaching(db, { organizationId, userId });
}
