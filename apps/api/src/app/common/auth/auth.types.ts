import type { Request } from 'express';
import type { MePermissions, Scope } from '@eduvault/api-contract';
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
  roles: string[];
  permissions: PermissionMap;
  isOwner: boolean;
  /** The campus (Better Auth team) the session is acting in, if valid. */
  activeCampusId: string | null;
  campusScope: Scope;
  classScope: Scope;
  acting: MePermissions['acting'];
  headers: Headers;
}

export type AuthedRequest = Request & {
  authSession?: SessionContext;
  org?: OrgContext;
};
