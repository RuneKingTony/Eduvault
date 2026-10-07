import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { contract, type RouteOutput } from '@eduvault/api-contract';
import { Org, OrganizationAuth, type OrgContext } from '../../common/auth';
import { zod } from '../../common/http/zod.pipe';
import { CampusService } from './campus.service';

const routes = contract.campuses;

@Controller('campuses')
export class CampusController {
  constructor(private readonly campuses: CampusService) {}

  @Get()
  @OrganizationAuth()
  list(@Org() org: OrgContext): Promise<RouteOutput<typeof routes.list>> {
    return this.campuses.list(org);
  }

  @Get(':id')
  @OrganizationAuth()
  get(
    @Org() org: OrgContext,
    @Param(zod(routes.get.params)) params: { id: string }
  ): Promise<RouteOutput<typeof routes.get>> {
    return this.campuses.get(org, params.id);
  }

  @Post()
  @OrganizationAuth('team', 'create')
  create(
    @Org() org: OrgContext,
    @Body(zod(routes.create.body)) body: Parameters<CampusService['create']>[1]
  ): Promise<RouteOutput<typeof routes.create>> {
    return this.campuses.create(org, body);
  }

  @Patch(':id')
  @OrganizationAuth('team', 'update')
  update(
    @Org() org: OrgContext,
    @Param(zod(routes.update.params)) params: { id: string },
    @Body(zod(routes.update.body)) body: Parameters<CampusService['update']>[2]
  ): Promise<RouteOutput<typeof routes.update>> {
    return this.campuses.update(org, params.id, body);
  }

  @Delete(':id')
  @OrganizationAuth('team', 'delete')
  remove(
    @Org() org: OrgContext,
    @Param(zod(routes.remove.params)) params: { id: string }
  ): Promise<RouteOutput<typeof routes.remove>> {
    return this.campuses.remove(org, params.id);
  }
}
