import type { DashboardTask } from '@eduvault/api-contract';
import { countOf, fmtDate } from '@eduvault/shared';
import type { TaskTarget } from './target-link';

export interface TaskAction {
  label: string;
  target: TaskTarget;
}

export interface TaskRow {
  key: string;
  kind: DashboardTask['kind'];
  tone: 'danger' | 'default';
  title: string;
  subline: string;
  action: TaskAction;
  extra: TaskAction | null;
}

const listed = (names: readonly string[], count: number): string => {
  const more = count - names.length;
  const text = names.join(', ');
  return more > 0 ? `${text} and ${more} more` : text;
};

const students = (count: number) => countOf(count, 'student', 'students');

const onlyOne = (
  items: readonly { id: string }[],
  count: number
): string | null => (count === 1 ? (items[0]?.id ?? null) : null);

const studentTarget = (id: string | null): TaskTarget =>
  id === null
    ? { to: '/students' }
    : { to: '/students/$studentId', params: { studentId: id } };

type Counted<K extends DashboardTask['kind']> = Extract<
  DashboardTask,
  { kind: K }
>;

const dueLeft = (task: Counted<'dueLeft'>): TaskRow => ({
  key: task.kind,
  kind: task.kind,
  tone: 'danger',
  title: `${students(task.count)} due to be marked Left`,
  subline: `Away for over a term: ${listed(
    task.students.map((student) => student.name),
    task.count
  )}`,
  action: {
    label: 'Review',
    target: { to: '/students', search: { tab: 'inactive' } },
  },
  extra: null,
});

const notSeen = (task: Counted<'notSeen'>): TaskRow => ({
  key: task.kind,
  kind: task.kind,
  tone: 'default',
  title: `${students(task.count)} not seen in school recently`,
  subline: listed(
    task.students.map(
      (student) => `${student.name} (since ${fmtDate(student.notSeenSince)})`
    ),
    task.count
  ),
  action: {
    label: 'Open',
    target: studentTarget(onlyOne(task.students, task.count)),
  },
  extra: null,
});

const notInClass = (task: Counted<'notInClass'>): TaskRow => ({
  key: task.kind,
  kind: task.kind,
  tone: 'default',
  title: `${students(task.count)} not in a class`,
  subline: listed(
    task.students.map((student) => student.name),
    task.count
  ),
  action: {
    label: 'Open',
    target: studentTarget(onlyOne(task.students, task.count)),
  },
  extra:
    task.startYear === null
      ? null
      : {
          label: `Start ${task.startYear.name}`,
          target: { to: '/students', search: { dialog: 'start-year' } },
        },
});

const noClassTeacher = (task: Counted<'noClassTeacher'>): TaskRow => {
  const only = onlyOne(task.classes, task.count);
  return {
    key: task.kind,
    kind: task.kind,
    tone: 'default',
    title: `${countOf(task.count, 'class', 'classes')} without a class teacher`,
    subline: listed(
      task.classes.map((row) => row.name),
      task.count
    ),
    action: {
      label: 'Assign',
      target:
        only === null
          ? { to: '/classes' }
          : { to: '/classes/$classId', params: { classId: only } },
    },
    extra: null,
  };
};

const announcementDrafts = (task: Counted<'announcementDrafts'>): TaskRow => ({
  key: task.kind,
  kind: task.kind,
  tone: 'default',
  title: `${countOf(task.count, 'announcement draft', 'announcement drafts')} not published`,
  subline: listed(task.titles, task.count),
  action: { label: 'Open', target: { to: '/announcements' } },
  extra: null,
});

const unsentRound = (task: Counted<'unsentRound'>): TaskRow => ({
  key: `${task.kind}-${task.runId}`,
  kind: task.kind,
  tone: 'default',
  title: `Charges prepared for ${task.termName}, not sent yet`,
  subline: `${task.number} · ${countOf(task.count, 'charge', 'charges')}`,
  action: {
    label: 'Check and send',
    target: { to: '/finance/billing/$runId', params: { runId: task.runId } },
  },
  extra: null,
});

const notCharged = (task: Counted<'notCharged'>): TaskRow => ({
  key: task.kind,
  kind: task.kind,
  tone: 'default',
  title: `${students(task.count)} not charged for ${task.termName} yet`,
  subline: listed(
    task.students.map((student) => student.name),
    task.count
  ),
  action: {
    label: 'Charge students',
    target: { to: '/finance/billing', search: { prepare: 1 } },
  },
  extra: null,
});

const lowStock = (task: Counted<'lowStock'>): TaskRow => ({
  key: task.kind,
  kind: task.kind,
  tone: 'default',
  title: `${countOf(task.count, 'store item', 'store items')} running low`,
  subline: listed(task.names, task.count),
  action: { label: 'Store', target: { to: '/finance/store' } },
  extra: null,
});

const approvalsWaiting = (task: Counted<'approvalsWaiting'>): TaskRow => ({
  key: task.kind,
  kind: task.kind,
  tone: 'default',
  title: `${countOf(task.count, 'request', 'requests')} waiting for your approval`,
  subline: task.items
    .map((item) => `${item.label}: ${item.details}`)
    .join(' · '),
  action: { label: 'Review', target: { to: '/approvals' } },
  extra: null,
});

const noRole = (task: Counted<'noRole'>): TaskRow => ({
  key: `${task.kind}-${task.memberId}`,
  kind: task.kind,
  tone: 'default',
  title: `${task.name} has no role yet`,
  subline:
    'They can sign in but can’t see anything until you give them a role.',
  action: {
    label: 'Give a role',
    target: { to: '/members/$memberId', params: { memberId: task.memberId } },
  },
  extra: null,
});

export function taskRow(task: DashboardTask): TaskRow {
  switch (task.kind) {
    case 'dueLeft': {
      return dueLeft(task);
    }
    case 'notSeen': {
      return notSeen(task);
    }
    case 'notInClass': {
      return notInClass(task);
    }
    case 'noClassTeacher': {
      return noClassTeacher(task);
    }
    case 'announcementDrafts': {
      return announcementDrafts(task);
    }
    case 'unsentRound': {
      return unsentRound(task);
    }
    case 'notCharged': {
      return notCharged(task);
    }
    case 'lowStock': {
      return lowStock(task);
    }
    case 'approvalsWaiting': {
      return approvalsWaiting(task);
    }
    case 'noRole': {
      return noRole(task);
    }
  }
}
