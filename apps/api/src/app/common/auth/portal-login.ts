import { randomUUID } from 'node:crypto';
import type { Kysely } from 'kysely';
import { PLACEHOLDER_EMAIL_DOMAIN } from '@eduvault/shared';
import type { DB } from '../../../db/db-types';
import { addMemberRole } from './member-rows';

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
