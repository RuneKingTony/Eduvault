import type { Gate } from './roles';

export const FINANCE_READ_GATE = [
  'invoice:read',
  'payment:read',
] as const satisfies Gate;
