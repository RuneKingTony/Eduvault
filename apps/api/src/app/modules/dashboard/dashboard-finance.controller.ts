import { Controller, Get } from '@nestjs/common';
import { contract, type RouteOutput } from '@eduvault/api-contract';
import { FINANCE_READ_GATE } from '@eduvault/policy';
import { Org, OrganizationAuth, type OrgContext } from '../../common/auth';
import { StudentAccountService } from '../student-account/student-account.service';
import { DashboardRollService } from './dashboard-roll.service';

type Routes = typeof contract.dashboard;

@Controller('dashboard')
export class DashboardFinanceController {
  constructor(
    private readonly rolls: DashboardRollService,
    private readonly accounts: StudentAccountService
  ) {}

  @Get('roll')
  @OrganizationAuth('student', 'read')
  roll(@Org() org: OrgContext): Promise<RouteOutput<Routes['roll']>> {
    return this.rolls.roll(org);
  }

  @Get('finance')
  @OrganizationAuth(FINANCE_READ_GATE)
  finance(@Org() org: OrgContext): Promise<RouteOutput<Routes['finance']>> {
    return this.accounts.dashboardFinance(org);
  }
}
