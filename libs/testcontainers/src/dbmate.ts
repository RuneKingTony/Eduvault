import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';

function findDbmate(from: string): string {
  let dir = resolve(from);
  for (;;) {
    const candidate = join(dir, 'node_modules', '.bin', 'dbmate');
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir)
      throw new Error('dbmate binary not found; run pnpm install');
    dir = parent;
  }
}

export function withoutSsl(uri: string): string {
  return uri.includes('sslmode=') ? uri : `${uri}?sslmode=disable`;
}

export function runMigrations(options: {
  url: string;
  migrationsDir: string;
  cwd?: string;
}): void {
  execFileSync(
    findDbmate(options.cwd ?? process.cwd()),
    [
      '--url',
      withoutSsl(options.url),
      '--migrations-dir',
      options.migrationsDir,
      '--no-dump-schema',
      'up',
    ],
    { stdio: 'pipe' }
  );
}

const VOLATILE_LINES = /^(\\restrict |\\unrestrict |-- Dumped (from|by) )/;

/**
 * Dumps the schema with the pg_dump that ships in the server image, so the
 * output does not depend on the pg_dump installed on the developer machine.
 */
export async function dumpSchema(
  container: StartedPostgreSqlContainer
): Promise<string> {
  const dump = await container.exec([
    'pg_dump',
    '--schema-only',
    '--no-owner',
    '--no-privileges',
    '-U',
    container.getUsername(),
    '-d',
    container.getDatabase(),
  ]);
  if (dump.exitCode !== 0) throw new Error(`pg_dump failed: ${dump.output}`);

  const versions = await container.exec([
    'psql',
    '-U',
    container.getUsername(),
    '-d',
    container.getDatabase(),
    '-At',
    '-c',
    'SELECT version FROM public.schema_migrations ORDER BY version',
  ]);
  if (versions.exitCode !== 0) {
    throw new Error(`reading schema_migrations failed: ${versions.output}`);
  }

  const body = dump.output
    .split('\n')
    .filter((line) => !VOLATILE_LINES.test(line))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  const rows = versions.output
    .split('\n')
    .map((v) => v.trim())
    .filter(Boolean)
    .map((v) => `    ('${v}')`)
    .join(',\n');

  return `${body}\n\n--\n-- Dbmate schema migrations\n--\n\nINSERT INTO public.schema_migrations (version) VALUES\n${rows};\n`;
}
