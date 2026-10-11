import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { contract, type RouteOutput } from '@eduvault/api-contract';
import { Org, OrganizationAuth, type OrgContext } from '../../common/auth';
import { zod } from '../../common/http/zod.pipe';
import { ClassLevelService } from './class-level.service';

const routes = contract.classLevels;

@Controller('class-levels')
export class ClassLevelsController {
  constructor(private readonly levels: ClassLevelService) {}

  @Get()
  @OrganizationAuth()
  list(@Org() org: OrgContext): Promise<RouteOutput<typeof routes.list>> {
    return this.levels.list(org);
  }

  @Post()
  @OrganizationAuth('class', 'update')
  create(
    @Org() org: OrgContext,
    @Body(zod(routes.create.body))
    body: Parameters<ClassLevelService['create']>[1]
  ): Promise<RouteOutput<typeof routes.create>> {
    return this.levels.create(org, body);
  }

  @Patch(':id')
  @OrganizationAuth('class', 'update')
  update(
    @Org() org: OrgContext,
    @Param(zod(routes.update.params)) params: { id: string },
    @Body(zod(routes.update.body))
    body: Parameters<ClassLevelService['update']>[2]
  ): Promise<RouteOutput<typeof routes.update>> {
    return this.levels.update(org, params.id, body);
  }
}
