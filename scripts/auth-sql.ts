import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { apiDir } from './paths';

/**
 * Runs `better-auth generate` against `databaseUrl`. The CLI diffs against the
 * live database, so an empty database yields the full schema and a migrated one
 * yields only what is missing (null when nothing is).
 */
export function runAuthGenerate(databaseUrl: string): string | null {
  const dir = mkdtempSync(join(tmpdir(), 'eduvault-auth-'));
  const output = join(dir, 'auth.sql');
  try {
    execFileSync(
      join(apiDir, 'node_modules', '.bin', 'better-auth'),
      ['generate', '--config', 'auth.ts', '--yes', '--output', output],
      {
        cwd: apiDir,
        env: { ...process.env, DATABASE_URL: databaseUrl, NO_COLOR: '1' },
        stdio: 'pipe',
      }
    );
    if (!existsSync(output)) {
      return null;
    }
    const sql = readFileSync(output, 'utf8').trim();
    return sql ? `${sql}\n` : null;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const splitTopLevel = (text: string): string[] => {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const char of text) {
    if (char === '(') {
      depth++;
    }
    if (char === ')') {
      depth--;
    }
    if (char === ',' && depth === 0) {
      parts.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  if (current.trim()) {
    parts.push(current.trim());
  }
  return parts;
};

const formatStatement = (statement: string): string => {
  const match = /^(create table "[^"]+") \((.*)\)$/s.exec(statement);
  if (!match) {
    return `${statement};`;
  }
  const columns = splitTopLevel(match[2] ?? '').map(
    (column) =>
      `  ${column.replace(
        /^"id" text not null primary key/,
        '"id" text not null primary key default gen_random_uuid()::text'
      )}`
  );
  return `${match[1]} (\n${columns.join(',\n')}\n);`;
};

const tablesOf = (statements: string[]) =>
  statements.map((s) => /^create table "([^"]+)"/.exec(s)?.[1]).filter(Boolean);

/**
 * Wraps Better Auth's raw output as a dbmate migration. With
 * `advanced.database.generateId: false` the database must mint ids, which the
 * CLI does not express, so every primary key gets a uuid default.
 */
export function toMigration(rawSql: string): string {
  const statements = rawSql
    .split(/;\s*\n/)
    .map((s) => s.replace(/;\s*$/, '').trim())
    .filter(Boolean);
  const up = statements
    .map((statement) => formatStatement(statement))
    .join('\n\n');
  const down = tablesOf(statements)
    .toReversed()
    .map((table) => `DROP TABLE "${table}";`)
    .join('\n');
  return `-- migrate:up\n${up}\n\n-- migrate:down\n${down}\n`;
}
