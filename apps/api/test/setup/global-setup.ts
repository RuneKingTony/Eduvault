import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import {
  runMigrations,
  startPostgres,
  withoutSsl,
} from '@eduvault/testcontainers';
import { WORKER_COUNT, workerDatabase } from './workers';

const migrationsDir = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'db',
  'migrations'
);

/**
 * One real Postgres for the whole run. The migrated database is cloned once per
 * vitest worker so files can run in parallel, each truncating only its own copy.
 */
export default async function setup() {
  const pg = await startPostgres({
    settings: {
      max_connections: '400',
      fsync: 'off',
      synchronous_commit: 'off',
      full_page_writes: 'off',
    },
  });
  runMigrations({ url: pg.uri, migrationsDir });

  const admin = new Pool({ connectionString: withoutSsl(pg.uri) });
  try {
    for (let id = 1; id <= WORKER_COUNT; id += 1) {
      await admin.query(
        `CREATE DATABASE "${workerDatabase(id)}" TEMPLATE eduvault`
      );
    }
  } finally {
    await admin.end();
  }

  process.env['DATABASE_URL'] = withoutSsl(pg.uri);
  return async () => {
    await pg.stop();
  };
}
