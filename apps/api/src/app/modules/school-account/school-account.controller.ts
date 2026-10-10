import { Body, Controller, Delete, Get, Patch, Put } from '@nestjs/common';
import { contract, type RouteOutput } from '@eduvault/api-contract';
import { Org, OrganizationAuth, type OrgContext } from '../../common/auth';
import { zod } from '../../common/http/zod.pipe';
import { SchoolAccountService } from './school-account.service';

const routes = contract.schoolAccount;

@Controller('school-account')
export class SchoolAccountController {
  constructor(private readonly accounts: SchoolAccountService) {}

  @Get()
  @OrganizationAuth()
  get(@Org() org: OrgContext): Promise<RouteOutput<typeof routes.get>> {
    return this.accounts.get(org);
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

  @Put('logo')
  @OrganizationAuth('schoolAccount', 'update')
  setLogo(
    @Org() org: OrgContext,
    @Body(zod(routes.setLogo.body)) body: { fileId: string }
  ): Promise<RouteOutput<typeof routes.setLogo>> {
    return this.accounts.setLogo(org, body.fileId);
  }

  @Delete('logo')
  @OrganizationAuth('schoolAccount', 'update')
  removeLogo(
    @Org() org: OrgContext
  ): Promise<RouteOutput<typeof routes.removeLogo>> {
    return this.accounts.removeLogo(org);
  }
}
