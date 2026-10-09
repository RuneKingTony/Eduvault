import type { OrgContext } from './auth';

export type CampusScope = OrgContext['campusScope'];

export const canSeeCampus = (scope: CampusScope, campusId: string): boolean =>
  scope === 'all' || scope.includes(campusId);
