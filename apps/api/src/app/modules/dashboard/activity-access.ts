import type { ActivityPillarName } from '@eduvault/api-contract';
import {
  FINANCE_READ_GATE,
  can,
  canAny,
  type PermissionMap,
} from '@eduvault/policy';

export type FoundationSubject = 'student' | 'school_year' | 'announcement';

export interface ActivityAccess {
  pillars: ActivityPillarName[];
  foundationSubjects: FoundationSubject[];
  /** Leave events are personal: the requester sees their own, approvers those in their campus scope. */
  viewerId: string;
  leaveApprover: boolean;
}

/** Finance rows are campus-scoped, never class-scoped. */
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
  if (canAny(permissions, FINANCE_READ_GATE)) {
    pillars.push('finance');
  }
  return {
    pillars,
    foundationSubjects,
    viewerId,
    leaveApprover: can(permissions, 'leave', 'approve'),
  };
}
