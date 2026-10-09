import { Inject, Injectable } from '@nestjs/common';
import { AuthService } from '@thallesp/nestjs-better-auth';
import { fromNodeHeaders } from 'better-auth/node';
import { getOrgAdapter } from 'better-auth/plugins';
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
import type { AppAuth } from './better-auth';
import { getOrganizationOptions } from './better-auth-base';
import type {
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

  /**
   * addTeamMember demands `member:update`, which no starter role holds; the
   * route guard has already checked `team:create`.
   */
  async enrolInCampus(teamId: string, userId: string): Promise<void> {
    const context = (await this.authService.instance
      .$context) as unknown as Parameters<typeof getOrgAdapter>[0];
    await getOrgAdapter(
      context,
      getOrganizationOptions(this.pool)
    ).findOrCreateTeamMember({ teamId, userId });
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
