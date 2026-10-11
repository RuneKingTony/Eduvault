import type { ActivityPillarName } from '@eduvault/api-contract';
import { can, type PermissionMap } from '@eduvault/policy';

export type FoundationSubject = 'student' | 'school_year' | 'announcement';

export interface ActivityAccess {
  pillars: ActivityPillarName[];
  foundationSubjects: FoundationSubject[];
}

/** Finance rows stay hidden until a finance read permission exists. */
export function activityAccess(permissions: PermissionMap): ActivityAccess {
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
  return { pillars, foundationSubjects };
}
