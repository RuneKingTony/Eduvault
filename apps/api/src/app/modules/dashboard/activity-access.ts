import type { ActivityPillarName } from '@eduvault/api-contract';
import { can, type PermissionMap } from '@eduvault/policy';

export type FoundationSubject = 'student' | 'school_year' | 'announcement';

export interface ActivityAccess {
  pillars: ActivityPillarName[];
  foundationSubjects: FoundationSubject[];
  /** Leave events are personal: the requester sees their own, approvers those in their campus scope. */
  viewerId: string;
  leaveApprover: boolean;
}

/** Finance rows stay hidden until a finance read permission exists. */
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
  return {
    pillars,
    foundationSubjects,
    viewerId,
    leaveApprover: can(permissions, 'leave', 'approve'),
  };
}
