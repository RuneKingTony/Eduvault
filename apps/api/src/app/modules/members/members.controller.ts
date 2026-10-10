import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  contract,
  type RouteBody,
  type RouteOutput,
  type RouteQuery,
} from '@eduvault/api-contract';
import { Org, OrganizationAuth, type OrgContext } from '../../common/auth';
import { zod } from '../../common/http/zod.pipe';
import { MembersService } from './members.service';

const routes = contract.members;

@Controller('members')
export class MembersController {
  constructor(private readonly members: MembersService) {}

  @Get()
  @OrganizationAuth('member', 'read')
  list(
    @Org() org: OrgContext,
    @Query(zod(routes.list.query)) query: RouteQuery<typeof routes.list>
  ): Promise<RouteOutput<typeof routes.list>> {
    return this.members.list(org, query);
  }

  @Get('roles')
  @OrganizationAuth('member', 'read')
  roles(@Org() org: OrgContext): Promise<RouteOutput<typeof routes.roles>> {
    return this.members.roles(org);
  }

  @Get(':id')
  @OrganizationAuth('member', 'read')
  get(
    @Org() org: OrgContext,
    @Param(zod(routes.get.params)) params: { id: string }
  ): Promise<RouteOutput<typeof routes.get>> {
    return this.members.get(org, params.id);
  }

  @Post()
  @OrganizationAuth('member', 'create')
  create(
    @Org() org: OrgContext,
    @Body(zod(routes.create.body)) body: RouteBody<typeof routes.create>
  ): Promise<RouteOutput<typeof routes.create>> {
    return this.members.create(org, body);
  }

  @Put(':id/roles')
  @OrganizationAuth('member', 'update')
  updateRoles(
    @Org() org: OrgContext,
    @Param(zod(routes.updateRoles.params)) params: { id: string },
    @Body(zod(routes.updateRoles.body))
    body: RouteBody<typeof routes.updateRoles>
  ): Promise<RouteOutput<typeof routes.updateRoles>> {
    return this.members.updateRoles(org, params.id, body);
  }

  @Put(':id/campuses')
  @OrganizationAuth('member', 'update')
  updateCampuses(
    @Org() org: OrgContext,
    @Param(zod(routes.updateCampuses.params)) params: { id: string },
    @Body(zod(routes.updateCampuses.body))
    body: RouteBody<typeof routes.updateCampuses>
  ): Promise<RouteOutput<typeof routes.updateCampuses>> {
    return this.members.updateCampuses(org, params.id, body);
  }

  @Post(':id/reset-password')
  @OrganizationAuth('member', 'update')
  resetPassword(
    @Org() org: OrgContext,
    @Param(zod(routes.resetPassword.params)) params: { id: string }
  ): Promise<RouteOutput<typeof routes.resetPassword>> {
    return this.members.resetPassword(org, params.id);
  }

  @Delete(':id')
  @OrganizationAuth('member', 'delete')
  remove(
    @Org() org: OrgContext,
    @Param(zod(routes.remove.params)) params: { id: string }
  ): Promise<RouteOutput<typeof routes.remove>> {
    return this.members.remove(org, params.id);
  }
}
