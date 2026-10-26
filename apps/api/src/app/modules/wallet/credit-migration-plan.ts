import type {
  CreditMigrationChild,
  CreditMigrationNotMoved,
  CreditMigrationReport,
} from '@eduvault/api-contract';
import { sumMinor } from '../../common/ledger';

export interface CreditStudent {
  studentId: string;
  name: string;
  admissionNumber: string;
  creditMinor: number;
  status: CreditMigrationChild['status'];
  campusId: string;
  campusName: string;
}

/** A guardian who pays for a student. `linkedAt` is a fixed-width UTC timestamp, so text order is time order. */
export interface PayerLink {
  studentId: string;
  guardianId: string;
  linkedAt: string;
}

export interface WalletOwner {
  guardianId: string;
  walletId: string;
  guardianName: string;
  phone: string;
}

export interface PlanFacts {
  students: readonly CreditStudent[];
  payers: readonly PayerLink[];
  owners: readonly WalletOwner[];
  migratedGuardianIds: ReadonlySet<string>;
}

export interface PlannedChild extends CreditMigrationChild {
  campusId: string;
}

export interface PlannedFamily extends WalletOwner {
  totalMinor: number;
  children: PlannedChild[];
}

export interface CreditMigrationPlan {
  families: PlannedFamily[];
  notMoved: CreditMigrationNotMoved[];
}

export const byText = (a: string, b: string): number => a.localeCompare(b);

const byNameThenId = (
  a: { name: string; studentId: string },
  b: { name: string; studentId: string }
): number => byText(a.name, b.name) || byText(a.studentId, b.studentId);

function earliestPayer(
  links: readonly PayerLink[],
  walletOf: ReadonlyMap<string, WalletOwner>
): WalletOwner | undefined {
  const [first] = links
    .filter((link) => walletOf.has(link.guardianId))
    .toSorted(
      (a, b) =>
        byText(a.linkedAt, b.linkedAt) || byText(a.guardianId, b.guardianId)
    );
  return first === undefined ? undefined : walletOf.get(first.guardianId);
}

function linksByStudent(links: readonly PayerLink[]): Map<string, PayerLink[]> {
  const byStudent = new Map<string, PayerLink[]>();
  for (const link of links) {
    byStudent.set(link.studentId, [
      ...(byStudent.get(link.studentId) ?? []),
      link,
    ]);
  }
  return byStudent;
}

const notMovedOf = (
  student: CreditStudent,
  reason: CreditMigrationNotMoved['reason']
): CreditMigrationNotMoved => ({
  studentId: student.studentId,
  name: student.name,
  admissionNumber: student.admissionNumber,
  amountMinor: student.creditMinor,
  reason,
});

const childOf = (student: CreditStudent): PlannedChild => ({
  studentId: student.studentId,
  name: student.name,
  admissionNumber: student.admissionNumber,
  amountMinor: student.creditMinor,
  status: student.status,
  campusName: student.campusName,
  campusId: student.campusId,
});

export function planCreditMigration(facts: PlanFacts): CreditMigrationPlan {
  const walletOf = new Map(
    facts.owners.map((owner) => [owner.guardianId, owner])
  );
  const linksOf = linksByStudent(facts.payers);
  const families = new Map<string, PlannedFamily>();
  const notMoved: CreditMigrationNotMoved[] = [];
  for (const student of facts.students) {
    if (student.creditMinor <= 0) {
      continue;
    }
    const owner = earliestPayer(linksOf.get(student.studentId) ?? [], walletOf);
    if (owner === undefined) {
      notMoved.push(notMovedOf(student, 'no_paying_guardian'));
    } else if (facts.migratedGuardianIds.has(owner.guardianId)) {
      notMoved.push(notMovedOf(student, 'family_already_migrated'));
    } else {
      const family = families.get(owner.guardianId) ?? {
        ...owner,
        totalMinor: 0,
        children: [],
      };
      family.totalMinor += student.creditMinor;
      family.children.push(childOf(student));
      families.set(owner.guardianId, family);
    }
  }
  return {
    families: [...families.values()]
      .map((family) => ({
        ...family,
        children: family.children.toSorted(byNameThenId),
      }))
      .toSorted(
        (a, b) =>
          byText(a.guardianName, b.guardianName) ||
          byText(a.guardianId, b.guardianId)
      ),
    notMoved: notMoved.toSorted(byNameThenId),
  };
}

interface MovedFigures {
  familyCount: number;
  childCount: number;
  movedMinor: number;
}

export function movedFigures(families: readonly PlannedFamily[]): MovedFigures {
  return {
    familyCount: families.length,
    childCount: families.flatMap((family) => family.children).length,
    movedMinor: sumMinor(families.map((family) => family.totalMinor)),
  };
}

export type CreditMigrationView = Omit<CreditMigrationReport, 'currency'>;

export function reportOf(plan: CreditMigrationPlan): CreditMigrationView {
  const { familyCount, childCount, movedMinor } = movedFigures(plan.families);
  return {
    families: plan.families.map((family) => ({
      walletId: family.walletId,
      guardianName: family.guardianName,
      phone: family.phone,
      totalMinor: family.totalMinor,
      children: family.children.map(
        ({ campusId: _campusId, ...child }) => child
      ),
    })),
    notMoved: plan.notMoved,
    totals: {
      familyCount,
      childCount,
      movableMinor: movedMinor,
      notMovedMinor: sumMinor(
        plan.notMoved.map((student) => student.amountMinor)
      ),
    },
  };
}

interface ExpectedFigures {
  expectedFamilies: number;
  expectedTotalMinor: number;
}

export function matchesReviewed(
  plan: CreditMigrationPlan,
  reviewed: ExpectedFigures
): boolean {
  return (
    plan.families.length === reviewed.expectedFamilies &&
    sumMinor(plan.families.map((family) => family.totalMinor)) ===
      reviewed.expectedTotalMinor
  );
}
