import { Inject, Injectable } from '@nestjs/common';
import { AuthService } from '@thallesp/nestjs-better-auth';
import { getOrgAdapter } from 'better-auth/plugins';
import type { Pool } from 'pg';
import { DB_TOKEN } from '../db/tokens';
import { withSchoolLock } from '../db/with-school-lock';
import type { AppAuth } from './better-auth';
import { getOrganizationOptions } from './better-auth-base';

interface NewOrganization {
  name: string;
  slug: string;
  userId: string;
}

/**
 * System-level school writes for the platform module: no session, so Better
 * Auth treats `userId` as the creator and skips its own creation limits.
 */
@Injectable()
export class OrganizationAdminService {
  constructor(
    private readonly authService: AuthService<AppAuth>,
    @Inject(DB_TOKEN) private readonly pool: Pool
  ) {}

  underSchoolLock<T>(organizationId: string, fn: () => Promise<T>): Promise<T> {
    return withSchoolLock(this.pool, organizationId, fn);
  }

  async create(input: NewOrganization): Promise<{ id: string }> {
    const { id } = await this.authService.api.createOrganization({
      body: input,
    });
    return { id };
  }

  async startIdleSessionsIn(
    userId: string,
    organizationId: string
  ): Promise<void> {
    const { internalAdapter } = await this.authService.instance.$context;
    const sessions = await internalAdapter.listSessions(userId);
    for (const session of sessions) {
      const { activeOrganizationId } = session as {
        activeOrganizationId?: string | null;
      };
      if (activeOrganizationId === null || activeOrganizationId === undefined) {
        await internalAdapter.updateSession(session.token, {
          activeOrganizationId: organizationId,
        });
      }
    }
  }

  /** The school name lives on `organization` too; the profile route keeps them in step. */
  async renameOrganization(
    organizationId: string,
    name: string
  ): Promise<void> {
    const adapter = await this.adapter();
    await adapter.updateOrganization(organizationId, { name });
  }

  /** For a super admin acting in a school, who has no session membership there. */
  async renameTeam(teamId: string, name: string): Promise<void> {
    const adapter = await this.adapter();
    await adapter.updateTeam(teamId, { name });
  }

  /**
   * addTeamMember demands `member:update`, which no starter role holds; the
   * route guard has already checked `team:create`.
   */
  async enrolInCampus(teamId: string, userId: string): Promise<void> {
    const adapter = await this.adapter();
    await adapter.findOrCreateTeamMember({ teamId, userId });
  }

  async deleteById(organizationId: string): Promise<void> {
    const adapter = await this.adapter();
    await adapter.deleteOrganization(organizationId);
  }

  async deleteBySlug(slug: string): Promise<void> {
    const adapter = await this.adapter();
    const school = await adapter.findOrganizationBySlug(slug);
    if (school) {
      await adapter.deleteOrganization(school.id);
    }
  }

  private async adapter() {
    const context = (await this.authService.instance
      .$context) as unknown as Parameters<typeof getOrgAdapter>[0];
    return getOrgAdapter(context, getOrganizationOptions(this.pool));
  }
}
