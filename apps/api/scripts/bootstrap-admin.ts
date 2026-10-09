import { Pool } from 'pg';
import { createAuth } from '../src/app/common/auth/better-auth';
import {
  BootstrapRefusedError,
  bootstrapSuperAdmin,
  parseBootstrapEnv,
} from '../src/app/common/auth/bootstrap-admin';
import { loadEnv } from '../src/app/common/config/env';

async function main(): Promise<number> {
  let credentials;
  try {
    credentials = parseBootstrapEnv(process.env);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }

  const env = loadEnv();
  const pool = new Pool({ connectionString: env.DATABASE_URL });
  try {
    const outcome = await bootstrapSuperAdmin(
      createAuth(pool, env),
      credentials
    );
    console.log(
      outcome === 'created'
        ? '✓ superadmin created (role: superadmin)'
        : 'superadmin already exists'
    );
    return 0;
  } catch (error) {
    if (error instanceof BootstrapRefusedError) {
      console.error(error.message);
      return 1;
    }
    throw error;
  } finally {
    await pool.end();
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
