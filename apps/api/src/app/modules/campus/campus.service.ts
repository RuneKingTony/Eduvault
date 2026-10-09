import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuthService } from '@thallesp/nestjs-better-auth';
import type { Campus } from '@eduvault/api-contract';
import type { AppAuth, OrgContext } from '../../common/auth';
import { canSeeCampus } from '../../common/campus-scope';
import { CampusRepository } from './campus.repository';

interface CreateInput {
  name: string;
  address?: string | null;
}

@Injectable()
export class CampusService {
  constructor(
    private readonly campuses: CampusRepository,
    private readonly authService: AuthService<AppAuth>
  ) {}

  /** 404 unless the campus exists in the given school. */
  async assertInSchool(ctx: OrgContext, campusId: string): Promise<void> {
    if (!(await this.campuses.existsInSchool(ctx.organizationId, campusId))) {
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

  async create(ctx: OrgContext, input: CreateInput): Promise<Campus> {
    const team = await this.authService.api.createTeam({
      body: { name: input.name, organizationId: ctx.organizationId },
      headers: ctx.headers,
    });
    try {
      // Better Auth only lets a user activate a campus they belong to.
      await this.authService.api.addTeamMember({
        body: { teamId: team.id, userId: ctx.user.id },
        headers: ctx.headers,
      });
      await this.campuses.create(ctx.organizationId, {
        id: team.id,
        address: input.address ?? null,
      });
    } catch (error) {
      await this.authService.api.removeTeam({
        body: { teamId: team.id, organizationId: ctx.organizationId },
        headers: ctx.headers,
      });
      throw error;
    }
    return this.get(ctx, team.id);
  }

  async update(
    ctx: OrgContext,
    id: string,
    input: Partial<CreateInput>
  ): Promise<Campus> {
    await this.get(ctx, id);
    if (input.name !== undefined) {
      await this.authService.api.updateTeam({
        body: { teamId: id, data: { name: input.name } },
        headers: ctx.headers,
      });
    }
    if (input.address !== undefined) {
      await this.campuses.updateAddress(ctx.organizationId, id, input.address);
    }
    return this.get(ctx, id);
  }

  async remove(ctx: OrgContext, id: string): Promise<{ id: string }> {
    await this.get(ctx, id);
    if (await this.campuses.hasDependents(ctx.organizationId, id)) {
      throw new ConflictException('Campus still has students or fee schedules');
    }
    await this.authService.api.removeTeam({
      body: { teamId: id, organizationId: ctx.organizationId },
      headers: ctx.headers,
    });
    return { id };
  }
}
