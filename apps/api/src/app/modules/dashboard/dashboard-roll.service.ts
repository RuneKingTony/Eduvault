import { Injectable } from '@nestjs/common';
import type { DashboardRoll } from '@eduvault/api-contract';
import { FINANCE_READ_GATE, canAny } from '@eduvault/policy';
import type { OrgContext } from '../../common/auth';
import { StudentAccountService } from '../student-account/student-account.service';
import { DashboardService } from './dashboard.service';

@Injectable()
export class DashboardRollService {
  constructor(
    private readonly accounts: StudentAccountService,
    private readonly dashboard: DashboardService
  ) {}

  async roll(ctx: OrgContext): Promise<DashboardRoll> {
    if (!canAny(ctx.permissions, FINANCE_READ_GATE)) {
      return this.dashboard.roll(ctx);
    }
    const [roll, { currency, owed }] = await Promise.all([
      this.dashboard.roll(ctx),
      this.accounts.owedByLife(ctx),
    ]);
    return {
      ...roll,
      currency,
      owedMinor: owed,
      formerOwedMinor: owed.left + owed.graduated,
    };
  }
}
