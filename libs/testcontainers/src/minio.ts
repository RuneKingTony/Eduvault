import { CreateBucketCommand, S3Client } from '@aws-sdk/client-s3';
import { MinioContainer } from '@testcontainers/minio';

/** Pulls of minio/minio from Docker Hub and Quay were refused when this was written, so this is Chainguard's build. */
export const MINIO_IMAGE =
  'cgr.dev/chainguard/minio@sha256:dc455cdd4db6e390b1b26514f15ff37681a777bf8dab41aac445a0259f751e56';

const REGION = 'us-east-1';
const ACCESS_KEY_ID = 'eduvault-test';
const SECRET_ACCESS_KEY = 'eduvault-test-secret';

export interface StartedMinio {
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  createBucket: (name: string) => Promise<void>;
  stop: () => Promise<void>;
}

export async function startMinio(
  image: string = MINIO_IMAGE
): Promise<StartedMinio> {
  const container = await new MinioContainer(image)
    .withUsername(ACCESS_KEY_ID)
    .withPassword(SECRET_ACCESS_KEY)
    .start();
  const endpoint = container.getConnectionUrl();
  const admin = new S3Client({
    region: REGION,
    endpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId: ACCESS_KEY_ID,
      secretAccessKey: SECRET_ACCESS_KEY,
    },
  });
  return {
    endpoint,
    region: REGION,
    accessKeyId: ACCESS_KEY_ID,
    secretAccessKey: SECRET_ACCESS_KEY,
    createBucket: async (name) => {
      await admin.send(new CreateBucketCommand({ Bucket: name }));
    },
    stop: async () => {
      admin.destroy();
      await container.stop({ remove: true, removeVolumes: true });
    },
  };
}
