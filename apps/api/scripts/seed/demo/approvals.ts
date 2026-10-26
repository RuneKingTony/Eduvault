import type { OrgContext } from '../../../src/app/common/auth';
import { KYSELY_TOKEN, type Database } from '../../../src/app/common/db/tokens';
import { AdjustmentService } from '../../../src/app/modules/adjustment/adjustment.service';
import { DiscountService } from '../../../src/app/modules/adjustment/discount.service';
import { PaymentVoidService } from '../../../src/app/modules/payment/payment-void.service';
import type { DemoCampus } from './config';
import {
  found,
  moveClock,
  staffContext,
  type AcademicFacts,
  type DemoRun,
  type PeopleFacts,
  type SchoolFacts,
} from './demo-run';
import { bursarOf, type MoneyFacts } from './money';
import { oldestFirst } from './ordering';
import type { AdjustmentPlan, DiscountPlan, VoidPlan } from './approvals-plan';
import type { StudentNumber } from './people-plan';

interface ApprovalsRun {
  run: DemoRun;
  school: SchoolFacts;
  academics: AcademicFacts;
  people: PeopleFacts;
  money: MoneyFacts;
  principal: OrgContext;
}

interface Decision {
  state: 'approved' | 'pending' | 'declined';
  decidedDaysAgo: number | null;
  declineReason: string | null;
}

function campusOfStudent(run: DemoRun, student: StudentNumber): DemoCampus {
  const family = run.plan.families.find((row) =>
    row.children.some((child) => child.number === student)
  );
  return found(family, `family of student ${student}`).campus;
}

interface Deciding {
  approve: (ctx: OrgContext, id: string) => Promise<unknown>;
  decline: (ctx: OrgContext, id: string, reason: string) => Promise<unknown>;
}

async function decide(
  context: ApprovalsRun,
  decision: Decision,
  made: { service: Deciding; id: string }
): Promise<void> {
  if (decision.state === 'pending') {
    return;
  }
  moveClock(context.run, found(decision.decidedDaysAgo, 'decision day'));
  const { service, id } = made;
  await (decision.state === 'approved'
    ? service.approve(context.principal, id)
    : service.decline(
        context.principal,
        id,
        found(decision.declineReason, 'decline reason')
      ));
}

async function runDiscounts(
  context: ApprovalsRun,
  rows: readonly DiscountPlan[]
): Promise<void> {
  const { run, people, money, academics } = context;
  const discounts = run.app.get(DiscountService, { strict: false });
  for (const row of oldestFirst(rows, (item) => item.daysAgo)) {
    const bursar = bursarOf(money, campusOfStudent(run, row.student));
    moveClock(run, row.daysAgo);
    const { discount } = await discounts.create(bursar, {
      studentId: found(
        people.studentIds.get(row.student),
        `student ${row.student}`
      ),
      kind: row.kind,
      value: row.value,
      ledgerAccountId: null,
      fromTermId: academics.termId,
      reason: row.reason,
    });
    await decide(context, row, { service: discounts, id: discount.id });
  }
}

async function runAdjustments(
  context: ApprovalsRun,
  rows: readonly AdjustmentPlan[]
): Promise<void> {
  const { run, people, money } = context;
  const adjustments = run.app.get(AdjustmentService, { strict: false });
  for (const row of oldestFirst(rows, (item) => item.daysAgo)) {
    const campus = campusOfStudent(run, row.student);
    moveClock(run, row.daysAgo);
    const { adjustment } = await adjustments.create(bursarOf(money, campus), {
      kind: row.kind,
      studentId: found(
        people.studentIds.get(row.student),
        `student ${row.student}`
      ),
      amountMinor: row.amountMinor,
      reason: row.reason,
      moneyAccountId:
        row.kind === 'refund'
          ? found(money.cashBoxes.get(campus), `cash box for ${campus}`)
          : undefined,
    });
    await decide(context, row, { service: adjustments, id: adjustment.id });
  }
}

async function runVoids(
  context: ApprovalsRun,
  rows: readonly VoidPlan[]
): Promise<void> {
  const { run, school, money } = context;
  const db = run.app.get<Database>(KYSELY_TOKEN, { strict: false });
  const voids = run.app.get(PaymentVoidService, { strict: false });
  for (const row of oldestFirst(rows, (item) => item.daysAgo)) {
    const family = found(
      run.plan.families.find((candidate) => candidate.number === row.family),
      `family ${row.family}`
    );
    const payment = await db
      .selectFrom('payment')
      .select('id')
      .where('organization_id', '=', school.organizationId)
      .where('reference', '=', `DEMO-PAY-${row.family}`)
      .executeTakeFirstOrThrow();
    moveClock(run, row.daysAgo);
    const { void: requested } = await voids.request(
      bursarOf(money, family.campus),
      payment.id,
      { reason: row.reason }
    );
    await decide(context, row, { service: voids, id: requested.id });
  }
}

export async function runApprovals(
  run: DemoRun,
  facts: {
    school: SchoolFacts;
    academics: AcademicFacts;
    people: PeopleFacts;
    money: MoneyFacts;
  }
): Promise<void> {
  const context: ApprovalsRun = {
    run,
    ...facts,
    principal: await staffContext(run, 'principal'),
  };
  const { approvals } = run.plan;
  await runDiscounts(context, approvals.discounts);
  await runAdjustments(context, approvals.adjustments);
  await runVoids(context, approvals.voids);
}
