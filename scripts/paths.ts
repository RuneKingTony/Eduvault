import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = join(dirname(fileURLToPath(import.meta.url)), '..');
export const apiDir = join(root, 'apps', 'api');
export const migrationsDir = join(apiDir, 'db', 'migrations');
export const files = {
  schema: join(apiDir, 'db', 'schema.sql'),
  authSnapshot: join(apiDir, 'db', 'auth-schema.snapshot.sql'),
  kyselyTypes: join(apiDir, 'src', 'db', 'db-types.ts'),
};
