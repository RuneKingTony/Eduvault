import { Injectable } from '@nestjs/common';
import type { DashboardCharged, DashboardTask } from '@eduvault/api-contract';
import type { OrgContext } from '../../common/auth';
import { DashboardChargesService } from './dashboard-charges.service';
import { DashboardService } from './dashboard.service';

@Injectable()
export class DashboardTasksService {
  constructor(
    private readonly dashboard: DashboardService,
    private readonly charges: DashboardChargesService
  ) {}

  async tasks(ctx: OrgContext): Promise<DashboardTask[]> {
    const [school, money] = await Promise.all([
      this.dashboard.tasks(ctx),
      this.charges.tasks(ctx),
    ]);
    const roles = school.filter((task) => task.kind === 'noRole');
    return [
      ...school.filter((task) => task.kind !== 'noRole'),
      ...money,
      ...roles,
    ];
  }

  charged(ctx: OrgContext): Promise<DashboardCharged | null> {
    return this.charges.charged(ctx);
  }
}
