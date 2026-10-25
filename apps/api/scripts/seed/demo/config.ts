export const DEFAULT_DEMO_STUDENTS = 600;
export const DEFAULT_DEMO_TEACHERS = 30;

export const DEMO_CAMPUSES = ['Main', 'Annex'] as const;
export type DemoCampus = (typeof DEMO_CAMPUSES)[number];

export const DEMO_LEVEL_COUNT = 12;
export const DEMO_ARM_COUNT = DEMO_LEVEL_COUNT * DEMO_CAMPUSES.length;

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
