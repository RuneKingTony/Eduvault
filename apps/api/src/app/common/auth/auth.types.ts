import type { Request } from 'express';

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
  /** The user's role in that school. */
  role: string;
  /** The campus (Better Auth team) the session is acting in, if valid. */
  activeCampusId: string | null;
  /** 'all' for school-wide roles; otherwise the campuses the user works at. */
  campusScope: 'all' | string[];
  headers: Headers;
}

export type AuthedRequest = Request & {
  authSession?: SessionContext;
  org?: OrgContext;
};
