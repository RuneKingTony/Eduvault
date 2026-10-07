import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  runMigrations,
  startPostgres,
  withoutSsl,
} from '@eduvault/testcontainers';

const migrationsDir = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'db',
  'migrations'
);

/** One real Postgres for the whole run; workers inherit DATABASE_URL. */
export default async function setup() {
  const pg = await startPostgres();
  runMigrations({ url: pg.uri, migrationsDir });
  process.env['DATABASE_URL'] = withoutSsl(pg.uri);
  return async () => {
    await pg.stop();
  };
}
