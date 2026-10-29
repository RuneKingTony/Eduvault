import type { OrgContext } from '../../../src/app/common/auth';
import { FilesService } from '../../../src/app/common/files/files.service';
import { BillingService } from '../../../src/app/modules/billing/billing.service';
import { FeeLineService } from '../../../src/app/modules/fee-line/fee-line.service';
import { MoneyAccountService } from '../../../src/app/modules/money-account/money-account.service';
import { PaymentService } from '../../../src/app/modules/payment/payment.service';
import { ClassLevelService } from '../../../src/app/modules/class/class-level.service';
import { orgContextFor } from '../actors';
import { DEMO_CAMPUSES, type DemoCampus } from './config';
import {
  campusIdOf,
  dayAt,
  mustFind,
  moveClock,
  progressLogger,
  type AcademicFacts,
  type DemoRun,
  type PeopleFacts,
  type SchoolFacts,
} from './demo-run';
import { feeLinesFor, type FamilyPayment } from './money-plan';
import { oldestFirst } from './ordering';
import { DEMO_LEVELS, familyOf } from './people-plan';
import { databaseOf } from '../database';

const BILLING_DAYS_AGO = 33;
const PROGRESS_EVERY = 100;

export interface MoneyFacts {
  cashBoxes: ReadonlyMap<DemoCampus, string>;
  bankAccounts: ReadonlyMap<DemoCampus, string>;
  bursars: ReadonlyMap<DemoCampus, OrgContext>;
}

export const bursarOf = (money: MoneyFacts, campus: DemoCampus): OrgContext =>
  mustFind(money.bursars.get(campus), `bursar for ${campus}`);

const BANK_LAST4: Readonly<Record<DemoCampus, string>> = {
  Main: '2208',
  Annex: '6531',
};

export const proofOf = (label: string) => ({
  originalname: `${label}.pdf`,
  buffer: Buffer.from(`%PDF-1.7\n% ${label}\n`),
});

export async function setUpMoney(
  run: DemoRun,
  school: SchoolFacts
): Promise<MoneyFacts> {
  const accounts = run.app.get(MoneyAccountService, { strict: false });
  const cashBoxes = new Map<DemoCampus, string>();
  const bankAccounts = new Map<DemoCampus, string>();
  const bursars = new Map<DemoCampus, OrgContext>();
  for (const campus of DEMO_CAMPUSES) {
    const campusId = campusIdOf(school, campus);
    const cash = await accounts.create(school.owner, {
      name: `${campus} cash box`,
      kind: 'cash',
      campusId,
    });
    const bank = await accounts.create(school.owner, {
      name: `GTBank ${campus}`,
      kind: 'bank',
      bankName: 'GTBank',
      last4: BANK_LAST4[campus],
      campusId,
    });
    cashBoxes.set(campus, cash.id);
    bankAccounts.set(campus, bank.id);
    const bursar = mustFind(
      run.plan.leaders.find(
        (leader) => leader.key === `bursar-${campus.toLowerCase()}`
      ),
      `bursar for ${campus}`
    );
    bursars.set(campus, await orgContextFor(run.app, bursar.email));
  }
  return { cashBoxes, bankAccounts, bursars };
}

async function createFeeLines(
  run: DemoRun,
  school: SchoolFacts,
  academics: AcademicFacts
): Promise<void> {
  const db = databaseOf(run.app);
  const accounts = await db
    .selectFrom('ledger_account')
    .select(['id', 'code'])
    .where('organization_id', '=', school.organizationId)
    .execute();
  const feeTypes = new Map(accounts.map((row) => [row.code, row.id]));
  const levels = await run.app
    .get(ClassLevelService, { strict: false })
    .list(school.owner);
  const lines = run.app.get(FeeLineService, { strict: false });
  for (const demoLevel of DEMO_LEVELS) {
    const level = mustFind(
      levels.find((row) => row.code === demoLevel.code),
      demoLevel.code
    );
    for (const line of feeLinesFor(demoLevel)) {
      await lines.create(school.owner, {
        termId: academics.termId,
        classLevelId: level.id,
        feeTypeId: mustFind(
          feeTypes.get(line.typeCode),
          `fee type ${line.typeCode}`
        ),
        campusId: null,
        name: line.name,
        amountMinor: line.amountMinor,
        isOptional: line.optional,
      });
    }
  }
}

export async function billTerm(
  run: DemoRun,
  school: SchoolFacts,
  academics: AcademicFacts
): Promise<void> {
  await createFeeLines(run, school, academics);
  moveClock(run, BILLING_DAYS_AGO);
  const billing = run.app.get(BillingService, { strict: false });
  const round = await billing.prepare(school.owner, {
    termId: academics.termId,
    scope: 'school',
  });
  if (round.runId === null) {
    throw new Error('The demo billing round charged nobody');
  }
  await billing.issue(school.owner, round.runId);
  run.log(`  billed ${dayAt(run.plan, BILLING_DAYS_AGO)}`);
}

export async function recordPayments(
  run: DemoRun,
  facts: { people: PeopleFacts; money: MoneyFacts }
): Promise<void> {
  const { plan, app } = run;
  const payments = app.get(PaymentService, { strict: false });
  const files = app.get(FilesService, { strict: false });
  const paying = oldestFirst(
    plan.payments.filter((payment) => payment.amountMinor > 0),
    (payment) => payment.daysAgo
  );
  const logProgress = progressLogger(run, paying.length, {
    every: PROGRESS_EVERY,
    line: (done) => `  recorded ${done} of ${paying.length} payments`,
  });
  for (const payment of paying) {
    const family = familyOf(plan.families, payment.family);
    const bursar = bursarOf(facts.money, family.campus);
    const day = moveClock(run, payment.daysAgo);
    const proof =
      payment.method === 'transfer'
        ? await files.upload(bursar, {
            kind: 'payment_proof',
            file: proofOf(`transfer-slip-${payment.family}`),
          })
        : undefined;
    await payments.record(bursar, {
      reference: `DEMO-PAY-${payment.family}`,
      payerGuardianId: mustFind(
        facts.people.payerIds.get(payment.family),
        `payer of family ${payment.family}`
      ),
      payerName: undefined,
      moneyAccountId: accountFor(facts.money, family.campus, payment),
      method: payment.method,
      providerReference: undefined,
      proofFileId: proof?.id,
      amountMinor: payment.amountMinor,
      paidOn: day,
      allocations: payment.allocations.map((row) => ({
        studentId: mustFind(
          facts.people.studentIds.get(row.child),
          `student ${row.child}`
        ),
        amountMinor: row.amountMinor,
      })),
    });
    logProgress();
  }
}

export function accountFor(
  money: MoneyFacts,
  campus: DemoCampus,
  payment: Pick<FamilyPayment, 'method'>
): string {
  const accounts =
    payment.method === 'transfer' ? money.bankAccounts : money.cashBoxes;
  return mustFind(
    accounts.get(campus),
    `${payment.method} account for ${campus}`
  );
}
