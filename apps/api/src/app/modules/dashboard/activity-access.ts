import type { ActivityPillarName } from '@eduvault/api-contract';
import { can, type PermissionMap } from '@eduvault/policy';

export type FoundationSubject = 'student' | 'school_year' | 'announcement';

export type FinanceSubject =
  | 'payment'
  | 'payment_void'
  | 'billing_run'
  | 'adjustment'
  | 'student_discount';

export interface ActivityAccess {
  pillars: ActivityPillarName[];
  foundationSubjects: FoundationSubject[];
  financeSubjects: FinanceSubject[];
  /** Leave events are personal: the requester sees their own, approvers those in their campus scope. */
  viewerId: string;
  leaveApprover: boolean;
}

/** Finance rows are campus-scoped, never class-scoped; each subject opens with the permission that reads its records. */
export function activityAccess(
  permissions: PermissionMap,
  viewerId: string
): ActivityAccess {
  const foundationSubjects: FoundationSubject[] = [];
  if (can(permissions, 'student', 'read')) {
    foundationSubjects.push('student');
  }
  if (can(permissions, 'session', 'read')) {
    foundationSubjects.push('school_year');
  }
  if (can(permissions, 'announcement', 'read')) {
    foundationSubjects.push('announcement');
  }
  const pillars: ActivityPillarName[] = ['platform'];
  if (can(permissions, 'member', 'read')) {
    pillars.push('access');
  }
  if (foundationSubjects.length > 0) {
    pillars.push('foundation');
  }
  const financeSubjects: FinanceSubject[] = [];
  if (can(permissions, 'payment', 'read')) {
    financeSubjects.push('payment', 'payment_void');
  }
  if (can(permissions, 'invoice', 'read')) {
    financeSubjects.push('billing_run');
  }
  if (can(permissions, 'adjustment', 'read')) {
    financeSubjects.push('adjustment', 'student_discount');
  }
  if (financeSubjects.length > 0) {
    pillars.push('finance');
  }
  return {
    pillars,
    foundationSubjects,
    financeSubjects,
    viewerId,
    leaveApprover: can(permissions, 'leave', 'approve'),
  };
}
