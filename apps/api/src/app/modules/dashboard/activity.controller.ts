import { Controller, Get, Query } from '@nestjs/common';
import { contract, type RouteOutput } from '@eduvault/api-contract';
import { Org, OrganizationAuth, type OrgContext } from '../../common/auth';
import { zod } from '../../common/http/zod.pipe';
import { ActivityService } from './activity.service';

const routes = contract.activity;

@Controller('activity')
export class ActivityController {
  constructor(private readonly activity: ActivityService) {}

  @Get()
  @OrganizationAuth()
  list(
    @Org() org: OrgContext,
    @Query(zod(routes.list.query)) query: { page: number }
  ): Promise<RouteOutput<typeof routes.list>> {
    return this.activity.list(org, query.page);
  }
}
