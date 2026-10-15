import { availableParallelism } from 'node:os';

export const WORKER_COUNT = Math.min(availableParallelism(), 8);

export const workerDatabase = (poolId: number) => `eduvault_w${poolId}`;
