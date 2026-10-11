import type { OrgContext } from '../../common/auth';
import { schoolToday, type Clock } from '../../common/clock';
import type { DashboardScope } from './dashboard.repository';

export const dashboardScope = (
  ctx: OrgContext,
  clock: Clock
): DashboardScope => ({
  organizationId: ctx.organizationId,
  campusScope: ctx.campusScope,
  classScope: ctx.classScope,
  today: schoolToday(ctx, clock),
});
