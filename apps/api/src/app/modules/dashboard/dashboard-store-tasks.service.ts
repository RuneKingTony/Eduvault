import { Injectable } from '@nestjs/common';
import type { DashboardTask } from '@eduvault/api-contract';
import { can } from '@eduvault/policy';
import type { OrgContext } from '../../common/auth';
import { StoreReadService } from '../store/store-read.service';
import type { DashboardTaskSource } from './dashboard-task-source';

@Injectable()
export class DashboardStoreTasksService implements DashboardTaskSource {
  constructor(private readonly store: StoreReadService) {}

  async tasks(ctx: OrgContext): Promise<DashboardTask[]> {
    if (!can(ctx.permissions, 'store', 'receive')) {
      return [];
    }
    const { count, names } = await this.store.lowStockTask(ctx);
    return count === 0 ? [] : [{ kind: 'lowStock', count, names }];
  }
}
