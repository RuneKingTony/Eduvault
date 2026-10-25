import type { AnnouncementTag, LeavingReason } from '@eduvault/api-contract';
import { addDays, isWeekend } from '@eduvault/shared';
import { midTermDays, TERM_STARTED_DAYS_AGO, type DemoCampus } from './config';
import type { DemoTeacher, StudentNumber } from './people-plan';
import type { Random } from './prng';

export interface AnnouncementPlan {
  title: string;
  body: string;
  tag: AnnouncementTag;
  campus: DemoCampus | null;
  status: 'published' | 'draft' | 'withdrawn';
  pinned: boolean;
  viaDraft: boolean;
  daysAgo: number;
}

const announcement = (
  daysAgo: number,
  rest: Omit<AnnouncementPlan, 'daysAgo' | 'pinned' | 'viaDraft'> &
    Partial<Pick<AnnouncementPlan, 'pinned' | 'viaDraft'>>
): AnnouncementPlan => ({ pinned: false, viaDraft: false, daysAgo, ...rest });

export const DEMO_ANNOUNCEMENTS: readonly AnnouncementPlan[] = [
  announcement(TERM_STARTED_DAYS_AGO, {
    title: 'Welcome back to first term',
    body: 'Classes began this week. Children must be in full uniform, and the gates close at 7:45 each morning.',
    tag: 'general',
    campus: null,
    status: 'published',
    pinned: true,
  }),
  announcement(33, {
    title: 'First-term fees are open',
    body: 'Invoices are ready. Pay at the school office, by transfer or from the family wallet before the end of the month.',
    tag: 'fees',
    campus: null,
    status: 'published',
  }),
  announcement(12, {
    title: 'Mid-term break is coming',
    body: 'School closes on the Wednesday before the break and reopens the Monday after. Collect your child on time.',
    tag: 'general',
    campus: null,
    status: 'published',
  }),
  announcement(6, {
    title: 'PTA meeting this Saturday',
    body: 'We meet in the main hall at 10am to talk about the term and the new library.',
    tag: 'event',
    campus: null,
    status: 'published',
    viaDraft: true,
  }),
  announcement(9, {
    title: 'Inter-house sports day',
    body: 'Main campus families: sports day is on Saturday at 9am. Children wear their house colours and bring water.',
    tag: 'event',
    campus: 'Main',
    status: 'published',
  }),
  announcement(20, {
    title: 'Main library is open after school',
    body: 'The library stays open until 4:30pm on weekdays for JSS and SS students.',
    tag: 'academics',
    campus: 'Main',
    status: 'published',
  }),
  announcement(5, {
    title: 'Annex science fair',
    body: 'JSS 3 and SS 1 students show their projects on Friday afternoon. Parents are welcome.',
    tag: 'academics',
    campus: 'Annex',
    status: 'published',
  }),
  announcement(15, {
    title: 'Annex bus route change',
    body: 'The Annex bus now stops at the market junction instead of the old gate.',
    tag: 'general',
    campus: 'Annex',
    status: 'published',
  }),
  announcement(1, {
    title: 'Parents’ evening',
    body: 'Date to be confirmed with the class teachers.',
    tag: 'event',
    campus: null,
    status: 'draft',
  }),
  announcement(25, {
    title: 'Uniform sale this Friday',
    body: 'The store sells shirts and ties on Friday only.',
    tag: 'general',
    campus: null,
    status: 'withdrawn',
  }),
  announcement(18, {
    title: 'Annex side gate closed',
    body: 'The side gate is closed for repairs this week.',
    tag: 'general',
    campus: 'Annex',
    status: 'withdrawn',
  }),
];

export type LeaveOutcomePlan =
  'approved' | 'pending' | 'declined' | 'withdrawn' | 'cancelled';

export interface LeavePlan {
  /** Index into `plan.teachers`. */
  teacher: number;
  type: 'sick' | 'maternity' | 'bereavement';
  startsOn: string;
  endsOn: string;
  reason: string;
  cover: string | null;
  outcome: LeaveOutcomePlan;
  createdDaysAgo: number;
  /** The decision, or the withdrawal by the requester. */
  decidedDaysAgo: number | null;
  /** Only for cancelled leave, which is first approved. */
  cancelledDaysAgo: number | null;
  decider: 'principal' | 'owner';
  note: string | null;
}

interface LeaveTemplate {
  type: LeavePlan['type'];
  start: number;
  span: number;
  created: number;
  decided?: number;
  cancelled?: number;
  outcome: LeaveOutcomePlan;
  reason: string;
  cover?: string;
  decider?: LeavePlan['decider'];
  note?: string;
}

const LEAVE_TEMPLATES: readonly LeaveTemplate[] = [
  {
    type: 'sick',
    start: -21,
    span: 2,
    created: 24,
    decided: 23,
    outcome: 'approved',
    reason: 'Malaria and a few days of rest',
  },
  {
    type: 'sick',
    start: -15,
    span: 0,
    created: 16,
    decided: 15,
    outcome: 'approved',
    reason: 'Dental appointment',
  },
  {
    type: 'bereavement',
    start: -9,
    span: 1,
    created: 12,
    decided: 11,
    outcome: 'approved',
    reason: 'Funeral of an uncle in Enugu',
    cover: 'Colleagues will share the lessons',
  },
  {
    type: 'sick',
    start: -3,
    span: 8,
    created: 4,
    decided: 3,
    outcome: 'approved',
    reason: 'Typhoid; the doctor advised bed rest',
  },
  {
    type: 'maternity',
    start: -3,
    span: 84,
    created: 30,
    decided: 29,
    outcome: 'approved',
    reason: 'Maternity leave',
    cover: 'A supply teacher covers the class',
    decider: 'owner',
  },
  {
    type: 'sick',
    start: 8,
    span: 1,
    created: 2,
    decided: 1,
    outcome: 'approved',
    reason: 'Minor surgery',
  },
  {
    type: 'bereavement',
    start: 15,
    span: 0,
    created: 1,
    decided: 0,
    outcome: 'approved',
    reason: 'Burial of a family friend in Ibadan',
    decider: 'owner',
  },
  {
    type: 'sick',
    start: 4,
    span: 1,
    created: 1,
    outcome: 'pending',
    reason: 'Doctor’s appointment and a day of rest',
  },
  {
    type: 'sick',
    start: 11,
    span: 2,
    created: 0,
    outcome: 'pending',
    reason: 'Scheduled check-up',
  },
  {
    type: 'sick',
    start: 6,
    span: 0,
    created: 5,
    decided: 4,
    outcome: 'declined',
    reason: 'Hospital visit',
    note: 'Mock exams that week. Please pick another day.',
  },
  {
    type: 'bereavement',
    start: 20,
    span: 1,
    created: 6,
    decided: 5,
    outcome: 'withdrawn',
    reason: 'Family matter',
  },
  {
    type: 'sick',
    start: 9,
    span: 1,
    created: 10,
    decided: 9,
    cancelled: 1,
    outcome: 'cancelled',
    reason: 'Procedure booked at the teaching hospital',
    note: 'The procedure was moved, so the leave is no longer needed.',
  },
];

const isSchoolDay = (date: string, holidays: readonly string[]): boolean =>
  !isWeekend(date) && !holidays.includes(date);

function schoolDayFrom(date: string, holidays: readonly string[]): string {
  let day = date;
  while (!isSchoolDay(day, holidays)) {
    day = addDays(day, 1);
  }
  return day;
}

const overlaps = (
  left: Pick<LeavePlan, 'startsOn' | 'endsOn'>,
  right: Pick<LeavePlan, 'startsOn' | 'endsOn'>
): boolean => left.startsOn <= right.endsOn && right.startsOn <= left.endsOn;

export function planLeave(
  teachers: readonly DemoTeacher[],
  today: string
): LeavePlan[] {
  const holidays = midTermDays(today);
  const planned: LeavePlan[] = [];
  for (const [index, template] of LEAVE_TEMPLATES.entries()) {
    const startsOn = schoolDayFrom(addDays(today, template.start), holidays);
    const dates = { startsOn, endsOn: addDays(startsOn, template.span) };
    const teacher = teachers
      .map((_, offset) => (index + offset) % teachers.length)
      .find((candidate) =>
        planned.every(
          (row) => row.teacher !== candidate || !overlaps(row, dates)
        )
      );
    if (teacher === undefined) {
      continue;
    }
    planned.push({
      teacher,
      type: template.type,
      ...dates,
      reason: template.reason,
      cover: template.cover ?? null,
      outcome: template.outcome,
      createdDaysAgo: template.created,
      decidedDaysAgo: template.decided ?? null,
      cancelledDaysAgo: template.cancelled ?? null,
      decider: template.decider ?? 'principal',
      note: template.note ?? null,
    });
  }
  return planned;
}

export interface NotSeenPlan {
  student: StudentNumber;
  daysAgo: number;
  note: string;
}

export interface LeftPlan {
  student: StudentNumber;
  reason: LeavingReason;
  lastDaysAgo: number;
  note: string;
}

export interface StudentLifePlan {
  /** Not seen long enough to be inactive. */
  inactive: NotSeenPlan[];
  /** Not seen recently, still active. */
  away: NotSeenPlan[];
  left: LeftPlan[];
  graduated: StudentNumber[];
  graduatedDaysAgo: number;
}

export const emptyStudentLife = (): StudentLifePlan => ({
  inactive: [],
  away: [],
  left: [],
  graduated: [],
  graduatedDaysAgo: 1,
});

const INACTIVE_DAYS_AGO = [37, 36, 35];
const AWAY_DAYS_AGO = [3, 8, 14, 21];
const LEFT_REASONS: readonly { reason: LeavingReason; note: string }[] = [
  { reason: 'relocated', note: 'The family moved to Abuja for work.' },
  { reason: 'transferred', note: 'Transferred to a school nearer home.' },
];
const LEFT_DAYS_AGO = [10, 18];
const ROLE_ORDER = [
  'inactive',
  'away',
  'left',
  'inactive',
  'away',
  'left',
  'inactive',
  'away',
  'away',
] as const;

const INACTIVE_NOTES = [
  'Has not been seen since the first week; the family cannot be reached.',
  'Family travelling abroad; no word on a return date.',
  'Phone calls to the guardian go unanswered.',
];
const AWAY_NOTES = [
  'Off sick; the guardian called the office.',
  'Away for a family event in the village.',
  'Absent since the weekend; the class teacher is following up.',
  'Recovering from an illness at home.',
];

const notSeenPlans = (
  students: readonly StudentNumber[],
  seen: { daysAgo: readonly number[]; notes: readonly string[] }
): NotSeenPlan[] =>
  students.map((student, index) => ({
    student,
    daysAgo: seen.daysAgo[index] ?? 0,
    note: seen.notes[index] ?? '',
  }));

const leftPlans = (students: readonly StudentNumber[]): LeftPlan[] =>
  students.map((student, index) => {
    const leaving = LEFT_REASONS[index % LEFT_REASONS.length];
    return {
      student,
      reason: leaving?.reason ?? 'other',
      lastDaysAgo: LEFT_DAYS_AGO[index] ?? 10,
      note: leaving?.note ?? '',
    };
  });

/** Draws from the pool in a fixed order of roles, so a small school still shows each one. */
export function planStudentLife(options: {
  pool: readonly StudentNumber[];
  finalYear: readonly StudentNumber[];
  random: Random;
}): StudentLifePlan {
  const chosen = options.random
    .shuffle(options.pool)
    .slice(0, ROLE_ORDER.length);
  const withRole = (role: (typeof ROLE_ORDER)[number]): StudentNumber[] =>
    chosen.filter((_, index) => ROLE_ORDER[index] === role);
  const taken = new Set(chosen);
  return {
    inactive: notSeenPlans(withRole('inactive'), {
      daysAgo: INACTIVE_DAYS_AGO,
      notes: INACTIVE_NOTES,
    }),
    away: notSeenPlans(withRole('away'), {
      daysAgo: AWAY_DAYS_AGO,
      notes: AWAY_NOTES,
    }),
    left: leftPlans(withRole('left')),
    graduated: options.finalYear.filter((student) => !taken.has(student)),
    graduatedDaysAgo: emptyStudentLife().graduatedDaysAgo,
  };
}
