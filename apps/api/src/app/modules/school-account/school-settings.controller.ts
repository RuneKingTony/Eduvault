import { Body, Controller, Get, Patch } from '@nestjs/common';
import { contract, type RouteOutput } from '@eduvault/api-contract';
import { Org, OrganizationAuth, type OrgContext } from '../../common/auth';
import { zod } from '../../common/http/zod.pipe';
import { SchoolSettingsService } from './school-settings.service';

const routes = contract.schoolSettings;

@Controller('school-settings')
export class SchoolSettingsController {
  constructor(private readonly settings: SchoolSettingsService) {}

  @Get()
  @OrganizationAuth()
  get(@Org() org: OrgContext): Promise<RouteOutput<typeof routes.get>> {
    return this.settings.get(org);
  }

  @Patch()
  @OrganizationAuth('schoolAccount', 'update')
  update(
    @Org() org: OrgContext,
    @Body(zod(routes.update.body))
    body: Parameters<SchoolSettingsService['update']>[1]
  ): Promise<RouteOutput<typeof routes.update>> {
    return this.settings.update(org, body);
  }
}
