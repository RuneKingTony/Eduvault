import type { INestApplicationContext } from '@nestjs/common';
import { sql } from 'kysely';
import {
  FEES_RECEIVABLE_SYSTEM_KEY,
  STUDENT_WALLETS_SYSTEM_KEY,
} from '@eduvault/api-contract';
import type { OrgContext } from '../../../src/app/common/auth';
import { KYSELY_TOKEN, type Database } from '../../../src/app/common/db/tokens';
import { StudentAccountService } from '../../../src/app/modules/student-account/student-account.service';
import { WalletService } from '../../../src/app/modules/wallet/wallet.service';
import {
  expectedBalances,
  expectedReceivable,
  expectedWalletBalance,
  owedAndCredit,
} from './check-math';
import { DEMO_ARM_COUNT, DEMO_CAMPUSES } from './config';
import type { DemoPlan } from './plan';
import {
  DEMO_SCHOOL,
  EMAIL_DOMAIN,
  type FamilyNumber,
  type StudentNumber,
} from './people-plan';

interface CheckInput {
  app: INestApplicationContext;
  plan: DemoPlan;
  organizationId: string;
  owner: OrgContext;
  studentIds: ReadonlyMap<StudentNumber, string>;
  payerIds: ReadonlyMap<FamilyNumber, string>;
  rerun: () => Promise<boolean>;
}

export const COUNTED_TABLES = [
  'organization',
  'user',
  'member',
  'student',
  'guardian',
  'guardian_student',
  'class_arm',
  'subject_teacher',
  'fee_line',
  'invoice',
  'payment',
  'wallet',
  'file_object',
  'journal_entry',
  'journal_line',
  'activity_event',
] as const;

const matcher =
  (failures: string[]) =>
  (what: string, got: number, want: number): void => {
    if (got !== want) {
      failures.push(`${what}: expected ${want}, found ${got}`);
    }
  };

async function countsMatch({ app, plan, organizationId }: CheckInput) {
  const db = app.get<Database>(KYSELY_TOKEN, { strict: false });
  const { rows } = await sql<Record<string, string>>`
    SELECT
      (SELECT count(*) FROM student WHERE organization_id = ${organizationId}) AS students,
      (SELECT count(*) FROM guardian WHERE organization_id = ${organizationId}) AS guardians,
      (SELECT count(*) FROM class_arm WHERE organization_id = ${organizationId} AND retired_at IS NULL) AS arms,
      (SELECT count(*) FROM campus WHERE organization_id = ${organizationId}) AS campuses,
      (SELECT count(*) FROM member WHERE "organizationId" = ${organizationId} AND role = 'teacher') AS teachers,
      (SELECT count(*) FROM student s WHERE s.organization_id = ${organizationId}
        AND NOT EXISTS (
          SELECT 1 FROM student_enrollment e
          JOIN enrollment_placement p ON p.enrollment_id = e.id
          WHERE e.student_id = s.id)) AS unplaced,
      (SELECT count(*) FROM student s WHERE s.organization_id = ${organizationId}
        AND NOT EXISTS (SELECT 1 FROM guardian_student g WHERE g.student_id = s.id)) AS unguarded,
      (SELECT count(*) FROM guardian_student WHERE organization_id = ${organizationId} AND pays_fees) AS payers`.execute(
    db
  );
  const row = rows[0] ?? {};
  const failures: string[] = [];
  const same = matcher(failures);
  const got = (key: string) => Number(row[key] ?? -1);
  same('students', got('students'), plan.size.students);
  same(
    'guardians',
    got('guardians'),
    plan.families.reduce((total, family) => total + family.guardians.length, 0)
  );
  same('classes', got('arms'), DEMO_ARM_COUNT);
  same('campuses', got('campuses'), DEMO_CAMPUSES.length);
  same('teachers', got('teachers'), plan.size.teachers);
  same('students without a class', got('unplaced'), 0);
  same('students without a guardian', got('unguarded'), 0);
  same('fee-paying links', got('payers'), plan.size.students);
  return failures;
}

async function servicesAgree(
  { app, owner }: Pick<CheckInput, 'app' | 'owner'>,
  expected: { owedMinor: number; studentsOwing: number }
) {
  const accounts = app.get(StudentAccountService, { strict: false });
  const [whoOwes, dashboard] = await Promise.all([
    accounts.balances(owner, { filter: 'owing', page: 1, pageSize: 1 }),
    accounts.dashboardFinance(owner),
  ]);
  const failures: string[] = [];
  const same = matcher(failures);
  same(
    'Who owes: total owed',
    whoOwes.summary.totalOwedMinor,
    expected.owedMinor
  );
  same(
    'Who owes: students owing',
    whoOwes.summary.studentsOwing,
    expected.studentsOwing
  );
  same('Who owes: students listed', whoOwes.total, expected.studentsOwing);
  same('Dashboard: total owed', dashboard?.owedMinor ?? -1, expected.owedMinor);
  same(
    'Dashboard: students owing',
    dashboard?.owingStudents ?? -1,
    expected.studentsOwing
  );
  return failures;
}

interface StudentLedger {
  balance: number;
  autoPaid: number;
}

async function studentLedgers({
  app,
  organizationId,
}: CheckInput): Promise<Map<string, StudentLedger>> {
  const db = app.get<Database>(KYSELY_TOKEN, { strict: false });
  const { rows } = await sql<{ id: string; balance: string; auto: string }>`
    SELECT s.id,
           COALESCE(SUM(jl.debit_minor - jl.credit_minor), 0)::text AS balance,
           COALESCE(SUM(jl.credit_minor) FILTER (WHERE e.reference LIKE 'AUTOPAY-%'), 0)::text AS auto
    FROM student s
    LEFT JOIN journal_line jl
      ON jl.student_id = s.id
     AND jl.organization_id = s.organization_id
     AND jl.ledger_account_id = (
       SELECT la.id FROM ledger_account la
       WHERE la.organization_id = s.organization_id
         AND la.system_key = ${FEES_RECEIVABLE_SYSTEM_KEY})
    LEFT JOIN journal_entry e ON e.id = jl.entry_id
    WHERE s.organization_id = ${organizationId}
    GROUP BY s.id`.execute(db);
  return new Map(
    rows.map((row) => [
      row.id,
      { balance: Number(row.balance), autoPaid: Number(row.auto) },
    ])
  );
}

async function receivableTotals({ app, organizationId }: CheckInput) {
  const db = app.get<Database>(KYSELY_TOKEN, { strict: false });
  const { rows } = await sql<{ debits: string; credits: string }>`
    SELECT COALESCE(SUM(jl.debit_minor), 0)::text AS debits,
           COALESCE(SUM(jl.credit_minor), 0)::text AS credits
    FROM journal_line jl
    WHERE jl.organization_id = ${organizationId}
      AND jl.ledger_account_id = (
        SELECT la.id FROM ledger_account la
        WHERE la.organization_id = ${organizationId}
          AND la.system_key = ${FEES_RECEIVABLE_SYSTEM_KEY})`.execute(db);
  return {
    debitsMinor: Number(rows[0]?.debits ?? -1),
    creditsMinor: Number(rows[0]?.credits ?? -1),
  };
}

async function receivableMatches(input: CheckInput) {
  const { plan, app, owner, studentIds } = input;
  const [ledgers, totals] = await Promise.all([
    studentLedgers(input),
    receivableTotals(input),
  ]);
  const ledgerOf = (child: StudentNumber) =>
    ledgers.get(studentIds.get(child) ?? '');
  const autoPaid = [...ledgers.values()].reduce(
    (total, row) => total + row.autoPaid,
    0
  );
  const expected = expectedReceivable(plan);
  const planned = expectedBalances(
    plan,
    (child) => ledgerOf(child)?.autoPaid ?? 0
  );
  const failures: string[] = [];
  const same = matcher(failures);
  same('charged', totals.debitsMinor, expected.chargedMinor);
  same(
    'paid, spent and auto-paid',
    totals.creditsMinor,
    expected.plannedCreditsMinor + autoPaid
  );
  same(
    'students whose balance differs from the plan',
    [...planned].filter(
      ([child, balance]) => ledgerOf(child)?.balance !== balance
    ).length,
    0
  );
  const { owedMinor, creditMinor } = owedAndCredit([...planned.values()]);
  same('credit held for students', creditMinor, expected.overpaidMinor);
  failures.push(
    ...(await servicesAgree(
      { app, owner },
      {
        owedMinor,
        studentsOwing: [...planned.values()].filter((balance) => balance > 0)
          .length,
      }
    ))
  );
  return failures;
}

async function walletsMatch({
  app,
  plan,
  organizationId,
  owner,
  payerIds,
}: CheckInput) {
  const db = app.get<Database>(KYSELY_TOKEN, { strict: false });
  const { rows } = await sql<{
    wallet_id: string;
    guardian_id: string;
    journal: string;
    auto: string;
    aside: string;
  }>`
    SELECT w.id AS wallet_id, w.guardian_id,
      COALESCE((
        SELECT SUM(jl.credit_minor - jl.debit_minor) FROM journal_line jl
        WHERE jl.organization_id = w.organization_id
          AND jl.family_id = w.guardian_id
          AND jl.ledger_account_id = (
            SELECT la.id FROM ledger_account la
            WHERE la.organization_id = w.organization_id
              AND la.system_key = ${STUDENT_WALLETS_SYSTEM_KEY})), 0)::text AS journal,
      COALESCE((
        SELECT SUM(jl.debit_minor) FROM journal_line jl
        JOIN journal_entry e ON e.id = jl.entry_id
        WHERE jl.organization_id = w.organization_id
          AND jl.family_id = w.guardian_id
          AND e.reference LIKE 'AUTOPAY-%'
          AND jl.ledger_account_id = (
            SELECT la.id FROM ledger_account la
            WHERE la.organization_id = w.organization_id
              AND la.system_key = ${STUDENT_WALLETS_SYSTEM_KEY})), 0)::text AS auto,
      COALESCE((SELECT SUM(x.delta_minor) FROM wallet_earmark x WHERE x.wallet_id = w.id), 0)::text AS aside
    FROM wallet w
    WHERE w.organization_id = ${organizationId}`.execute(db);
  const wallets = app.get(WalletService, { strict: false });
  const planned = new Map(
    plan.wallets.map((wallet) => [payerIds.get(wallet.family), wallet])
  );
  const failures: string[] = [];
  const same = matcher(failures);
  for (const row of rows) {
    const wallet = await wallets.get(owner, row.wallet_id);
    const who = `wallet of ${wallet.guardian.name}`;
    const journal = Number(row.journal);
    const aside = Number(row.aside);
    same(
      `${who}: balance against its journal lines`,
      wallet.balanceMinor,
      journal
    );
    same(`${who}: money set aside`, wallet.setAsideMinor, aside);
    same(`${who}: free money`, wallet.freeMinor, journal - aside);
    if (wallet.freeMinor < 0) {
      failures.push(`${who} has negative free money`);
    }
    const sample = planned.get(row.guardian_id);
    const autoPaid = Number(row.auto);
    same(
      `${who}: balance against its top-ups and spends`,
      journal,
      sample === undefined ? 0 : expectedWalletBalance(sample, autoPaid)
    );
    if ((sample?.autoPay ?? null) !== null && autoPaid <= 0) {
      failures.push(`${who} has auto-pay on but never auto-paid`);
    }
  }
  return failures;
}

async function nothingLeaksAcross({ app, organizationId }: CheckInput) {
  const admissionLike = `${DEMO_SCHOOL.admissionPrefix}-%`;
  const emailLike = `%@${EMAIL_DOMAIN}`;
  const db = app.get<Database>(KYSELY_TOKEN, { strict: false });
  const { rows } = await sql<Record<string, string>>`
    SELECT
      (SELECT count(*) FROM journal_line jl JOIN student s ON s.id = jl.student_id
        WHERE s.organization_id = ${organizationId} AND jl.organization_id <> ${organizationId}) AS lines,
      (SELECT count(*) FROM guardian_student gs JOIN student s ON s.id = gs.student_id
        WHERE s.organization_id = ${organizationId} AND gs.organization_id <> ${organizationId}) AS links,
      (SELECT count(*) FROM payment p JOIN guardian g ON g.id = p.payer_guardian_id
        WHERE g.organization_id = ${organizationId} AND p.organization_id <> ${organizationId}) AS payments,
      (SELECT count(*) FROM student WHERE organization_id <> ${organizationId} AND admission_number LIKE ${admissionLike}) AS students,
      (SELECT count(*) FROM member m JOIN "user" u ON u.id = m."userId"
        WHERE m."organizationId" <> ${organizationId} AND u.email LIKE ${emailLike}) AS members`.execute(
    db
  );
  const row = rows[0] ?? {};
  const failures: string[] = [];
  const same = matcher(failures);
  for (const key of ['lines', 'links', 'payments', 'students', 'members']) {
    same(`Riverside ${key} under another school`, Number(row[key] ?? -1), 0);
  }
  return failures;
}

async function rowCounts({ app }: CheckInput) {
  const db = app.get<Database>(KYSELY_TOKEN, { strict: false });
  const counts = new Map<string, number>();
  for (const table of COUNTED_TABLES) {
    const { rows } = await sql<{
      n: string;
    }>`SELECT count(*)::text AS n FROM ${sql.table(table)}`.execute(db);
    counts.set(table, Number(rows[0]?.n ?? -1));
  }
  return counts;
}

async function secondRunChangesNothing(input: CheckInput) {
  const before = await rowCounts(input);
  const failures: string[] = [];
  const same = matcher(failures);
  if (await input.rerun()) {
    failures.push('a second run seeded again instead of stopping');
  }
  const after = await rowCounts(input);
  for (const [table, count] of before) {
    same(`${table} rows after a second run`, after.get(table) ?? -1, count);
  }
  return failures;
}

export async function runDemoCheck(input: CheckInput): Promise<string[]> {
  const failures: string[] = [];
  for (const check of [
    countsMatch,
    receivableMatches,
    walletsMatch,
    nothingLeaksAcross,
    secondRunChangesNothing,
  ]) {
    failures.push(...(await check(input)));
  }
  return failures;
}
