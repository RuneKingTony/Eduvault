import {
  Global,
  Inject,
  Module,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import type { DB } from '../../../db/db-types';
import { ENV_TOKEN, type Env } from '../config/env';

export const DB_TOKEN = 'DB_TOKEN';
export const KYSELY_TOKEN = 'KYSELY_TOKEN';

export type Database = Kysely<DB>;

@Global()
@Module({
  providers: [
    {
      provide: DB_TOKEN,
      useFactory: (env: Env) =>
        new Pool({ connectionString: env.DATABASE_URL }),
      inject: [ENV_TOKEN],
    },
    {
      provide: KYSELY_TOKEN,
      useFactory: (pool: Pool): Database =>
        new Kysely<DB>({ dialect: new PostgresDialect({ pool }) }),
      inject: [DB_TOKEN],
    },
  ],
  exports: [DB_TOKEN, KYSELY_TOKEN],
})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(@Inject(KYSELY_TOKEN) private readonly db: Database) {}

  async onApplicationShutdown() {
    await this.db.destroy();
  }
}
