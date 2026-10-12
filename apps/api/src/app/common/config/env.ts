import { z } from 'zod';

const flag = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true');

const envObject = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.url(),
  WEB_ADMIN_URL: z.url(),
  WEB_PORTAL_URL: z.url(),
  SEED_TODAY: z.iso.date().optional(),
  AUTH_RATE_LIMIT: flag,
  FILE_STORE_DRIVER: z.enum(['postgres', 's3']).default('postgres'),
  S3_BUCKET: z.string().min(1).optional(),
  S3_REGION: z.string().min(1).optional(),
  S3_ENDPOINT: z.url().optional(),
  S3_FORCE_PATH_STYLE: flag,
  S3_ACCESS_KEY_ID: z.string().min(1).optional(),
  S3_SECRET_ACCESS_KEY: z.string().min(1).optional(),
});

export type Env = z.infer<typeof envObject>;

interface EnvProblem {
  name: string;
  message: string;
}

/** What the s3 driver needs: a bucket, a region, and credentials both or neither. */
export function s3Problems(
  env: Pick<
    Env,
    'S3_BUCKET' | 'S3_REGION' | 'S3_ACCESS_KEY_ID' | 'S3_SECRET_ACCESS_KEY'
  >
): EnvProblem[] {
  const problems: EnvProblem[] = [];
  for (const name of ['S3_BUCKET', 'S3_REGION'] as const) {
    if (env[name] === undefined) {
      problems.push({ name, message: 'Required when using the s3 file store' });
    }
  }
  const keyId = env.S3_ACCESS_KEY_ID !== undefined;
  const secret = env.S3_SECRET_ACCESS_KEY !== undefined;
  if (keyId !== secret) {
    problems.push({
      name: keyId ? 'S3_SECRET_ACCESS_KEY' : 'S3_ACCESS_KEY_ID',
      message: 'Set both S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY, or neither',
    });
  }
  return problems;
}

const envSchema = envObject.superRefine((env, ctx) => {
  if (env.FILE_STORE_DRIVER !== 's3') {
    return;
  }
  for (const { name, message } of s3Problems(env)) {
    ctx.addIssue({ code: 'custom', path: [name], message });
  }
});

export const ENV_TOKEN = 'ENV_TOKEN';

/** Fails fast with every invalid variable named, so a bad boot is one read. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((issue) => `  ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment:\n${problems}`);
  }
  return parsed.data;
}
