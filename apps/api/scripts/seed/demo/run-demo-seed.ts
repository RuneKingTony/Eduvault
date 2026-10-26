import type { INestApplicationContext } from '@nestjs/common';
import type { AuthenticatedUser } from '../../../src/app/common/auth';
import { Clock } from '../../../src/app/common/clock';
import { ENV_TOKEN, type Env } from '../../../src/app/common/config/env';
import { KYSELY_TOKEN, type Database } from '../../../src/app/common/db/tokens';
import { PROTOTYPE_TODAY, seedOffsetDays, shiftDate } from '../date-shift';
import { SEED_PASSWORD } from '../members';
import { ensureSuperAdmin } from '../super-admin';
import { admitStudents } from './admissions';
import { runAnnouncements } from './announcements';
import { runApprovals } from './approvals';
import { parseDemoSize, TERM_STARTED_DAYS_AGO, type DemoSize } from './config';
import { runDemoCheck } from './demo-check';
import { found, moveClock, type DemoRun } from './demo-run';
import { runLeave } from './leave';
import { billTerm, recordPayments, setUpMoney } from './money';
import { DEMO_OWNER, DEMO_SCHOOL, familyOf, payerEmailOf } from './people-plan';
import type { WalletPlan } from './money-plan';
import { buildDemoPlan, type DemoPlan } from './plan';
import { STORE_ITEMS } from './store-plan';
import { createAcademics, createSchool } from './structure';
import { runStore } from './store';
import { runStudentLife } from './student-life';
import { runWallets } from './wallets';

interface DemoSeedOptions {
  log?: (line: string) => void;
  now?: Date;
  size?: DemoSize;
}

interface DemoSeedResult {
  seeded: boolean;
  failures: string[];
}

const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;

function elapsed(startedAt: number): string {
  const seconds = Math.round((Date.now() - startedAt) / MS_PER_SECOND);
  const minutes = Math.floor(seconds / SECONDS_PER_MINUTE);
  return minutes === 0
    ? `${seconds}s`
    : `${minutes}m ${seconds % SECONDS_PER_MINUTE}s`;
}

function signInLines(plan: DemoPlan): string[] {
  const staff = [...plan.leaders, ...plan.teachers];
  const staffEmail = (key: string) =>
    found(
      staff.find((row) => row.key === key),
      key
    ).email;
  const payerEmail = (wallet: WalletPlan | undefined) =>
    payerEmailOf(familyOf(plan.families, found(wallet, 'wallet').family));
  const plain = plan.wallets.find((wallet) => wallet.autoPay === null);
  const auto = plan.wallets.find((wallet) => wallet.autoPay !== null);
  const people: [string, string][] = [
    [DEMO_OWNER.email, 'Owner'],
    [staffEmail('principal'), 'Principal'],
    [staffEmail('bursar-main'), 'Bursar, Main'],
    [staffEmail('teacher-1'), 'Teacher'],
    [payerEmail(plain ?? plan.wallets[0]), 'Guardian with a wallet'],
    [payerEmail(auto), 'Guardian with auto-pay on'],
  ];
  return people.map(([email, label]) => `  ${email}  ${label}`);
}

function activityLines(plan: DemoPlan): string[] {
  const { store, approvals, studentLife } = plan;
  const asked = [
    ...approvals.discounts,
    ...approvals.adjustments,
    ...approvals.voids,
  ];
  const waiting = asked.filter((row) => row.state === 'pending').length;
  const unsettled = store.counts.filter((row) => row.decision === 'waiting');
  const published = plan.announcements.filter(
    (row) => row.status === 'published'
  );
  return [
    `Store: ${STORE_ITEMS.length} items in two stores, ${store.sales.length} sales and ${store.counts.length} stock counts (${unsettled.length} waiting for approval).`,
    `Approvals: ${asked.length} discounts, adjustments and cancellations asked for, ${waiting} still waiting.`,
    `Announcements: ${plan.announcements.length} (${published.length} published); leave: ${plan.leave.length} requests.`,
    `Students: ${studentLife.inactive.length} inactive, ${studentLife.away.length} not seen lately, ${studentLife.left.length} left and ${studentLife.graduated.length} graduated.`,
  ];
}

function printSummary(run: DemoRun, startedAt: number): void {
  const { plan, log } = run;
  const students = plan.families.reduce(
    (total, family) => total + family.children.length,
    0
  );
  const payments = plan.payments.filter((payment) => payment.amountMinor > 0);
  log(
    `Seeded ${DEMO_SCHOOL.name}: ${students} students in ${plan.families.length} families, ${plan.teachers.length} teachers, ${plan.arms.length} classes on 2 campuses, ${payments.length} payments and ${plan.wallets.length} family wallets; demo check passed in ${elapsed(startedAt)}.`
  );
  for (const line of activityLines(plan)) {
    log(line);
  }
  log(`Sign in with any of these (password: ${SEED_PASSWORD}):`);
  for (const line of signInLines(plan)) {
    log(line);
  }
}

async function seedDemo(
  run: DemoRun,
  superAdmin: AuthenticatedUser,
  rerun: () => Promise<boolean>
): Promise<DemoSeedResult> {
  const startedAt = Date.now();
  const { log, plan } = run;
  moveClock(run, TERM_STARTED_DAYS_AGO);
  log(`Creating ${DEMO_SCHOOL.name} with its staff, classes and subjects.`);
  const school = await createSchool(run, superAdmin);
  const academics = await createAcademics(run, school);
  log(`Admitting ${plan.size.students} students with their guardians.`);
  const people = await admitStudents(run, school, academics);
  log('Setting up money accounts and billing the term.');
  const money = await setUpMoney(run, school);
  await billTerm(run, school, academics);
  log('Recording payments.');
  await recordPayments(run, { people, money });
  log('Topping up and spending from family wallets.');
  await runWallets(run, { school, people, money });
  log('Stocking the stores and recording store sales.');
  const store = await runStore(run, { school, people, money });
  log('Asking for and deciding discounts, adjustments and cancellations.');
  await runApprovals(run, { school, academics, people, money });
  log('Posting announcements.');
  await runAnnouncements(run, school);
  log('Recording staff leave.');
  await runLeave(run, school);
  log('Marking students not seen, left and graduated.');
  await runStudentLife(run, { school, academics, people });
  moveClock(run, 0);

  log('Checking the seeded data.');
  const failures = await runDemoCheck({
    app: run.app,
    plan,
    organizationId: school.organizationId,
    owner: school.owner,
    studentIds: people.studentIds,
    payerIds: people.payerIds,
    campusIds: school.campusIds,
    itemIds: store.itemIds,
    rerun,
  });
  if (failures.length > 0) {
    log('Demo check failed:');
    for (const failure of failures) {
      log(`  ${failure}`);
    }
    return { seeded: true, failures };
  }
  printSummary(run, startedAt);
  return { seeded: true, failures: [] };
}

export async function runDemoSeed(
  app: INestApplicationContext,
  { log = console.log, now, size }: DemoSeedOptions = {}
): Promise<DemoSeedResult> {
  const superAdmin = await ensureSuperAdmin(app, log);
  const db = app.get<Database>(KYSELY_TOKEN, { strict: false });
  const marker = await db
    .selectFrom('organization')
    .select('id')
    .where('slug', '=', DEMO_SCHOOL.slug)
    .executeTakeFirst();
  if (marker) {
    log(
      'Demo school already seeded; nothing to do. If an earlier run stopped part way, run pnpm db:reset and seed again.'
    );
    return { seeded: false, failures: [] };
  }

  const { SEED_TODAY } = app.get<Env>(ENV_TOKEN, { strict: false });
  const today = shiftDate(PROTOTYPE_TODAY, seedOffsetDays(now, SEED_TODAY));
  const plan = buildDemoPlan(size ?? parseDemoSize(process.env), today);
  log(`Seeding the demo school; seed "today" is ${today}.`);
  const clock = app.get(Clock, { strict: false });
  try {
    return await seedDemo({ app, plan, log }, superAdmin, async () => {
      const again = await runDemoSeed(app, {
        log: () => undefined,
        now,
        size: plan.size,
      });
      return again.seeded;
    });
  } finally {
    clock.set(null);
  }
}
