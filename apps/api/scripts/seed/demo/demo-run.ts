import type { INestApplicationContext } from '@nestjs/common';
import type { OrgContext } from '../../../src/app/common/auth';
import { Clock } from '../../../src/app/common/clock';
import { orgContextFor } from '../actors';
import { shiftDate } from '../date-shift';
import type { DemoCampus } from './config';
import type { DemoPlan } from './plan';
import type { FamilyNumber, StudentNumber } from './people-plan';

export interface DemoRun {
  app: INestApplicationContext;
  plan: DemoPlan;
  log: (line: string) => void;
}

export interface SchoolFacts {
  organizationId: string;
  owner: OrgContext;
  campusIds: ReadonlyMap<DemoCampus, string>;
  userIds: ReadonlyMap<string, string>;
}

export interface AcademicFacts {
  termId: string;
  armIds: readonly string[];
}

export interface PeopleFacts {
  studentIds: ReadonlyMap<StudentNumber, string>;
  payerIds: ReadonlyMap<FamilyNumber, string>;
}

export const mustFind = <T>(value: T | null | undefined, what: string): T => {
  if (value === undefined || value === null) {
    throw new Error(`The demo seed has no ${what}`);
  }
  return value;
};

export const campusIdOf = (
  school: Pick<SchoolFacts, 'campusIds'>,
  campus: DemoCampus
): string => mustFind(school.campusIds.get(campus), `campus ${campus}`);

export const dayAt = (plan: DemoPlan, daysAgo: number): string =>
  shiftDate(plan.today, -daysAgo);

export const staffContext = (run: DemoRun, key: string): Promise<OrgContext> =>
  orgContextFor(
    run.app,
    mustFind(
      [...run.plan.leaders, ...run.plan.teachers].find(
        (row) => row.key === key
      ),
      `staff member ${key}`
    ).email
  );

export function moveClock(run: DemoRun, daysAgo: number): string {
  const day = dayAt(run.plan, daysAgo);
  run.app.get(Clock, { strict: false }).set(day);
  return day;
}

export function progressLogger(
  run: DemoRun,
  total: number,
  { every, line }: { every: number; line: (done: number) => string }
): (count?: number) => void {
  let done = 0;
  return (count = 1) => {
    const before = done;
    done += count;
    if (
      Math.floor(done / every) > Math.floor(before / every) ||
      done === total
    ) {
      run.log(line(done));
    }
  };
}
