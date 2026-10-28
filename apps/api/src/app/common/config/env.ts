import { z } from 'zod';

const flag = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true');

const GATEWAY_KEY_BYTES = 32;

const gatewayKey = z
  .string()
  .refine(
    (value) =>
      /^[\d+/a-z]+={0,2}$/i.test(value) &&
      Buffer.from(value, 'base64').length === GATEWAY_KEY_BYTES,
    'Must be 32 random bytes, base64 encoded (openssl rand -base64 32)'
  );

const cookieDomain = z
  .string()
  .regex(
    /^\.?[a-z\d-]+(\.[a-z\d-]+)*\.[a-z][a-z\d-]*$/i,
    'Must be a hostname of at least two labels with an optional leading dot, like .staging.example.com'
  );

const envObject = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1),
  DATABASE_POOL_MAX: z.coerce.number().int().positive().default(20),
  DATABASE_CONNECT_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(10_000),
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
  GATEWAY_ENCRYPTION_KEY: gatewayKey.optional(),
  AUTH_COOKIE_DOMAIN: cookieDomain.optional(),
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

const COOKIE_URL_NAMES = [
  'BETTER_AUTH_URL',
  'WEB_ADMIN_URL',
  'WEB_PORTAL_URL',
] as const;

/** Every app URL must sit under the cookie domain, or the session cookie never reaches it. */
function cookieDomainProblems(
  env: Pick<Env, 'AUTH_COOKIE_DOMAIN' | (typeof COOKIE_URL_NAMES)[number]>
): EnvProblem[] {
  if (env.AUTH_COOKIE_DOMAIN === undefined) {
    return [];
  }
  const domain = env.AUTH_COOKIE_DOMAIN.replace(/^\./, '').toLowerCase();
  return COOKIE_URL_NAMES.filter((name) => {
    // A malformed URL is already reported by its own field.
    if (!URL.canParse(env[name])) {
      return false;
    }
    const host = new URL(env[name]).hostname;
    return host !== domain && !host.endsWith(`.${domain}`);
  }).map((name) => ({
    name,
    message: `Host must be ${domain} or end with .${domain} to share the AUTH_COOKIE_DOMAIN cookie`,
  }));
}

const envSchema = envObject.superRefine((env, ctx) => {
  const problems = [
    ...(env.FILE_STORE_DRIVER === 's3' ? s3Problems(env) : []),
    ...cookieDomainProblems(env),
  ];
  for (const { name, message } of problems) {
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
