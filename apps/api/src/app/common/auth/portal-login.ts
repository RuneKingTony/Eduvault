import { randomUUID } from 'node:crypto';
import type { Kysely } from 'kysely';
import { splitRoles } from '@eduvault/policy';
import { PLACEHOLDER_EMAIL_DOMAIN } from '@eduvault/shared';
import type { DB } from '../../../db/db-types';

export type PortalRole = 'student' | 'guardian';

export interface NewPortalLogin {
  organizationId: string;
  role: PortalRole;
  name: string;
  email: string | null;
  username: string | null;
  passwordHash: string;
}

/** Placeholder for users who sign in by username; never shown, never sent to. */
const placeholderEmail = (userId: string): string =>
  `${userId}@${PLACEHOLDER_EMAIL_DOMAIN}`;

export async function createPortalLogin(
  db: Kysely<DB>,
  input: NewPortalLogin
): Promise<{ userId: string }> {
  const userId = randomUUID();
  const now = new Date();
  await db
    .insertInto('user')
    .values({
      id: userId,
      name: input.name,
      email: (input.email ?? placeholderEmail(userId)).toLowerCase(),
      emailVerified: false,
      username: input.username === null ? null : input.username.toLowerCase(),
      displayUsername: input.username,
      mustChangePassword: true,
      createdAt: now,
      updatedAt: now,
    })
    .execute();
  await db
    .insertInto('account')
    .values({
      accountId: userId,
      providerId: 'credential',
      userId,
      password: input.passwordHash,
      createdAt: now,
      updatedAt: now,
    })
    .execute();
  await addMemberRole(db, {
    organizationId: input.organizationId,
    userId,
    role: input.role,
  });
  return { userId };
}

export async function resetPortalPassword(
  db: Kysely<DB>,
  input: { userId: string; passwordHash: string }
): Promise<void> {
  const now = new Date();
  await db
    .updateTable('account')
    .set({ password: input.passwordHash, updatedAt: now })
    .where('userId', '=', input.userId)
    .where('providerId', '=', 'credential')
    .execute();
  await db
    .updateTable('user')
    .set({ mustChangePassword: true, updatedAt: now })
    .where('id', '=', input.userId)
    .execute();
  await db.deleteFrom('session').where('userId', '=', input.userId).execute();
}

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

export async function stripMemberRole(
  db: Kysely<DB>,
  key: MemberKey & { role: string }
): Promise<string[]> {
  const member = await findMember(db, key);
  if (member === undefined) {
    return [];
  }
  const rest = splitRoles(member.role).filter((role) => role !== key.role);
  await (rest.length === 0
    ? db.deleteFrom('member').where('id', '=', member.id).execute()
    : db
        .updateTable('member')
        .set({ role: rest.join(',') })
        .where('id', '=', member.id)
        .execute());
  return rest;
}
