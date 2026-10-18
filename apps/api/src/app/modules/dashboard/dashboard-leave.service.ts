import { Injectable } from '@nestjs/common';
import type { DashboardTask } from '@eduvault/api-contract';
import { isPortalOnly } from '@eduvault/policy';
import type { OrgContext } from '../../common/auth';
import { LeaveService } from '../leave/leave.service';

const SHOWN = 2;

@Injectable()
export class DashboardLeaveService {
  constructor(private readonly leave: LeaveService) {}

  async tasks(ctx: OrgContext): Promise<DashboardTask[]> {
    if (isPortalOnly(ctx.roles)) {
      return [];
    }
    const { items, count } = await this.leave.unseenDecisions(ctx);
    return count === 0
      ? []
      : [
          {
            kind: 'leaveDecided',
            count,
            items: items
              .slice(0, SHOWN)
              .map(({ type, startsOn, endsOn, status }) => ({
                type,
                startsOn,
                endsOn,
                status,
              })),
          },
        ];
  }
}
