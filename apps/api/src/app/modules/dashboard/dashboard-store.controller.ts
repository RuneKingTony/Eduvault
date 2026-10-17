import { Controller, Get } from '@nestjs/common';
import { contract, type RouteOutput } from '@eduvault/api-contract';
import { Org, OrganizationAuth, type OrgContext } from '../../common/auth';
import { StoreReadService } from '../store/store-read.service';

type Routes = typeof contract.dashboard;

@Controller('dashboard')
export class DashboardStoreController {
  constructor(private readonly store: StoreReadService) {}

  @Get('store')
  @OrganizationAuth('store', 'read')
  summary(@Org() org: OrgContext): Promise<RouteOutput<Routes['store']>> {
    return this.store.dashboardStore(org);
  }
}
