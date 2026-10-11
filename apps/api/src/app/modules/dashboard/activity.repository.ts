import type { ActivityPage } from '@eduvault/api-contract';
import type { ActivityAccess } from './activity-access';
import type { DashboardScope } from './dashboard.repository';

export abstract class ActivityRepository {
  abstract list(
    scope: DashboardScope,
    access: ActivityAccess,
    page: number
  ): Promise<ActivityPage>;
}
