import { workerDatabase } from './workers';

const poolId = Number(process.env['VITEST_POOL_ID']);
const url = process.env['DATABASE_URL'];

if (url !== undefined && Number.isInteger(poolId) && poolId > 0) {
  const target = new URL(url);
  target.pathname = `/${workerDatabase(poolId)}`;
  process.env['DATABASE_URL'] = target.toString();
}
