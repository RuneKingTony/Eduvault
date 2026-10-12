import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import type { DB } from '../src/db/db-types';
import { loadEnv, type Env } from '../src/app/common/config/env';
import type { FileStore } from '../src/app/common/files/file-store';
import {
  copyFailed,
  copyFiles,
  parseCopyArgs,
  type CopyDriver,
} from '../src/app/common/files/files-copy';
import { KyselyFilesRepository } from '../src/app/common/files/kysely-files.repository';
import { PostgresFileStore } from '../src/app/common/files/postgres-file-store';
import { createS3FileStore } from '../src/app/common/files/s3-file-store';

function storeFor(driver: CopyDriver, db: Kysely<DB>, env: Env): FileStore {
  return driver === 'postgres'
    ? new PostgresFileStore(db)
    : createS3FileStore(env);
}

async function main(): Promise<number> {
  let options;
  try {
    options = parseCopyArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 2;
  }

  const env = loadEnv();
  const pool = new Pool({ connectionString: env.DATABASE_URL });
  const db = new Kysely<DB>({ dialect: new PostgresDialect({ pool }) });
  const target = storeFor(options.to, db, env);
  try {
    const mode = options.apply ? 'apply' : 'dry run';
    console.log(`Copying files ${options.from} -> ${options.to} (${mode})`);
    const counts = await copyFiles({
      files: new KyselyFilesRepository(db),
      from: storeFor(options.from, db, env),
      to: target,
      apply: options.apply,
      onFile: (file, outcome) => {
        if (outcome === 'sourceMissing' || outcome === 'mismatched') {
          console.error(
            `${outcome}: ${file.organizationId}/${file.storageKey}`
          );
        }
      },
    });
    console.log(
      `${options.apply ? 'copied' : 'would copy'}: ${counts.copied}, already present: ${counts.alreadyPresent}, source missing: ${counts.sourceMissing}, mismatched: ${counts.mismatched}`
    );
    return copyFailed(counts) ? 1 : 0;
  } finally {
    await db.destroy();
  }
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
