import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import {
  contract,
  type RouteBody,
  type RouteOutput,
} from '@eduvault/api-contract';
import { Org, OrganizationAuth, type OrgContext } from '../../common/auth';
import { zod } from '../../common/http/zod.pipe';
import { RolesService } from './roles.service';

const routes = contract.roles;

@Controller('roles')
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  @Get()
  @OrganizationAuth('ac', 'read')
  list(@Org() org: OrgContext): Promise<RouteOutput<typeof routes.list>> {
    return this.roles.list(org);
  }

  @Get(':slug')
  @OrganizationAuth('ac', 'read')
  get(
    @Org() org: OrgContext,
    @Param(zod(routes.get.params)) params: { slug: string }
  ): Promise<RouteOutput<typeof routes.get>> {
    return this.roles.get(org, params.slug);
  }

  @Post()
  @OrganizationAuth('ac', 'create')
  create(
    @Org() org: OrgContext,
    @Body(zod(routes.create.body)) body: RouteBody<typeof routes.create>
  ): Promise<RouteOutput<typeof routes.create>> {
    return this.roles.create(org, body);
  }

  @Patch(':slug')
  @OrganizationAuth('ac', 'update')
  update(
    @Org() org: OrgContext,
    @Param(zod(routes.update.params)) params: { slug: string },
    @Body(zod(routes.update.body)) body: RouteBody<typeof routes.update>
  ): Promise<RouteOutput<typeof routes.update>> {
    return this.roles.update(org, params.slug, body);
  }

  @Delete(':slug')
  @OrganizationAuth('ac', 'delete')
  remove(
    @Org() org: OrgContext,
    @Param(zod(routes.remove.params)) params: { slug: string }
  ): Promise<RouteOutput<typeof routes.remove>> {
    return this.roles.remove(org, params.slug);
  }
}
