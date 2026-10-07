import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuthService } from '@thallesp/nestjs-better-auth';
import type { Campus } from '@eduvault/api-contract';
import type { AppAuth, OrgContext } from '../../common/auth';
import { canSeeCampus } from '../../common/campus-scope';
import { KYSELY_TOKEN, type Database } from '../../common/db/database.module';
import { iso } from '../../common/rows';

interface CreateInput {
  name: string;
  address?: string | null | undefined;
}

@Injectable()
export class CampusService {
  constructor(
    @Inject(KYSELY_TOKEN) private readonly db: Database,
    private readonly authService: AuthService<AppAuth>
  ) {}

  private select(organizationId: string) {
    return this.db
      .selectFrom('campus')
      .innerJoin('team', 'team.id', 'campus.team_id')
      .where('campus.organization_id', '=', organizationId)
      .select([
        'campus.team_id',
        'campus.organization_id',
        'campus.address',
        'campus.created_at',
        'team.name',
      ]);
  }

  private toCampus(row: {
    team_id: string;
    organization_id: string;
    address: string | null;
    created_at: Date | string;
    name: string;
  }): Campus {
    return {
      id: row.team_id,
      organizationId: row.organization_id,
      name: row.name,
      address: row.address,
      createdAt: iso(row.created_at),
    };
  }

  async list(ctx: OrgContext): Promise<Campus[]> {
    const rows = await this.select(ctx.organizationId)
      .where((eb) =>
        ctx.campusScope === 'all'
          ? eb.val(true)
          : ctx.campusScope.length === 0
            ? eb.val(false)
            : eb('campus.team_id', 'in', ctx.campusScope)
      )
      .orderBy('team.name')
      .orderBy('campus.team_id')
      .execute();
    return rows.map((row) => this.toCampus(row));
  }

  async get(ctx: OrgContext, id: string): Promise<Campus> {
    if (!canSeeCampus(ctx.campusScope, id)) {
      throw new NotFoundException('Campus not found');
    }
    const row = await this.select(ctx.organizationId)
      .where('campus.team_id', '=', id)
      .executeTakeFirst();
    if (!row) throw new NotFoundException('Campus not found');
    return this.toCampus(row);
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
      await this.db
        .insertInto('campus')
        .values({
          team_id: team.id,
          organization_id: ctx.organizationId,
          address: input.address ?? null,
        })
        .execute();
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
      await this.db
        .updateTable('campus')
        .set({ address: input.address, updated_at: new Date() })
        .where('team_id', '=', id)
        .where('organization_id', '=', ctx.organizationId)
        .execute();
    }
    return this.get(ctx, id);
  }

  async remove(ctx: OrgContext, id: string): Promise<{ id: string }> {
    await this.get(ctx, id);
    const [students, fees] = await Promise.all([
      this.db
        .selectFrom('student')
        .select('id')
        .where('campus_id', '=', id)
        .executeTakeFirst(),
      this.db
        .selectFrom('fee_schedule')
        .select('id')
        .where('campus_id', '=', id)
        .executeTakeFirst(),
    ]);
    if (students || fees) {
      throw new ConflictException('Campus still has students or fee schedules');
    }
    await this.authService.api.removeTeam({
      body: { teamId: id, organizationId: ctx.organizationId },
      headers: ctx.headers,
    });
    return { id };
  }
}
