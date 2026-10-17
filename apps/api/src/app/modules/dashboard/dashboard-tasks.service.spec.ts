import type { DashboardTask } from '@eduvault/api-contract';
import type { OrgContext } from '../../common/auth';
import type { DashboardTaskSource } from './dashboard-task-source';
import { DashboardTasksService } from './dashboard-tasks.service';

const ctx = { organizationId: 'school-a' } as OrgContext;

const fake = (tasks: DashboardTask[]): DashboardTaskSource => ({
  tasks: vi.fn().mockResolvedValue(tasks),
});

const school: DashboardTask[] = [
  { kind: 'announcementDrafts', count: 1, titles: ['x'] },
  { kind: 'dueLeft', count: 2, students: [] },
  { kind: 'noRole', memberId: 'm', name: 'Kemi' },
];
const money: DashboardTask[] = [
  { kind: 'unsentRound', runId: 'r', number: 'BR', termName: 't', count: 1 },
  {
    kind: 'notCharged',
    count: 1,
    termId: 't',
    termName: 'Second term',
    students: [],
  },
];

const kindsFrom = async (...sources: DashboardTaskSource[]) =>
  (await new DashboardTasksService(sources).tasks(ctx)).map(
    (task) => task.kind
  );

describe('DashboardTasksService.tasks', () => {
  it('gives the same result whichever order the sources are given in', async () => {
    const forward = await kindsFrom(fake(school), fake(money));
    const swapped = await kindsFrom(fake(money), fake(school));
    expect(swapped).toEqual(forward);
  });

  it('puts the charge kinds before dueLeft and noRole before announcementDrafts', async () => {
    expect(await kindsFrom(fake(school), fake(money))).toEqual([
      'unsentRound',
      'notCharged',
      'dueLeft',
      'noRole',
      'announcementDrafts',
    ]);
  });

  it('passes the context to every source', async () => {
    const source = fake(money);
    await new DashboardTasksService([source]).tasks(ctx);
    expect(source.tasks).toHaveBeenCalledWith(ctx);
  });

  it('gives nothing with no sources or only empty ones', async () => {
    expect(await kindsFrom()).toEqual([]);
    expect(await kindsFrom(fake([]), fake([]))).toEqual([]);
  });
});
