import { z } from 'zod';
import { PASSWORD_MIN_LENGTH } from '@eduvault/api-contract';
import { isSuperAdmin } from '@eduvault/policy';
import type { AppAuth } from './better-auth';

type BootstrapResult = 'created' | 'exists';

export class BootstrapRefusedError extends Error {
  constructor() {
    super('That email belongs to a user who is not a super admin');
    this.name = 'BootstrapRefusedError';
  }
}

const bootstrapEnvSchema = z.object({
  BOOTSTRAP_ADMIN_EMAIL: z.email(),
  BOOTSTRAP_ADMIN_PASSWORD: z.string().min(PASSWORD_MIN_LENGTH),
});

interface BootstrapCredentials {
  email: string;
  password: string;
}

export const DEV_BOOTSTRAP_EMAIL = 'admin@eduvault.test';
export const DEV_BOOTSTRAP_PASSWORD = 'password123';

const describeFailures = (
  names: string[],
  source: Record<string, string | undefined>
): string => {
  const unset = names.filter((name) => (source[name] ?? '') === '');
  const invalid = names.filter((name) => (source[name] ?? '') !== '');
  const verb = invalid.length > 1 ? 'are' : 'is';
  const lines: string[] = [];
  if (unset.length > 0) {
    lines.push(`Set ${unset.join(' and ')} first`);
  }
  if (invalid.length > 0) {
    lines.push(`${invalid.join(' and ')} ${verb} not valid`);
  }
  return lines.join('. ');
};

export function parseBootstrapEnv(
  source: Record<string, string | undefined>
): BootstrapCredentials {
  const parsed = bootstrapEnvSchema.safeParse(source);
  if (!parsed.success) {
    const names = parsed.error.issues.map((issue) => issue.path.join('.'));
    throw new Error(describeFailures([...new Set(names)], source));
  }
  const email = parsed.data.BOOTSTRAP_ADMIN_EMAIL;
  const password = parsed.data.BOOTSTRAP_ADMIN_PASSWORD;
  if (
    source['NODE_ENV'] === 'production' &&
    (password === DEV_BOOTSTRAP_PASSWORD ||
      email.toLowerCase().endsWith('.test'))
  ) {
    throw new Error(
      'Production needs a real BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD, not the local defaults'
    );
  }
  return { email, password };
}

/**
 * The only place a super admin is made: a system call that passes the
 * `superadmin` role.
 */
export async function bootstrapSuperAdmin(
  auth: Pick<AppAuth, 'api' | '$context'>,
  { email, password }: BootstrapCredentials
): Promise<BootstrapResult> {
  const { internalAdapter } = await auth.$context;
  const found = await internalAdapter.findUserByEmail(email.toLowerCase());
  if (found) {
    const { role } = found.user as { role?: string | null };
    if (isSuperAdmin(role)) {
      return 'exists';
    }
    throw new BootstrapRefusedError();
  }
  await auth.api.createUser({
    body: {
      name: 'Eduvault super admin',
      email,
      password,
      role: 'superadmin',
      data: { mustChangePassword: false },
    },
  });
  return 'created';
}
