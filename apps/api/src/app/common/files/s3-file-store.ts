import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import type { OnApplicationShutdown } from '@nestjs/common';
import { s3Problems, type Env } from '../config/env';
import type { FileStore, StoredFileKey } from './file-store';
import { objectKey } from './s3-object-key';

type S3Env = Pick<
  Env,
  | 'S3_BUCKET'
  | 'S3_REGION'
  | 'S3_ENDPOINT'
  | 'S3_FORCE_PATH_STYLE'
  | 'S3_ACCESS_KEY_ID'
  | 'S3_SECRET_ACCESS_KEY'
>;

const isMissingKey = (error: unknown): boolean =>
  error instanceof Error && error.name === 'NoSuchKey';

/** One private bucket for every school; the school is the first segment of the key. */
export class S3FileStore implements FileStore, OnApplicationShutdown {
  constructor(
    private readonly client: S3Client,
    private readonly bucket: string
  ) {}

  async verifyBucket(): Promise<void> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch (error) {
      throw new Error(
        `S3 bucket "${this.bucket}" is not reachable: ${error instanceof Error ? error.message : 'unknown error'}`,
        { cause: error }
      );
    }
  }

  async put(input: StoredFileKey & { bytes: Buffer }): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: objectKey(input),
        Body: input.bytes,
      })
    );
  }

  async get(input: StoredFileKey): Promise<Buffer | undefined> {
    try {
      const { Body } = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: objectKey(input) })
      );
      if (Body === undefined) {
        throw new Error('S3 returned an object with no body');
      }
      return Buffer.from(await Body.transformToByteArray());
    } catch (error) {
      if (isMissingKey(error)) {
        return undefined;
      }
      throw error;
    }
  }

  async delete(input: StoredFileKey): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: objectKey(input) })
    );
  }

  onApplicationShutdown(): void {
    this.client.destroy();
  }
}

export function createS3FileStore(env: S3Env): S3FileStore {
  const problems = s3Problems(env);
  if (problems.length > 0 || env.S3_BUCKET === undefined) {
    const lines = problems.map((p) => `  ${p.name}: ${p.message}`);
    throw new Error(
      `The s3 file store is not configured:\n${lines.join('\n')}`
    );
  }
  const client = new S3Client({
    region: env.S3_REGION,
    forcePathStyle: env.S3_FORCE_PATH_STYLE,
    ...(env.S3_ENDPOINT === undefined ? {} : { endpoint: env.S3_ENDPOINT }),
    ...(env.S3_ACCESS_KEY_ID === undefined ||
    env.S3_SECRET_ACCESS_KEY === undefined
      ? {}
      : {
          credentials: {
            accessKeyId: env.S3_ACCESS_KEY_ID,
            secretAccessKey: env.S3_SECRET_ACCESS_KEY,
          },
        }),
    // Providers without the newer flexible-checksum headers reject the SDK default.
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  });
  return new S3FileStore(client, env.S3_BUCKET);
}
