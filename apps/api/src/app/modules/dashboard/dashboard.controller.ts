import { Controller, Get } from '@nestjs/common';
import { contract, type RouteOutput } from '@eduvault/api-contract';
import { Org, OrganizationAuth, type OrgContext } from '../../common/auth';
import { DashboardService } from './dashboard.service';

type Routes = typeof contract.dashboard;

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('tasks')
  @OrganizationAuth()
  tasks(@Org() org: OrgContext): Promise<RouteOutput<Routes['tasks']>> {
    return this.dashboard.tasks(org);
  }

  @Get('roll')
  @OrganizationAuth('student', 'read')
  roll(@Org() org: OrgContext): Promise<RouteOutput<Routes['roll']>> {
    return this.dashboard.roll(org);
  }

  @Get('my-classes')
  @OrganizationAuth('class', 'read')
  myClasses(@Org() org: OrgContext): Promise<RouteOutput<Routes['myClasses']>> {
    return this.dashboard.myClasses(org);
  }
}
