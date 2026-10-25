import type { INestApplicationContext } from '@nestjs/common';
import { AuthService } from '@thallesp/nestjs-better-auth';
import {
  bootstrapSuperAdmin,
  parseBootstrapEnv,
  type AppAuth,
  type AuthenticatedUser,
} from '../../src/app/common/auth';
import { KYSELY_TOKEN, type Database } from '../../src/app/common/db/tokens';
import { SEED_PASSWORD, SUPER_ADMIN_EMAIL } from './members';

export async function ensureSuperAdmin(
  app: INestApplicationContext,
  log: (line: string) => void
): Promise<AuthenticatedUser> {
  const auth = app.get(AuthService<AppAuth>, { strict: false }).instance;
  const credentials = parseBootstrapEnv({
    ...process.env,
    BOOTSTRAP_ADMIN_EMAIL:
      process.env['BOOTSTRAP_ADMIN_EMAIL'] ?? SUPER_ADMIN_EMAIL,
    BOOTSTRAP_ADMIN_PASSWORD:
      process.env['BOOTSTRAP_ADMIN_PASSWORD'] ?? SEED_PASSWORD,
  });
  const outcome = await bootstrapSuperAdmin(auth, credentials);
  if (outcome === 'created') {
    log(`Created the super admin ${credentials.email}.`);
  }
  const db = app.get<Database>(KYSELY_TOKEN, { strict: false });
  return db
    .selectFrom('user')
    .select(['id', 'email', 'name'])
    .where('email', '=', credentials.email.toLowerCase())
    .executeTakeFirstOrThrow();
}
