import { sql, type Kysely } from 'kysely';
import type { DB } from '../../../db/db-types';

export async function advisoryLock(
  trx: Kysely<DB>,
  key: string
): Promise<void> {
  await sql`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`.execute(
    trx
  );
}
