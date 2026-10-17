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

  @Patch('payment-rules')
  @OrganizationAuth('schoolAccount', 'update')
  updatePaymentRules(
    @Org() org: OrgContext,
    @Body(zod(routes.updatePaymentRules.body))
    body: Parameters<SchoolSettingsService['updatePaymentRules']>[1]
  ): Promise<RouteOutput<typeof routes.updatePaymentRules>> {
    return this.settings.updatePaymentRules(org, body);
  }

  @Patch('approval-rules')
  @OrganizationAuth('schoolAccount', 'update')
  updateApprovalRules(
    @Org() org: OrgContext,
    @Body(zod(routes.updateApprovalRules.body))
    body: Parameters<SchoolSettingsService['updateApprovalRules']>[1]
  ): Promise<RouteOutput<typeof routes.updateApprovalRules>> {
    return this.settings.updateApprovalRules(org, body);
  }
}
