import { Injectable } from '@nestjs/common';
import type { ActivityPage } from '@eduvault/api-contract';
import type { OrgContext } from '../../common/auth';
import { Clock } from '../../common/clock';
import { activityAccess } from './activity-access';
import { dashboardScope } from './dashboard-scope';
import { ActivityRepository } from './activity.repository';

@Injectable()
export class ActivityService {
  constructor(
    private readonly repository: ActivityRepository,
    private readonly clock: Clock
  ) {}

  list(ctx: OrgContext, page: number): Promise<ActivityPage> {
    return this.repository.list(
      dashboardScope(ctx, this.clock),
      activityAccess(ctx.permissions, ctx.user.id),
      page
    );
  }
}
