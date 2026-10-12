import { randomBytes } from 'node:crypto';
import type { FileRef } from '@eduvault/api-contract';
import { startMinio, type StartedMinio } from '@eduvault/testcontainers';
import { FILE_STORE_TOKEN } from '../src/app/common/files/file-store';
import { copyFailed, copyFiles } from '../src/app/common/files/files-copy';
import { FilesRepository } from '../src/app/common/files/files.repository';
import {
  createS3FileStore,
  type S3FileStore,
} from '../src/app/common/files/s3-file-store';
import { expect } from './support/base-test';
import { filesTest, png } from './support/file-fixtures';

const BUCKET = 'copy';
let minio: StartedMinio;
let s3: S3FileStore;

beforeAll(async () => {
  minio = await startMinio();
  await minio.createBucket(BUCKET);
  s3 = createS3FileStore({
    S3_BUCKET: BUCKET,
    S3_REGION: minio.region,
    S3_ENDPOINT: minio.endpoint,
    S3_FORCE_PATH_STYLE: true,
    S3_ACCESS_KEY_ID: minio.accessKeyId,
    S3_SECRET_ACCESS_KEY: minio.secretAccessKey,
  });
});

afterAll(async () => {
  s3.onApplicationShutdown();
  await minio.stop();
});

const test = filesTest.extend<{
  seeded: { files: FileRef[]; orgIds: string[] };
}>({
  seeded: async ({ upload, schools: { owner, ownerB, orgA, orgB } }, use) => {
    const files = [
      await upload(owner, png(10)),
      await upload(owner, png(20)),
      await upload(ownerB, png(30)),
    ];
    await use({ files, orgIds: [orgA.id, orgA.id, orgB.id] });
  },
});

const COPY = { copied: 3, alreadyPresent: 0, sourceMissing: 0, mismatched: 0 };

test.describe('files-copy', () => {
  test('a dry run writes nothing, an apply copies every school’s files and a second apply copies nothing', async ({
    app,
    seeded: { files, orgIds },
  }) => {
    const postgres = app.get(FILE_STORE_TOKEN, { strict: false });
    const repository = app.get(FilesRepository, { strict: false });
    const run = (apply: boolean) =>
      copyFiles({ files: repository, from: postgres, to: s3, apply });

    expect(await run(false)).toEqual(COPY);
    expect(
      await s3.get({ organizationId: orgIds[0]!, key: files[0]!.id })
    ).toBeUndefined();

    expect(await run(true)).toEqual(COPY);
    for (const [index, file] of files.entries()) {
      const copy = await s3.get({
        organizationId: orgIds[index]!,
        key: file.id,
      });
      expect(copy?.byteLength).toBe(file.byteSize);
    }

    expect(await run(true)).toEqual({ ...COPY, copied: 0, alreadyPresent: 3 });
  });

  test('reports a copy whose bytes differ and leaves it as it is', async ({
    app,
    seeded: { files, orgIds },
  }) => {
    const postgres = app.get(FILE_STORE_TOKEN, { strict: false });
    const repository = app.get(FilesRepository, { strict: false });
    const run = () =>
      copyFiles({ files: repository, from: postgres, to: s3, apply: true });
    await run();
    const corrupt = randomBytes(16);
    await s3.put({
      organizationId: orgIds[1]!,
      key: files[1]!.id,
      bytes: corrupt,
    });

    const counts = await run();

    expect(counts).toEqual({
      ...COPY,
      copied: 0,
      alreadyPresent: 2,
      mismatched: 1,
    });
    expect(copyFailed(counts)).toBe(true);
    const kept = await s3.get({
      organizationId: orgIds[1]!,
      key: files[1]!.id,
    });
    expect(kept?.equals(corrupt)).toBe(true);
  });

  test('reports a file whose source bytes are gone', async ({
    app,
    pool,
    seeded: { files },
  }) => {
    await pool.query('DELETE FROM file_blob WHERE file_id = $1', [
      files[0]!.id,
    ]);
    const postgres = app.get(FILE_STORE_TOKEN, { strict: false });
    const repository = app.get(FilesRepository, { strict: false });

    const counts = await copyFiles({
      files: repository,
      from: postgres,
      to: s3,
      apply: true,
    });

    expect(counts).toMatchObject({ copied: 2, sourceMissing: 1 });
    expect(copyFailed(counts)).toBe(true);
  });

  test('copies back from S3 to Postgres for a rollback', async ({
    app,
    pool,
    seeded: { files },
  }) => {
    const postgres = app.get(FILE_STORE_TOKEN, { strict: false });
    const repository = app.get(FilesRepository, { strict: false });
    await copyFiles({ files: repository, from: postgres, to: s3, apply: true });
    await pool.query('DELETE FROM file_blob WHERE file_id = $1', [
      files[2]!.id,
    ]);

    const counts = await copyFiles({
      files: repository,
      from: s3,
      to: postgres,
      apply: true,
    });

    expect(counts).toEqual({ ...COPY, copied: 1, alreadyPresent: 2 });
    const restored = await pool.query(
      'SELECT 1 FROM file_blob WHERE file_id = $1',
      [files[2]!.id]
    );
    expect(restored.rows).toHaveLength(1);
  });
});
