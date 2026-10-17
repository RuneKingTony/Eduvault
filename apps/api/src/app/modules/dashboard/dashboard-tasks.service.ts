import { Inject, Injectable } from '@nestjs/common';
import type { DashboardTask } from '@eduvault/api-contract';
import type { OrgContext } from '../../common/auth';
import {
  DASHBOARD_TASK_SOURCES,
  orderTasks,
  type DashboardTaskSource,
} from './dashboard-task-source';

@Injectable()
export class DashboardTasksService {
  constructor(
    @Inject(DASHBOARD_TASK_SOURCES)
    private readonly sources: readonly DashboardTaskSource[]
  ) {}

  async tasks(ctx: OrgContext): Promise<DashboardTask[]> {
    const lists = await Promise.all(
      this.sources.map((source) => source.tasks(ctx))
    );
    return orderTasks(lists.flat());
  }
}
