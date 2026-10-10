import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuthService } from '@thallesp/nestjs-better-auth';
import type { Campus, CampusSummary } from '@eduvault/api-contract';
import {
  OrganizationAdminService,
  type AppAuth,
  type OrgContext,
} from '../../common/auth';
import { canSeeCampus } from '../../common/campus-scope';
import { summariseCampus } from './campus-summary';
import { CampusRepository } from './campus.repository';

interface CreateInput {
  name: string;
  address?: string | null;
}

const CAMPUS_IN_USE_MESSAGE =
  'This campus still has classes, students or money records, so it can’t be deleted.';

/**
 * A super admin acting in a school is no member of it, so their headers would
 * be refused; they call Better Auth as the system, as compensation does.
 */
const headersFor = (ctx: OrgContext): Headers | undefined =>
  ctx.acting ? undefined : ctx.headers;

@Injectable()
export class CampusService {
  constructor(
    private readonly campuses: CampusRepository,
    private readonly authService: AuthService<AppAuth>,
    private readonly organizations: OrganizationAdminService
  ) {}

  /** 404 unless the campus is in the caller's scope and exists in the school. */
  async assertInScope(ctx: OrgContext, campusId: string): Promise<void> {
    if (
      !canSeeCampus(ctx.campusScope, campusId) ||
      !(await this.campuses.existsInSchool(ctx.organizationId, campusId))
    ) {
      throw new NotFoundException('Campus not found');
    }
  }

  list(ctx: OrgContext): Promise<Campus[]> {
    return this.campuses.list(ctx.organizationId, ctx.campusScope);
  }

  async get(ctx: OrgContext, id: string): Promise<Campus> {
    if (!canSeeCampus(ctx.campusScope, id)) {
      throw new NotFoundException('Campus not found');
    }
    const campus = await this.campuses.findById(ctx.organizationId, id);
    if (!campus) {
      throw new NotFoundException('Campus not found');
    }
    return campus;
  }

  async summary(ctx: OrgContext): Promise<CampusSummary[]> {
    const campuses = await this.list(ctx);
    const members = await this.campuses.membersOf(
      ctx.organizationId,
      campuses.map((campus) => campus.id)
    );
    return campuses.map((campus) => summariseCampus(campus, members));
  }

  create(ctx: OrgContext, input: CreateInput): Promise<Campus> {
    return this.organizations.underSchoolLock(ctx.organizationId, async () => {
      await this.assertNameFree(ctx, input.name);
      const team = await this.authService.api.createTeam({
        body: { name: input.name, organizationId: ctx.organizationId },
        headers: headersFor(ctx),
      });
      await this.finishCreate(ctx, team.id, input);
      return this.get(ctx, team.id);
    });
  }

  update(
    ctx: OrgContext,
    id: string,
    input: Partial<CreateInput>
  ): Promise<Campus> {
    return this.organizations.underSchoolLock(ctx.organizationId, async () => {
      await this.get(ctx, id);
      if (input.name !== undefined) {
        await this.assertNameFree(ctx, input.name, id);
        await this.rename(ctx, id, input.name);
      }
      if (input.address !== undefined) {
        await this.campuses.updateAddress(
          ctx.organizationId,
          id,
          input.address
        );
      }
      return this.get(ctx, id);
    });
  }

  async remove(ctx: OrgContext, id: string): Promise<{ id: string }> {
    await this.get(ctx, id);
    if (await this.campuses.hasDependents(ctx.organizationId, id)) {
      throw new ConflictException(CAMPUS_IN_USE_MESSAGE);
    }
    await this.authService.api.removeTeam({
      body: { teamId: id, organizationId: ctx.organizationId },
      headers: headersFor(ctx),
    });
    return { id };
  }

  private async assertNameFree(
    ctx: OrgContext,
    name: string,
    exceptId?: string
  ): Promise<void> {
    if (await this.campuses.nameTaken(ctx.organizationId, name, exceptId)) {
      throw new ConflictException(`${name} already exists.`);
    }
  }

  private async rename(
    ctx: OrgContext,
    id: string,
    name: string
  ): Promise<void> {
    await (ctx.acting
      ? this.organizations.renameTeam(id, name)
      : this.authService.api.updateTeam({
          body: { teamId: id, data: { name } },
          headers: ctx.headers,
        }));
  }

  private async finishCreate(
    ctx: OrgContext,
    teamId: string,
    input: CreateInput
  ): Promise<void> {
    try {
      if (!ctx.acting) {
        // Better Auth only lets a user activate a campus they belong to.
        await this.organizations.enrolInCampus(teamId, ctx.user.id);
      }
      await this.campuses.create(ctx.organizationId, {
        id: teamId,
        address: input.address ?? null,
      });
    } catch (error) {
      // No headers: the creator may hold team:create without team:delete.
      await this.authService.api.removeTeam({
        body: { teamId, organizationId: ctx.organizationId },
      });
      throw error;
    }
  }
}
