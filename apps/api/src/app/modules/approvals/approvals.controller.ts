import { Controller, Get, Query } from '@nestjs/common';
import { contract, type RouteOutput } from '@eduvault/api-contract';
import { Org, OrganizationAuth, type OrgContext } from '../../common/auth';
import { zod } from '../../common/http/zod.pipe';
import { ApprovalsService } from './approvals.service';

const routes = contract.approvals;

@Controller('approvals')
export class ApprovalsController {
  constructor(private readonly approvals: ApprovalsService) {}

  @Get()
  @OrganizationAuth()
  list(
    @Org() org: OrgContext,
    @Query(zod(routes.list.query))
    query: Parameters<ApprovalsService['list']>[1]
  ): Promise<RouteOutput<typeof routes.list>> {
    return this.approvals.list(org, query);
  }

  @Get('summary')
  @OrganizationAuth()
  summary(@Org() org: OrgContext): Promise<RouteOutput<typeof routes.summary>> {
    return this.approvals.summary(org);
  }
}
