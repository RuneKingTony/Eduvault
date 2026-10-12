import { HeadObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Test } from '@nestjs/testing';
import { startMinio, type StartedMinio } from '@eduvault/testcontainers';
import { AppModule } from '../src/app/app.module';
import { FileSweepService } from '../src/app/common/files';
import { expect, type Fixtures } from './support/base-test';
import { filesTest as test, png } from './support/file-fixtures';

const BUCKET = 'files';
const ENV_KEYS = [
  'FILE_STORE_DRIVER',
  'S3_BUCKET',
  'S3_REGION',
  'S3_ENDPOINT',
  'S3_FORCE_PATH_STYLE',
  'S3_ACCESS_KEY_ID',
  'S3_SECRET_ACCESS_KEY',
] as const;
const original = Object.fromEntries(
  ENV_KEYS.map((key) => [key, process.env[key]])
);

let minio: StartedMinio;
let client: S3Client;

beforeAll(async () => {
  minio = await startMinio();
  await minio.createBucket(BUCKET);
  Object.assign(process.env, {
    FILE_STORE_DRIVER: 's3',
    S3_BUCKET: BUCKET,
    S3_REGION: minio.region,
    S3_ENDPOINT: minio.endpoint,
    S3_FORCE_PATH_STYLE: 'true',
    S3_ACCESS_KEY_ID: minio.accessKeyId,
    S3_SECRET_ACCESS_KEY: minio.secretAccessKey,
  });
  client = new S3Client({
    region: minio.region,
    endpoint: minio.endpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId: minio.accessKeyId,
      secretAccessKey: minio.secretAccessKey,
    },
  });
});

afterAll(async () => {
  for (const key of ENV_KEYS) {
    const value = original[key];
    if (value === undefined) {
      Reflect.deleteProperty(process.env, key);
    } else {
      process.env[key] = value;
    }
  }
  client.destroy();
  await minio.stop();
});

async function objectSize(organizationId: string, id: string) {
  try {
    const head = await client.send(
      new HeadObjectCommand({ Bucket: BUCKET, Key: `${organizationId}/${id}` })
    );
    return head.ContentLength;
  } catch (error) {
    if (error instanceof Error && error.name === 'NotFound') {
      return null;
    }
    throw error;
  }
}

const blobRows = async (pool: Fixtures['pool']) =>
  (await pool.query('SELECT 1 FROM file_blob')).rows.length;

test.describe('the S3 driver through the API', () => {
  test('stores the upload as an object under the school, not in file_blob, and serves it back', async ({
    api,
    pool,
    upload,
    attach,
    schools: { owner, orgA },
  }) => {
    const file = await upload(owner, png(100));
    await attach(owner, file);

    expect(await objectSize(orgA.id, file.id)).toBe(png(100).byteLength);
    expect(await blobRows(pool)).toBe(0);
    const res = await api(owner)
      .get(`/files/${file.id}`)
      .buffer(true)
      .parse((response, done) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => {
          done(null, Buffer.concat(chunks));
        });
      })
      .expect(200);
    expect(res.headers['content-type']).toBe('image/png');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(Buffer.compare(res.body as Buffer, png(100))).toBe(0);
  });

  test('answers 404 to another school and keeps the object', async ({
    api,
    upload,
    attach,
    schools: { owner, ownerB, orgA, orgB },
  }) => {
    const file = await upload(owner, png());
    await attach(owner, file);

    await api(ownerB).get(`/files/${file.id}`).expect(404);
    await api(ownerB).delete(`/files/${file.id}`).expect(404);

    expect(await objectSize(orgA.id, file.id)).toBe(png().byteLength);
    expect(await objectSize(orgB.id, file.id)).toBeNull();
  });

  test('replacing and removing the logo delete the objects', async ({
    api,
    upload,
    attach,
    schools: { owner, orgA },
  }) => {
    const first = await upload(owner, png(10));
    const second = await upload(owner, png(20));
    await attach(owner, first);

    await attach(owner, second);
    expect(await objectSize(orgA.id, first.id)).toBeNull();
    expect(await objectSize(orgA.id, second.id)).toBe(png(20).byteLength);

    await api(owner).delete('/school-account/logo').expect(200);
    expect(await objectSize(orgA.id, second.id)).toBeNull();
  });

  test('deleting an unattached file removes its object', async ({
    api,
    upload,
    schools: { owner, orgA },
  }) => {
    const loose = await upload(owner, png());

    await api(owner).delete(`/files/${loose.id}`).expect(204);

    expect(await objectSize(orgA.id, loose.id)).toBeNull();
  });

  test('the orphan sweep removes the object of an unattached file and keeps an attached one', async ({
    app,
    upload,
    attach,
    schools: { owner, orgA },
  }) => {
    const loose = await upload(owner, png());
    const logo = await upload(owner, png());
    await attach(owner, logo);

    expect(
      await app
        .get(FileSweepService)
        .sweep(new Date(Date.now() + 25 * 3_600_000))
    ).toBe(1);

    expect(await objectSize(orgA.id, loose.id)).toBeNull();
    expect(await objectSize(orgA.id, logo.id)).toBe(png().byteLength);
  });

  test('refuses to boot when the bucket is not there', async () => {
    process.env['S3_BUCKET'] = 'no-such-bucket';
    try {
      await expect(
        Test.createTestingModule({ imports: [AppModule] }).compile()
      ).rejects.toThrow(/no-such-bucket/);
    } finally {
      process.env['S3_BUCKET'] = BUCKET;
    }
  });
});
