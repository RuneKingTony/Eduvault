import type { Request } from 'express';
import type { Scope } from '@eduvault/api-contract';
import type { PermissionMap } from '@eduvault/policy';

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
}

export type PlatformRole = 'superadmin';

export interface SessionContext {
  user: AuthenticatedUser;
  mustChangePassword: boolean;
  platformRole: PlatformRole | null;
  activeOrganizationId: string | null;
  activeTeamId: string | null;
  headers: Headers;
}

export interface ActingContext {
  organizationId: string;
  writes: boolean;
  reason: string | null;
}

export interface ActingAudit {
  actorUserId: string;
  organizationId: string;
  reason: string | null;
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
  acting: ActingContext | null;
  headers: Headers;
}

export type AuthedRequest = Request & {
  authSession?: SessionContext;
  org?: OrgContext;
  actingAudit?: ActingAudit;
};
