import { Body, Controller, Delete, Get, Patch, Post } from '@nestjs/common';
import { contract, type RouteOutput } from '@eduvault/api-contract';
import { Org, OrganizationAuth, type OrgContext } from '../../common/auth';
import { zod } from '../../common/http/zod.pipe';
import { SchoolAccountService } from './school-account.service';

const routes = contract.schoolAccount;

@Controller('school-account')
export class SchoolAccountController {
  constructor(private readonly accounts: SchoolAccountService) {}

  @Get()
  @OrganizationAuth('schoolAccount', 'read')
  get(@Org() org: OrgContext): Promise<RouteOutput<typeof routes.get>> {
    return this.accounts.get(org);
  }

  @Post()
  @OrganizationAuth('schoolAccount', 'create')
  create(
    @Org() org: OrgContext,
    @Body(zod(routes.create.body))
    body: Parameters<SchoolAccountService['create']>[1]
  ): Promise<RouteOutput<typeof routes.create>> {
    return this.accounts.create(org, body);
  }

  @Patch()
  @OrganizationAuth('schoolAccount', 'update')
  update(
    @Org() org: OrgContext,
    @Body(zod(routes.update.body))
    body: Parameters<SchoolAccountService['update']>[1]
  ): Promise<RouteOutput<typeof routes.update>> {
    return this.accounts.update(org, body);
  }

  @Delete()
  @OrganizationAuth('schoolAccount', 'delete')
  remove(@Org() org: OrgContext): Promise<RouteOutput<typeof routes.remove>> {
    return this.accounts.remove(org);
  }
}
