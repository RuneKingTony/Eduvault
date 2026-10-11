import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { contract, type RouteOutput } from '@eduvault/api-contract';
import { Org, OrganizationAuth, type OrgContext } from '../../common/auth';
import { zod } from '../../common/http/zod.pipe';
import { GuardianService } from './guardian.service';

const routes = contract.guardians;

@Controller('guardians')
export class GuardianController {
  constructor(private readonly guardians: GuardianService) {}

  @Get()
  @OrganizationAuth('guardian', 'read')
  list(
    @Org() org: OrgContext,
    @Query(zod(routes.list.query))
    query: Parameters<GuardianService['list']>[1]
  ): Promise<RouteOutput<typeof routes.list>> {
    return this.guardians.list(org, query);
  }

  @Get(':id')
  @OrganizationAuth('guardian', 'read')
  get(
    @Org() org: OrgContext,
    @Param(zod(routes.get.params)) params: { id: string }
  ): Promise<RouteOutput<typeof routes.get>> {
    return this.guardians.get(org, params.id);
  }

  @Patch(':id')
  @OrganizationAuth('guardian', 'update')
  update(
    @Org() org: OrgContext,
    @Param(zod(routes.update.params)) params: { id: string },
    @Body(zod(routes.update.body))
    body: Parameters<GuardianService['update']>[2]
  ): Promise<RouteOutput<typeof routes.update>> {
    return this.guardians.update(org, params.id, body);
  }

  @Post(':id/reset-login')
  @OrganizationAuth('guardian', 'update')
  resetLogin(
    @Org() org: OrgContext,
    @Param(zod(routes.resetLogin.params)) params: { id: string }
  ): Promise<RouteOutput<typeof routes.resetLogin>> {
    return this.guardians.resetLogin(org, params.id);
  }
}
