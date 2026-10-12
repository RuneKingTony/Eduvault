import { randomBytes, randomUUID } from 'node:crypto';
import { HeadObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { startMinio, type StartedMinio } from '@eduvault/testcontainers';
import {
  createS3FileStore,
  type S3FileStore,
} from '../src/app/common/files/s3-file-store';
import { describeFileStoreContract } from './file-store.contract';

const BUCKET = 'contract';
let minio: StartedMinio;

const storeFor = (overrides: { bucket?: string; secret?: string } = {}) =>
  createS3FileStore({
    S3_BUCKET: overrides.bucket ?? BUCKET,
    S3_REGION: minio.region,
    S3_ENDPOINT: minio.endpoint,
    S3_FORCE_PATH_STYLE: true,
    S3_ACCESS_KEY_ID: minio.accessKeyId,
    S3_SECRET_ACCESS_KEY: overrides.secret ?? minio.secretAccessKey,
  });

beforeAll(async () => {
  minio = await startMinio();
  await minio.createBucket(BUCKET);
});

afterAll(async () => {
  await minio.stop();
});

describeFileStoreContract('S3', () => {
  const store = storeFor();
  return Promise.resolve({
    store,
    schoolA: randomUUID(),
    schoolB: randomUUID(),
    prepare: () => Promise.resolve(),
    stop: () => {
      store.onApplicationShutdown();
      return Promise.resolve();
    },
  });
});

describe('S3 file store', () => {
  let store: S3FileStore;

  beforeAll(() => {
    store = storeFor();
  });

  afterAll(() => {
    store.onApplicationShutdown();
  });

  it('keeps one key apart in two schools', async () => {
    const key = randomUUID();
    const [schoolA, schoolB] = [randomUUID(), randomUUID()];
    const [bytesA, bytesB] = [randomBytes(64), randomBytes(64)];

    await store.put({ organizationId: schoolA, key, bytes: bytesA });
    await store.put({ organizationId: schoolB, key, bytes: bytesB });

    expect(
      (await store.get({ organizationId: schoolA, key }))?.equals(bytesA)
    ).toBe(true);
    expect(
      (await store.get({ organizationId: schoolB, key }))?.equals(bytesB)
    ).toBe(true);
  });

  it('stores the object under <organizationId>/<key> in the bucket', async () => {
    const [organizationId, key] = [randomUUID(), randomUUID()];
    await store.put({ organizationId, key, bytes: randomBytes(8) });
    const client = new S3Client({
      region: minio.region,
      endpoint: minio.endpoint,
      forcePathStyle: true,
      credentials: {
        accessKeyId: minio.accessKeyId,
        secretAccessKey: minio.secretAccessKey,
      },
    });

    const head = await client.send(
      new HeadObjectCommand({ Bucket: BUCKET, Key: `${organizationId}/${key}` })
    );
    client.destroy();

    expect(head.ContentLength).toBe(8);
  });

  it.each([
    ['a key with a slash', randomUUID(), 'a/b'],
    ['a key that climbs out of the prefix', randomUUID(), '../other/file'],
    ['a school with a slash', 'a/b', randomUUID()],
    ['an empty key', randomUUID(), ''],
  ])('refuses %s on every operation', async (_name, organizationId, key) => {
    const input = { organizationId, key };

    await expect(store.get(input)).rejects.toThrow(/Refusing/);
    await expect(store.delete(input)).rejects.toThrow(/Refusing/);
    await expect(
      store.put({ ...input, bytes: randomBytes(4) })
    ).rejects.toThrow(/Refusing/);
  });

  it('rejects, rather than answering undefined, when the credentials are wrong', async () => {
    const wrong = storeFor({ secret: 'not-the-secret' });

    await expect(
      wrong.get({ organizationId: randomUUID(), key: randomUUID() })
    ).rejects.toThrow();
    wrong.onApplicationShutdown();
  });

  it('checks the bucket at boot', async () => {
    await expect(store.verifyBucket()).resolves.toBeUndefined();

    const missing = storeFor({ bucket: 'no-such-bucket' });
    await expect(missing.verifyBucket()).rejects.toThrow(/no-such-bucket/);
    missing.onApplicationShutdown();
  });
});
