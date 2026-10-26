import { shiftDate } from '../date-shift';

export const DEFAULT_DEMO_STUDENTS = 600;
export const DEFAULT_DEMO_TEACHERS = 30;

export const DEMO_CAMPUSES = ['Main', 'Annex'] as const;
export type DemoCampus = (typeof DEMO_CAMPUSES)[number];

export const DEMO_LEVEL_COUNT = 12;
export const DEMO_ARM_COUNT = DEMO_LEVEL_COUNT * DEMO_CAMPUSES.length;

export const TERM_STARTED_DAYS_AGO = 37;
const WEEKS_BEFORE_MID_TERM = 8;
const MID_TERM_THURSDAY_OFFSET = 3;

export function midTermDays(today: string): [string, string] {
  const first = shiftDate(
    today,
    WEEKS_BEFORE_MID_TERM * 7 + MID_TERM_THURSDAY_OFFSET - TERM_STARTED_DAYS_AGO
  );
  return [first, shiftDate(first, 1)];
}

export interface DemoSize {
  students: number;
  teachers: number;
}

function positiveInteger(
  env: Readonly<Record<string, string | undefined>>,
  name: string,
  fallback: number
): number {
  const raw = env[name]?.trim();
  if (raw === undefined || raw === '') {
    return fallback;
  }
  if (!/^[1-9]\d*$/.test(raw)) {
    throw new Error(`${name} must be a positive whole number, got "${raw}".`);
  }
  return Number(raw);
}

export function parseDemoSize(
  env: Readonly<Record<string, string | undefined>>
): DemoSize {
  const students = positiveInteger(
    env,
    'SEED_DEMO_STUDENTS',
    DEFAULT_DEMO_STUDENTS
  );
  const teachers = positiveInteger(
    env,
    'SEED_DEMO_TEACHERS',
    DEFAULT_DEMO_TEACHERS
  );
  if (students < DEMO_ARM_COUNT) {
    throw new Error(
      `SEED_DEMO_STUDENTS must be at least ${DEMO_ARM_COUNT}, one for each class, got ${students}.`
    );
  }
  return { students, teachers };
}
