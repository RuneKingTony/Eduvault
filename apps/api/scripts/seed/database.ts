import type { INestApplicationContext } from '@nestjs/common';
import { KYSELY_TOKEN, type Database } from '../../src/app/common/db/tokens';

export const databaseOf = (app: INestApplicationContext): Database =>
  app.get<Database>(KYSELY_TOKEN, { strict: false });
