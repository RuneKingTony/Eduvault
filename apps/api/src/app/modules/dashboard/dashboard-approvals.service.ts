import { Injectable } from '@nestjs/common';
import type { DashboardTask } from '@eduvault/api-contract';
import { can } from '@eduvault/policy';
import type { OrgContext } from '../../common/auth';
import { ApprovalsService } from '../approvals/approvals.service';

const SHOWN = 2;

@Injectable()
export class DashboardApprovalsService {
  constructor(private readonly approvals: ApprovalsService) {}

  async tasks(ctx: OrgContext): Promise<DashboardTask[]> {
    if (
      !can(ctx.permissions, 'adjustment', 'approve') &&
      !can(ctx.permissions, 'leave', 'approve')
    ) {
      return [];
    }
    const { waitingForMe, preview } = await this.approvals.summary(ctx);
    return waitingForMe === 0
      ? []
      : [
          {
            kind: 'approvalsWaiting',
            count: waitingForMe,
            items: preview
              .slice(0, SHOWN)
              .map(({ label, details }) => ({ label, details })),
          },
        ];
  }
}
