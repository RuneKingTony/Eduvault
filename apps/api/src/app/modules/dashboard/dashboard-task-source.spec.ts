import type { DashboardTask } from '@eduvault/api-contract';
import { orderTasks } from './dashboard-task-source';

const unsentRound = (runId: string): DashboardTask => ({
  kind: 'unsentRound',
  runId,
  number: runId,
  termName: 'Second term',
  count: 1,
});
const noRole = (memberId: string): DashboardTask => ({
  kind: 'noRole',
  memberId,
  name: memberId,
});

const shuffled: DashboardTask[] = [
  { kind: 'announcementDrafts', count: 1, titles: ['x'] },
  noRole('m-1'),
  { kind: 'noClassTeacher', count: 1, classes: [] },
  { kind: 'notInClass', count: 1, students: [], startYear: null },
  { kind: 'notSeen', count: 1, students: [] },
  { kind: 'dueLeft', count: 1, students: [] },
  {
    kind: 'notCharged',
    count: 1,
    termId: 't',
    termName: 'Second term',
    students: [],
  },
  unsentRound('r-1'),
];

describe('orderTasks', () => {
  it('puts every kind in PRD order', () => {
    expect(orderTasks(shuffled).map((task) => task.kind)).toEqual([
      'unsentRound',
      'notCharged',
      'dueLeft',
      'notSeen',
      'notInClass',
      'noClassTeacher',
      'noRole',
      'announcementDrafts',
    ]);
  });

  it('keeps the input order within a kind', () => {
    const ordered = orderTasks([
      noRole('m-1'),
      unsentRound('r-1'),
      noRole('m-2'),
      unsentRound('r-2'),
    ]);
    expect(ordered).toEqual([
      unsentRound('r-1'),
      unsentRound('r-2'),
      noRole('m-1'),
      noRole('m-2'),
    ]);
  });

  it('leaves the input untouched', () => {
    const input = [noRole('m-1'), unsentRound('r-1')];
    orderTasks(input);
    expect(input.map((task) => task.kind)).toEqual(['noRole', 'unsentRound']);
  });
});
