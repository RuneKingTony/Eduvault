import type { Kysely } from 'kysely';
import type { DB } from '../../../db/db-types';

export const DB_TOKEN = 'DB_TOKEN';
export const KYSELY_TOKEN = 'KYSELY_TOKEN';

export type Database = Kysely<DB>;
