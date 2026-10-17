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

describe('taskRow charges', () => {
  it('names the unsent round and opens it', () => {
    expect(
      taskRow({
        kind: 'unsentRound',
        runId: 'r1',
        number: 'BR-2026-0002',
        termName: 'Second term, 2026/2027',
        count: 1,
      })
    ).toEqual({
      key: 'unsentRound-r1',
      kind: 'unsentRound',
      tone: 'default',
      title: 'Charges prepared for Second term, 2026/2027, not sent yet',
      subline: 'BR-2026-0002 · 1 charge',
      action: {
        label: 'Check and send',
        target: { to: '/finance/billing/$runId', params: { runId: 'r1' } },
      },
      extra: null,
    });
  });

  it('counts the students not charged and opens the prepare sheet', () => {
    const row = taskRow({
      kind: 'notCharged',
      count: 8,
      termId: 't2',
      termName: 'Second term',
      students: [person(1), person(2), person(3), person(4), person(5)],
    });
    expect(row).toMatchObject({
      key: 'notCharged',
      title: '8 students not charged for Second term yet',
      subline:
        'Student 1, Student 2, Student 3, Student 4, Student 5 and 3 more',
      action: {
        label: 'Charge students',
        target: { to: '/finance/billing', search: { prepare: 1 } },
      },
    });
    expect(
      taskRow({
        kind: 'notCharged',
        count: 1,
        termId: 't2',
        termName: 'Second term',
        students: [person(1)],
      }).title
    ).toBe('1 student not charged for Second term yet');
  });

  it('counts the requests waiting for the viewer and names the first two', () => {
    const row = taskRow({
      kind: 'approvalsWaiting',
      count: 3,
      items: [
        {
          label: 'Cancel a payment',
          details: 'RCT-2026-00098 from Mrs Danjuma: Wrong child',
        },
        { label: 'Cancel a balance', details: 'Bola Johnson: Family moved' },
      ],
    });
    expect(row).toMatchObject({
      tone: 'default',
      title: '3 requests waiting for your approval',
      subline:
        'Cancel a payment: RCT-2026-00098 from Mrs Danjuma: Wrong child · Cancel a balance: Bola Johnson: Family moved',
      action: { label: 'Review', target: { to: '/approvals' } },
      extra: null,
    });
  });

  it('names a waiting leave request as "Leave: {details}"', () => {
    const row = taskRow({
      kind: 'approvalsWaiting',
      count: 2,
      items: [
        {
          label: 'Leave',
          details:
            'Ayo Bassey · Sick leave · 12 Oct 2026 – 13 Oct 2026. Malaria',
        },
        {
          label: 'Leave',
          details: 'Emeka Obi · Personal leave · 20 Oct 2026. Family',
        },
      ],
    });
    expect(row).toMatchObject({
      title: '2 requests waiting for your approval',
      subline:
        'Leave: Ayo Bassey · Sick leave · 12 Oct 2026 – 13 Oct 2026. Malaria · Leave: Emeka Obi · Personal leave · 20 Oct 2026. Family',
      action: { label: 'Review', target: { to: '/approvals' } },
    });
  });

  it('says "1 request" for a single waiting request', () => {
    const row = taskRow({
      kind: 'approvalsWaiting',
      count: 1,
      items: [{ label: 'Refund', details: 'David Eze: Overpaid' }],
    });
    expect(row.title).toBe('1 request waiting for your approval');
  });
});

describe('taskRow low stock', () => {
  it('counts the items, lists the first three and opens the Store', () => {
    expect(
      taskRow({
        kind: 'lowStock',
        count: 5,
        names: ['School tie', 'Pinafore, Size 16', 'School shirt, Size 14'],
      })
    ).toEqual({
      key: 'lowStock',
      kind: 'lowStock',
      tone: 'default',
      title: '5 store items running low',
      subline:
        'School tie, Pinafore, Size 16, School shirt, Size 14 and 2 more',
      action: { label: 'Store', target: { to: '/finance/store' } },
      extra: null,
    });
  });

  it('uses the singular for one item and no "more" when the sample is whole', () => {
    const row = taskRow({ kind: 'lowStock', count: 1, names: ['School tie'] });
    expect(row.title).toBe('1 store item running low');
    expect(row.subline).toBe('School tie');
  });
});
