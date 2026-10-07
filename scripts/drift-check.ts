import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import {
  dumpSchema,
  runMigrations,
  startPostgres,
  withoutSsl,
} from '@eduvault/testcontainers';
import { runAuthGenerate, toMigration } from './auth-sql';
import { apiDir, files, migrationsDir, root } from './paths';

type Part = 'auth' | 'schema' | 'types';

const write = process.argv.includes('--write');
const only = process.argv
  .find((arg) => arg.startsWith('--only='))
  ?.slice('--only='.length);
const wants = (part: Part) => only === undefined || only === part;
const FIX = 'Run `pnpm drift:fix` and commit the result.';
const failures: string[] = [];

const rel = (file: string) => relative(root, file);

function diffText(expected: string, actual: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'eduvault-diff-'));
  try {
    writeFileSync(join(dir, 'committed'), expected);
    writeFileSync(join(dir, 'regenerated'), actual);
    try {
      execFileSync('diff', [
        '-u',
        join(dir, 'committed'),
        join(dir, 'regenerated'),
      ]);
      return '';
    } catch (error) {
      const out = (error as { stdout?: Buffer }).stdout?.toString() ?? '';
      return out.split('\n').slice(0, 40).join('\n');
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function reconcile(file: string, regenerated: string) {
  const committed = existsSync(file) ? readFileSync(file, 'utf8') : '';
  if (committed === regenerated) {
    console.log(`ok       ${rel(file)}`);
    return;
  }
  if (write) {
    writeFileSync(file, regenerated);
    console.log(`updated  ${rel(file)}`);
    return;
  }
  failures.push(
    `DRIFT ${rel(file)} is out of date. ${FIX}\n${diffText(committed, regenerated)}`
  );
}

function withDatabase(uri: string, name: string): string {
  const url = new URL(uri);
  url.pathname = `/${name}`;
  return url.toString();
}

function runKyselyCodegen(url: string): string {
  return execFileSync(
    join(apiDir, 'node_modules', '.bin', 'kysely-codegen'),
    [
      '--dialect',
      'postgres',
      '--url',
      withoutSsl(url),
      '--exclude-pattern',
      'schema_migrations',
      '--log-level',
      'error',
      '--print',
    ],
    { cwd: apiDir, encoding: 'utf8' }
  );
}

function nextMigrationFile(): string {
  const taken = existsSync(migrationsDir) ? readdirSync(migrationsDir) : [];
  const stamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
  const name = taken.some((f) => f.includes('better_auth'))
    ? 'better_auth_update'
    : 'better_auth_schema';
  return join(migrationsDir, `${stamp}_${name}.sql`);
}

async function checkAuth(pg: Awaited<ReturnType<typeof startPostgres>>) {
  const missing = runAuthGenerate(pg.uri);
  if (missing) {
    if (write) {
      const file = nextMigrationFile();
      writeFileSync(file, toMigration(missing));
      console.log(`created  ${rel(file)}`);
      runMigrations({ url: pg.uri, migrationsDir });
    } else {
      failures.push(
        `DRIFT better-auth expects schema that no migration provides:\n${missing}\n${FIX}`
      );
    }
  } else {
    console.log('ok       migrations satisfy better-auth');
  }

  await pg.container.exec([
    'psql',
    '-U',
    'eduvault',
    '-d',
    'eduvault',
    '-c',
    'CREATE DATABASE auth_fresh',
  ]);
  const full = runAuthGenerate(withDatabase(pg.uri, 'auth_fresh'));
  if (!full) {
    throw new Error('better-auth generated nothing for an empty database');
  }
  reconcile(files.authSnapshot, full);
}

async function main() {
  console.log(`drift ${write ? '(write)' : '(check)'}: starting postgres...`);
  const pg = await startPostgres();
  try {
    runMigrations({ url: pg.uri, migrationsDir });
    if (wants('auth')) await checkAuth(pg);
    if (wants('schema'))
      reconcile(files.schema, await dumpSchema(pg.container));
    if (wants('types')) reconcile(files.kyselyTypes, runKyselyCodegen(pg.uri));
  } finally {
    await pg.stop();
  }

  if (failures.length > 0) {
    console.error(`\n${failures.join('\n\n')}`);
    process.exit(1);
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
