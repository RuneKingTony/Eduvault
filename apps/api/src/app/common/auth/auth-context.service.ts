import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { AuthService } from '@thallesp/nestjs-better-auth';
import { fromNodeHeaders } from 'better-auth/node';
import {
  ACTING_ORG_HEADER,
  ACTING_REASON_HEADER,
  type SuspendedSchool,
} from '@eduvault/api-contract';
import {
  OWNER_ROLE,
  can,
  isSuperAdmin,
  parsePermissionMap,
  resolvePermissions,
  splitRoles,
  type PermissionMap,
} from '@eduvault/policy';
import type { Request } from 'express';
import type { Pool } from 'pg';
import { DB_TOKEN } from '../db/tokens';
import { actingPermissions, parseActingReason } from './acting';
import type { AppAuth } from './better-auth';
import { findSuspendedSchool } from './suspended-school';
import type {
  AuthedRequest,
  AuthenticatedUser,
  OrgContext,
  SessionContext,
} from './auth.types';

// The admin and organization plugins add these fields at runtime, but
// getSession's declared type omits them when plugins come from a shared factory.
interface PluginSession {
  user: AuthenticatedUser & {
    banned?: boolean | null;
    role?: string | null;
    mustChangePassword?: boolean | null;
  };
  session: {
    activeOrganizationId?: string | null;
    activeTeamId?: string | null;
  };
}

@Injectable()
export class AuthContextService {
  constructor(
    private readonly authService: AuthService<AppAuth>,
    @Inject(DB_TOKEN) private readonly pool: Pool
  ) {}

  /** Banned users count as unauthenticated. */
  async resolveSession(req: Request): Promise<SessionContext | undefined> {
    const headers = fromNodeHeaders(req.headers);
    const result = (await this.authService.api
      .getSession({ headers })
      .catch(() => null)) as PluginSession | null;
    if (!result?.user || result.user.banned === true) {
      return undefined;
    }
    return {
      user: {
        id: result.user.id,
        email: result.user.email,
        name: result.user.name,
      },
      mustChangePassword: result.user.mustChangePassword === true,
      platformRole: isSuperAdmin(result.user.role) ? 'superadmin' : null,
      activeOrganizationId: result.session.activeOrganizationId ?? null,
      activeTeamId: result.session.activeTeamId ?? null,
      headers,
    };
  }

  /**
   * `user` stays the super admin's own so approval checks compare their id.
   * The audit stash precedes reason parsing so a refused reason is recorded.
   */
  async resolveActing(
    session: SessionContext,
    req: AuthedRequest
  ): Promise<OrgContext | undefined> {
    const named = req.headers[ACTING_ORG_HEADER];
    const organizationId = (Array.isArray(named) ? named[0] : named)?.trim();
    if (
      session.platformRole !== 'superadmin' ||
      organizationId === undefined ||
      organizationId === ''
    ) {
      return undefined;
    }
    const found = await this.pool.query(
      'SELECT 1 FROM "organization" WHERE id = $1',
      [organizationId]
    );
    if (found.rowCount === 0) {
      throw new NotFoundException('School not found');
    }
    req.actingAudit = {
      actorUserId: session.user.id,
      organizationId,
      reason: null,
    };
    const reason = parseActingReason(req.headers[ACTING_REASON_HEADER]);
    req.actingAudit.reason = reason;
    const writes = reason !== null;
    return {
      user: session.user,
      organizationId,
      roles: [],
      permissions: actingPermissions(writes),
      isOwner: writes,
      activeCampusId: null,
      campusScope: 'all',
      classScope: 'all',
      acting: { organizationId, writes, reason },
      headers: session.headers,
    };
  }

  findSuspendedSchool(organizationId: string): Promise<SuspendedSchool | null> {
    return findSuspendedSchool(this.pool, organizationId);
  }

  async resolveOrganization(
    session: SessionContext
  ): Promise<OrgContext | undefined> {
    const { activeOrganizationId: organizationId, headers } = session;
    if (organizationId === null) {
      return undefined;
    }

    const member = await this.authService.api
      .getActiveMember({ headers })
      .catch(() => null);
    if (member?.organizationId !== organizationId) {
      return undefined;
    }

    const roles = splitRoles(member.role);
    const permissions = await this.loadPermissions(organizationId, roles);
    const schoolWide = can(permissions, 'campus', 'readAll');
    const campuses = schoolWide
      ? await this.authService.api.listOrganizationTeams({
          query: { organizationId },
          headers,
        })
      : await this.listUserCampuses(headers, organizationId);
    const campusIds = campuses.map((team) => team.id);
    const activeTeamId = session.activeTeamId ?? null;

    return {
      user: session.user,
      organizationId,
      roles,
      permissions,
      isOwner: roles.includes(OWNER_ROLE),
      activeCampusId:
        activeTeamId !== null && campusIds.includes(activeTeamId)
          ? activeTeamId
          : null,
      campusScope: schoolWide ? 'all' : campusIds,
      classScope: 'all',
      acting: null,
      headers,
    };
  }

  private async loadPermissions(
    organizationId: string,
    roles: string[]
  ): Promise<PermissionMap> {
    const rows = await this.pool.query<{ role: string; permission: string }>(
      `SELECT role, permission FROM "organizationRole"
       WHERE "organizationId" = $1 AND role = ANY($2)`,
      [organizationId, roles]
    );
    const custom: Record<string, PermissionMap> = {};
    for (const row of rows.rows) {
      custom[row.role] = parsePermissionMap(row.permission);
    }
    return resolvePermissions(roles, custom);
  }

  private async listUserCampuses(headers: Headers, organizationId: string) {
    const teams = await this.authService.api.listUserTeams({ headers });
    return teams.filter((team) => team.organizationId === organizationId);
  }
}
