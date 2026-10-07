import { defaultStatements } from 'better-auth/plugins/organization/access';

export const statements = {
  ...defaultStatements,
  student: ['create', 'read', 'update', 'delete'],
  feeSchedule: ['create', 'read', 'update', 'delete'],
  schoolAccount: ['create', 'read', 'update', 'delete'],
} as const;

export type Statements = typeof statements;
export type Resource = keyof Statements;
export type ActionOf<R extends Resource> = Statements[R][number];
