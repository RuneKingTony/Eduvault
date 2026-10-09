import type { Request } from 'express';
import type { PermissionMap } from '@eduvault/policy';

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
}

export interface SessionContext {
  user: AuthenticatedUser;
  activeOrganizationId: string | null;
  activeTeamId: string | null;
  headers: Headers;
}

export interface OrgContext {
  user: AuthenticatedUser;
  /** The school (Better Auth organization) the session is acting in. */
  organizationId: string;
  /** The role slugs held in that school. */
  roles: string[];
  /** The union of every held role's permissions, read on this request. */
  permissions: PermissionMap;
  isOwner: boolean;
  /** The campus (Better Auth team) the session is acting in, if valid. */
  activeCampusId: string | null;
  /** 'all' with `campus:readAll`; otherwise the campuses the user works at. */
  campusScope: 'all' | string[];
  /** Always 'all' until class scoping lands. */
  classScope: 'all';
  /** Always empty until portal scoping lands. */
  studentScope: string[];
  /** Always null until super-admin acting lands. */
  acting: null;
  headers: Headers;
}

export type AuthedRequest = Request & {
  authSession?: SessionContext;
  org?: OrgContext;
};
