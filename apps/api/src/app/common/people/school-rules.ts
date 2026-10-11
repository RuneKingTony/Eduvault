import type { Kysely } from 'kysely';
import type { DB } from '../../../db/db-types';
import type { SchoolRules } from './guardian-tx';

export async function findSchoolRules(
  db: Kysely<DB>,
  organizationId: string
): Promise<SchoolRules | undefined> {
  const row = await db
    .selectFrom('school_setting')
    .select(['max_guardians', 'require_guardian'])
    .where('organization_id', '=', organizationId)
    .executeTakeFirst();
  return (
    row && {
      maxGuardians: row.max_guardians,
      requireGuardian: row.require_guardian,
    }
  );
}

export async function readSchoolRules(
  db: Kysely<DB>,
  organizationId: string
): Promise<SchoolRules> {
  const rules = await findSchoolRules(db, organizationId);
  if (rules === undefined) {
    throw new Error(`School ${organizationId} has no settings row`);
  }
  return rules;
}
