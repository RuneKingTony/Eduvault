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
import { DatabaseHealth } from './database-health';
import { DB_TOKEN, KYSELY_TOKEN, type Database } from './tokens';

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
    DatabaseHealth,
  ],
  exports: [DB_TOKEN, KYSELY_TOKEN, DatabaseHealth],
})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(@Inject(KYSELY_TOKEN) private readonly db: Database) {}

  async onApplicationShutdown() {
    await this.db.destroy();
  }
}
