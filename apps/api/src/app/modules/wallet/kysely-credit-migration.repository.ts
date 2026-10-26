import { sql, type Kysely } from 'kysely';
import {
  FEES_RECEIVABLE_SYSTEM_KEY,
  STUDENT_WALLETS_SYSTEM_KEY,
} from '@eduvault/api-contract';
import { SYSTEM_REFERENCE_PREFIXES } from '@eduvault/shared';
import type { DB } from '../../../db/db-types';
import {
  financeActor,
  walletCreditMigratedActivity,
} from '../../common/activity';
import {
  receivableAccountIdSql,
  schoolCurrency,
  systemAccountId,
} from '../../common/ledger';
import { currentCampusSql, lockStudents } from '../../common/students';
import {
  creditMigrationPostingLines,
  lockWallet,
  type WalletWriteDeps,
} from '../../common/wallet';
import {
  byText,
  matchesReviewed,
  movedFigures,
  planCreditMigration,
  reportOf,
  type CreditMigrationPlan,
  type CreditMigrationView,
  type CreditStudent,
  type PayerLink,
  type PlanFacts,
  type PlannedFamily,
  type WalletOwner,
} from './credit-migration-plan';
import type {
  CreditMigrationOutcome,
  NewCreditMigration,
} from './wallet.repository';

const REFERENCE_PREFIX = `${SYSTEM_REFERENCE_PREFIXES.wallet_credit_migration}-`;

const migrationReference = (guardianId: string): string =>
  `${REFERENCE_PREFIX}${guardianId}`;

interface StudentRow {
  student_id: string;
  first_name: string;
  last_name: string;
  admission_number: string;
  exit_kind: 'left' | 'graduated' | null;
  campus_id: string;
  campus_name: string;
  credit: string;
}

interface PayerRow {
  student_id: string;
  guardian_id: string;
  linked_at: string;
  wallet_id: string;
  full_name: string;
  phone: string;
}

const toStudent = (row: StudentRow): CreditStudent => ({
  studentId: row.student_id,
  name: `${row.first_name} ${row.last_name}`.trim(),
  admissionNumber: row.admission_number,
  creditMinor: Number(row.credit),
  status: row.exit_kind ?? 'active',
  campusId: row.campus_id,
  campusName: row.campus_name,
});

async function studentsInCredit(
  db: Kysely<DB>,
  organizationId: string
): Promise<CreditStudent[]> {
  const { rows } = await sql<StudentRow>`
    SELECT s.student_id, s.first_name, s.last_name, s.admission_number,
      s.exit_kind, s.campus_id, t.name AS campus_name, s.credit
    FROM (
      SELECT st.id AS student_id, st.first_name, st.last_name,
        st.admission_number, st.exit_kind,
        ${currentCampusSql('st')} AS campus_id,
        (-bal.balance)::text AS credit
      FROM (
        SELECT jl.student_id, SUM(jl.debit_minor - jl.credit_minor) AS balance
        FROM journal_line jl
        WHERE jl.organization_id = ${organizationId}
          AND jl.ledger_account_id = ${receivableAccountIdSql(organizationId)}
          AND jl.student_id IS NOT NULL
        GROUP BY jl.student_id
        HAVING SUM(jl.debit_minor - jl.credit_minor) < 0
      ) bal
      JOIN student st ON st.id = bal.student_id AND st.organization_id = ${organizationId}
    ) s
    JOIN team t ON t.id = s.campus_id AND t."organizationId" = ${organizationId}
    ORDER BY s.first_name, s.last_name, s.student_id`.execute(db);
  return rows.map((row) => toStudent(row));
}

async function payersOf(
  db: Kysely<DB>,
  organizationId: string,
  studentIds: readonly string[]
): Promise<PayerRow[]> {
  if (studentIds.length === 0) {
    return [];
  }
  const { rows } = await sql<PayerRow>`
    SELECT gs.student_id, gs.guardian_id,
      to_char(gs.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US') AS linked_at,
      w.id AS wallet_id, g.full_name, g.phone
    FROM guardian_student gs
    JOIN wallet w ON w.guardian_id = gs.guardian_id AND w.organization_id = gs.organization_id
    JOIN guardian g ON g.id = gs.guardian_id AND g.organization_id = gs.organization_id
    WHERE gs.organization_id = ${organizationId}
      AND gs.pays_fees
      AND gs.student_id IN (${sql.join(studentIds)})`.execute(db);
  return rows;
}

async function migratedGuardians(
  db: Kysely<DB>,
  organizationId: string
): Promise<Set<string>> {
  const entries = await db
    .selectFrom('journal_entry')
    .select('reference')
    .where('organization_id', '=', organizationId)
    .where('kind', '=', 'wallet_credit_migration')
    .execute();
  return new Set(
    entries.map((entry) => entry.reference.slice(REFERENCE_PREFIX.length))
  );
}

const toLink = (row: PayerRow): PayerLink => ({
  studentId: row.student_id,
  guardianId: row.guardian_id,
  linkedAt: row.linked_at,
});

const toOwner = (row: PayerRow): WalletOwner => ({
  guardianId: row.guardian_id,
  walletId: row.wallet_id,
  guardianName: row.full_name,
  phone: row.phone,
});

async function readFacts(
  db: Kysely<DB>,
  organizationId: string
): Promise<PlanFacts> {
  const students = await studentsInCredit(db, organizationId);
  const [payers, migratedGuardianIds] = await Promise.all([
    payersOf(
      db,
      organizationId,
      students.map((student) => student.studentId)
    ),
    migratedGuardians(db, organizationId),
  ]);
  return {
    students,
    payers: payers.map((row) => toLink(row)),
    owners: payers.map((row) => toOwner(row)),
    migratedGuardianIds,
  };
}

async function planFor(
  db: Kysely<DB>,
  organizationId: string
): Promise<CreditMigrationPlan> {
  return planCreditMigration(await readFacts(db, organizationId));
}

export async function readCreditMigration(
  db: Kysely<DB>,
  organizationId: string
): Promise<CreditMigrationView> {
  return reportOf(await planFor(db, organizationId));
}

interface FamilyPosting {
  input: NewCreditMigration;
  family: PlannedFamily;
  accounts: { walletsAccountId: string; receivableId: string };
}

async function postFamily(
  trx: Kysely<DB>,
  deps: WalletWriteDeps,
  { input, family, accounts }: FamilyPosting
): Promise<boolean> {
  const { organizationId } = input;
  const { entry, replayed } = await deps.poster.post(trx, {
    organizationId,
    reference: migrationReference(family.guardianId),
    kind: 'wallet_credit_migration',
    effectiveOn: input.today,
    memo: 'Credit moved to family wallet',
    postedBy: input.userId,
    lines: creditMigrationPostingLines({
      ...accounts,
      familyId: family.guardianId,
      children: family.children,
    }),
  });
  if (replayed) {
    return false;
  }
  const currency = await schoolCurrency(trx, organizationId);
  await deps.activity.within(trx).recordMany(
    walletCreditMigratedActivity(
      financeActor(
        { organizationId, userId: input.userId, name: input.userName },
        currency
      ),
      {
        entryId: entry.id,
        walletId: family.walletId,
        guardianName: family.guardianName,
      },
      family.children.map((child) => ({
        campusId: child.campusId,
        amountMinor: child.amountMinor,
      }))
    )
  );
  return true;
}

/** Wallets, then students, are locked in id order so two runs never wait in a circle. */
async function lockFamilies(
  trx: Kysely<DB>,
  organizationId: string,
  families: readonly PlannedFamily[]
): Promise<void> {
  const walletIds = families.map((family) => family.walletId).toSorted(byText);
  for (const walletId of walletIds) {
    await lockWallet(trx, { organizationId, walletId });
  }
  await lockStudents(trx, {
    organizationId,
    studentIds: families.flatMap((family) =>
      family.children.map((child) => child.studentId)
    ),
  });
}

export async function writeCreditMigration(
  trx: Kysely<DB>,
  deps: WalletWriteDeps,
  input: NewCreditMigration
): Promise<CreditMigrationOutcome> {
  const { organizationId } = input;
  const { families } = await planFor(trx, organizationId);
  await lockFamilies(trx, organizationId, families);
  const plan = await planFor(trx, organizationId);
  if (plan.families.length === 0) {
    return { status: 'replayed' };
  }
  if (!matchesReviewed(plan, input)) {
    return { status: 'changed', report: reportOf(plan) };
  }
  const accounts = {
    walletsAccountId: await systemAccountId(
      trx,
      organizationId,
      STUDENT_WALLETS_SYSTEM_KEY
    ),
    receivableId: await systemAccountId(
      trx,
      organizationId,
      FEES_RECEIVABLE_SYSTEM_KEY
    ),
  };
  const moved: PlannedFamily[] = [];
  for (const family of plan.families) {
    if (await postFamily(trx, deps, { input, family, accounts })) {
      moved.push(family);
    }
  }
  if (moved.length === 0) {
    return { status: 'replayed' };
  }
  return { status: 'moved', ...movedFigures(moved) };
}
