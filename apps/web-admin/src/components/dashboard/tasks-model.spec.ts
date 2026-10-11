import type { DashboardTask } from '@eduvault/api-contract';
import { taskRow } from './tasks-model';

const person = (n: number) => ({ id: `s${n}`, name: `Student ${n}` });

describe('taskRow', () => {
  it('makes a due-to-be-Left row danger-toned and opens the Inactive tab', () => {
    const row = taskRow({ kind: 'dueLeft', count: 1, students: [person(1)] });
    expect(row).toMatchObject({
      tone: 'danger',
      title: '1 student due to be marked Left',
      subline: 'Away for over a term: Student 1',
      action: {
        label: 'Review',
        target: { to: '/students', search: { tab: 'inactive' } },
      },
      extra: null,
    });
  });

  it('opens the one student, or Students for several', () => {
    const one: DashboardTask = {
      kind: 'notInClass',
      count: 1,
      students: [person(1)],
      startYear: null,
    };
    const several: DashboardTask = {
      kind: 'notInClass',
      count: 2,
      students: [person(1), person(2)],
      startYear: null,
    };
    expect(taskRow(one).action.target).toEqual({
      to: '/students/$studentId',
      params: { studentId: 's1' },
    });
    expect(taskRow(several).action.target).toEqual({ to: '/students' });
  });

  it('adds the Start action with the year name', () => {
    const row = taskRow({
      kind: 'notInClass',
      count: 2,
      students: [person(1), person(2)],
      startYear: { name: '2027/2028' },
    });
    expect(row.extra).toEqual({
      label: 'Start 2027/2028',
      target: { to: '/students', search: { dialog: 'start-year' } },
    });
  });

  it('says how many the sample leaves out', () => {
    const row = taskRow({
      kind: 'noClassTeacher',
      count: 8,
      classes: [1, 2, 3, 4, 5].map((n) => ({ id: `c${n}`, name: `JSS ${n}` })),
    });
    expect(row.title).toBe('8 classes without a class teacher');
    expect(row.subline).toBe('JSS 1, JSS 2, JSS 3, JSS 4, JSS 5 and 3 more');
    expect(row.action.target).toEqual({ to: '/classes' });
  });

  it('opens the one class and keys a role-less member by id', () => {
    const one = taskRow({
      kind: 'noClassTeacher',
      count: 1,
      classes: [{ id: 'c1', name: 'JSS 1 Gold' }],
    });
    expect(one.title).toBe('1 class without a class teacher');
    expect(one.action.target).toEqual({
      to: '/classes/$classId',
      params: { classId: 'c1' },
    });
    expect(
      taskRow({ kind: 'noRole', memberId: 'm9', name: 'Ada Obi' }).key
    ).toBe('noRole-m9');
  });
});

describe('taskRow announcement drafts', () => {
  it('counts the drafts, lists their titles and opens Announcements', () => {
    const row = taskRow({
      kind: 'announcementDrafts',
      count: 2,
      titles: ['PTA meeting', 'Sports day'],
    });
    expect(row).toMatchObject({
      key: 'announcementDrafts',
      tone: 'default',
      title: '2 announcement drafts not published',
      subline: 'PTA meeting, Sports day',
      action: { label: 'Open', target: { to: '/announcements' } },
      extra: null,
    });
  });

  it('uses the singular for one draft and says how many the sample leaves out', () => {
    expect(
      taskRow({ kind: 'announcementDrafts', count: 1, titles: ['PTA'] }).title
    ).toBe('1 announcement draft not published');
    expect(
      taskRow({
        kind: 'announcementDrafts',
        count: 8,
        titles: ['A', 'B', 'C', 'D', 'E'],
      }).subline
    ).toBe('A, B, C, D, E and 3 more');
  });
});
