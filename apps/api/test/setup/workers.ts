import { availableParallelism } from 'node:os';

export const WORKER_COUNT = Math.min(
  Number(process.env['INTEGRATION_WORKERS']) || availableParallelism(),
  8
);

export const workerDatabase = (poolId: number) => `eduvault_w${poolId}`;
