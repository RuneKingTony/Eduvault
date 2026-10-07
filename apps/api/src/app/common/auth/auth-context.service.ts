import { Injectable } from '@nestjs/common';
import { AuthService } from '@thallesp/nestjs-better-auth';
import { fromNodeHeaders } from 'better-auth/node';
import { seesAllCampuses } from '@eduvault/policy';
import type { Request } from 'express';
import type { AppAuth } from './better-auth';
import type {
  AuthenticatedUser,
  OrgContext,
  SessionContext,
} from './auth.types';

// The admin and organization plugins add these fields at runtime, but
// getSession's declared type omits them when plugins come from a shared factory.
interface PluginSession {
  user: AuthenticatedUser & { banned?: boolean | null };
  session: {
    activeOrganizationId?: string | null;
    activeTeamId?: string | null;
  };
}

@Injectable()
export class AuthContextService {
  constructor(private readonly authService: AuthService<AppAuth>) {}

  /** Banned users count as unauthenticated. */
  async resolveSession(req: Request): Promise<SessionContext | undefined> {
    const headers = fromNodeHeaders(req.headers);
    const result = (await this.authService.api
      .getSession({ headers })
      .catch(() => null)) as PluginSession | null;
    if (!result?.user || result.user.banned) return undefined;
    return {
      user: {
        id: result.user.id,
        email: result.user.email,
        name: result.user.name,
      },
      activeOrganizationId: result.session.activeOrganizationId ?? null,
      activeTeamId: result.session.activeTeamId ?? null,
      headers,
    };
  }

  async resolveOrganization(
    session: SessionContext
  ): Promise<OrgContext | undefined> {
    const { activeOrganizationId: organizationId, headers } = session;
    if (!organizationId) return undefined;

    const member = await this.authService.api
      .getActiveMember({ headers })
      .catch(() => null);
    if (member?.organizationId !== organizationId) return undefined;

    const schoolWide = seesAllCampuses(member.role);
    const campuses = schoolWide
      ? await this.authService.api.listOrganizationTeams({
          query: { organizationId },
          headers,
        })
      : (await this.authService.api.listUserTeams({ headers })).filter(
          (team) => team.organizationId === organizationId
        );
    const campusIds = campuses.map((team) => team.id);

    return {
      user: session.user,
      organizationId,
      role: member.role,
      activeCampusId:
        session.activeTeamId && campusIds.includes(session.activeTeamId)
          ? session.activeTeamId
          : null,
      campusScope: schoolWide ? 'all' : campusIds,
      headers,
    };
  }
}
