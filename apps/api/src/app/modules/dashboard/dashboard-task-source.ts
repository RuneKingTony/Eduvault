import type { DashboardTask } from '@eduvault/api-contract';
import type { OrgContext } from '../../common/auth';

export const DASHBOARD_TASK_SOURCES = 'DASHBOARD_TASK_SOURCES';

export interface DashboardTaskSource {
  tasks(ctx: OrgContext): Promise<DashboardTask[]>;
}

const TASK_ORDER: Record<DashboardTask['kind'], number> = {
  unsentRound: 1,
  notCharged: 2,
  dueLeft: 3,
  notSeen: 4,
  notInClass: 5,
  noClassTeacher: 6,
  lowStock: 7,
  noRole: 8,
  announcementDrafts: 9,
};

export function orderTasks(tasks: DashboardTask[]): DashboardTask[] {
  return tasks.toSorted((a, b) => TASK_ORDER[a.kind] - TASK_ORDER[b.kind]);
}
