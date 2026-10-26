import { KYSELY_TOKEN, type Database } from '../../../src/app/common/db/tokens';
import { GraduationService } from '../../../src/app/modules/student/graduation.service';
import { LifecycleService } from '../../../src/app/modules/student/lifecycle.service';
import {
  dayAt,
  found,
  moveClock,
  type AcademicFacts,
  type DemoRun,
  type PeopleFacts,
  type SchoolFacts,
} from './demo-run';
import type { ArmIndex, StudentNumber } from './people-plan';

const SEEN_AT = 'T10:00:00Z';

interface LifeRun {
  run: DemoRun;
  school: SchoolFacts;
  academics: AcademicFacts;
  people: PeopleFacts;
}

const idOf = (context: LifeRun, student: StudentNumber): string =>
  found(context.people.studentIds.get(student), `student ${student}`);

/** The services stamp wall-clock time on a student's row, so the seed day is written back afterwards. */
async function restamp(
  context: LifeRun,
  rows: readonly { student: StudentNumber; day: string; archived: boolean }[]
): Promise<void> {
  const db = context.run.app.get<Database>(KYSELY_TOKEN, { strict: false });
  for (const row of rows) {
    const at = new Date(`${row.day}${SEEN_AT}`);
    await db
      .updateTable('student')
      .set(
        row.archived ? { archived_at: at, updated_at: at } : { updated_at: at }
      )
      .where('organization_id', '=', context.school.organizationId)
      .where('id', '=', idOf(context, row.student))
      .execute();
  }
}

async function graduateFinalYear(context: LifeRun): Promise<void> {
  const { run, school, academics } = context;
  const graduation = run.app.get(GraduationService, { strict: false });
  const byArm = new Map<ArmIndex, StudentNumber[]>();
  for (const family of run.plan.families) {
    for (const child of family.children) {
      if (run.plan.studentLife.graduated.includes(child.number)) {
        byArm.set(child.arm, [...(byArm.get(child.arm) ?? []), child.number]);
      }
    }
  }
  for (const [arm, students] of byArm) {
    await graduation.graduate(
      school.owner,
      found(academics.armIds[arm], `class ${arm}`),
      { studentIds: students.map((student) => idOf(context, student)) }
    );
  }
}

export async function runStudentLife(
  run: DemoRun,
  facts: {
    school: SchoolFacts;
    academics: AcademicFacts;
    people: PeopleFacts;
  }
): Promise<void> {
  const context: LifeRun = { run, ...facts };
  const { studentLife } = run.plan;
  const lifecycle = run.app.get(LifecycleService, { strict: false });
  const { owner } = facts.school;
  moveClock(run, 0);
  const notSeen = [...studentLife.inactive, ...studentLife.away];
  for (const row of notSeen) {
    await lifecycle.markAway(owner, idOf(context, row.student), {
      date: dayAt(run.plan, row.daysAgo),
      note: row.note,
    });
  }
  for (const row of studentLife.left) {
    await lifecycle.leave(owner, idOf(context, row.student), {
      reason: row.reason,
      lastDay: dayAt(run.plan, row.lastDaysAgo),
      note: row.note,
    });
  }
  await graduateFinalYear(context);
  await restamp(context, [
    ...notSeen.map((row) => ({
      student: row.student,
      day: dayAt(run.plan, row.daysAgo),
      archived: false,
    })),
    ...studentLife.left.map((row) => ({
      student: row.student,
      day: dayAt(run.plan, row.lastDaysAgo),
      archived: true,
    })),
    ...studentLife.graduated.map((student) => ({
      student,
      day: dayAt(run.plan, studentLife.graduatedDaysAgo),
      archived: true,
    })),
  ]);
}
