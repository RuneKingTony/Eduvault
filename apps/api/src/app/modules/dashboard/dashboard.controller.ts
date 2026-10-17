import { Controller, Get } from '@nestjs/common';
import { contract, type RouteOutput } from '@eduvault/api-contract';
import { Org, OrganizationAuth, type OrgContext } from '../../common/auth';
import { StoreReadService } from '../store/store-read.service';
import { DashboardMoneyService } from './dashboard-money.service';
import { DashboardService } from './dashboard.service';
import { DashboardTasksService } from './dashboard-tasks.service';

type Routes = typeof contract.dashboard;

@Controller('dashboard')
export class DashboardController {
  constructor(
    private readonly dashboard: DashboardService,
    private readonly tasksService: DashboardTasksService,
    private readonly moneySummary: DashboardMoneyService,
    private readonly storeRead: StoreReadService
  ) {}

  @Get('tasks')
  @OrganizationAuth()
  tasks(@Org() org: OrgContext): Promise<RouteOutput<Routes['tasks']>> {
    return this.tasksService.tasks(org);
  }

  @Get('my-classes')
  @OrganizationAuth('class', 'read')
  myClasses(@Org() org: OrgContext): Promise<RouteOutput<Routes['myClasses']>> {
    return this.dashboard.myClasses(org);
  }

  @Get('money')
  @OrganizationAuth('moneyAccount', 'read')
  money(@Org() org: OrgContext): Promise<RouteOutput<Routes['money']>> {
    return this.moneySummary.summary(org);
  }

  @Get('charged')
  @OrganizationAuth('invoice', 'read')
  charged(@Org() org: OrgContext): Promise<RouteOutput<Routes['charged']>> {
    return this.moneySummary.charged(org);
  }

  @Get('store')
  @OrganizationAuth('store', 'read')
  store(@Org() org: OrgContext): Promise<RouteOutput<Routes['store']>> {
    return this.storeRead.dashboardStore(org);
  }
}
