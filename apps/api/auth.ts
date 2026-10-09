// CLI shim for `better-auth generate`. Options come from better-auth-base.ts so
// the generated schema always matches the running app.
import { betterAuth } from 'better-auth';
import { Pool } from 'pg';
import {
  advancedBaseConfig,
  emailAndPasswordBaseConfig,
  getPlugins,
  userBaseConfig,
} from './src/app/common/auth/better-auth-base';

const pool = new Pool({
  connectionString:
    process.env['DATABASE_URL'] ??
    'postgres://eduvault:eduvault@localhost:5434/eduvault',
});

export default betterAuth({
  appName: 'Eduvault',
  database: pool,
  emailAndPassword: emailAndPasswordBaseConfig,
  user: userBaseConfig,
  advanced: advancedBaseConfig,
  plugins: getPlugins(pool),
});
