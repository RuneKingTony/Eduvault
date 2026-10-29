import {
  planWalletRequests,
  type WalletRequestPlan,
} from './wallet-requests-plan';
import type { DemoCampus, DemoSize } from './config';
import {
  emptyApprovalsPlan,
  planDiscounts,
  planMoneyApprovals,
  type ApprovalsPlan,
} from './approvals-plan';
import {
  planPayments,
  planWallets,
  type FamilyPayment,
  type WalletPlan,
} from './money-plan';
import {
  buildArms,
  buildFamilies,
  buildLeaders,
  buildTeachers,
  EMAIL_DOMAIN,
  payerOf,
  planSubjectTeachers,
  type DemoArm,
  type DemoFamily,
  type DemoStaff,
  type DemoTeacher,
  type FamilyNumber,
  type StudentNumber,
  type SubjectAssignment,
} from './people-plan';
import { createRandom, type Random } from './prng';
import {
  DEMO_ANNOUNCEMENTS,
  emptyStudentLife,
  planLeave,
  planStudentLife,
  type AnnouncementPlan,
  type LeavePlan,
  type StudentLifePlan,
} from './school-life-plan';
import {
  emptyStorePlan,
  planStore,
  type Buyer,
  type StorePlan,
} from './store-plan';

export const DEMO_SEED = 0x52_56_53_44;
const FINAL_YEAR_LEVEL = 'SS3';

export interface DemoPlan {
  size: DemoSize;
  today: string;
  arms: DemoArm[];
  leaders: DemoStaff[];
  teachers: DemoTeacher[];
  subjectTeachers: SubjectAssignment[];
  families: DemoFamily[];
  payments: FamilyPayment[];
  wallets: WalletPlan[];
  walletRequests: WalletRequestPlan[];
  store: StorePlan;
  approvals: ApprovalsPlan;
  announcements: AnnouncementPlan[];
  leave: LeavePlan[];
  studentLife: StudentLifePlan;
}

export const withoutSchoolActivity = (plan: DemoPlan): DemoPlan => ({
  ...plan,
  walletRequests: [],
  store: emptyStorePlan(),
  approvals: emptyApprovalsPlan(),
  announcements: [],
  leave: [],
  studentLife: emptyStudentLife(),
});

const slug = (name: string): string =>
  name.toLowerCase().replaceAll(/[^a-z]+/g, '.');

/** The wallet sample signs in with an email; the family number keeps a repeated name unique. */
function withSampleEmails(
  families: readonly DemoFamily[],
  wallets: readonly WalletPlan[]
): DemoFamily[] {
  const sample = new Set(wallets.map((wallet) => wallet.family));
  const used = new Set<string>();
  return families.map((family) => {
    if (!sample.has(family.number)) {
      return family;
    }
    const payer = payerOf(family);
    let email = `${slug(payer.fullName)}@${EMAIL_DOMAIN}`;
    if (used.has(email)) {
      email = `${slug(payer.fullName)}.${family.number}@${EMAIL_DOMAIN}`;
    }
    used.add(email);
    return {
      ...family,
      guardians: family.guardians.map((guardian) =>
        guardian === payer ? { ...guardian, email } : guardian
      ),
    };
  });
}

interface PlannedChild {
  number: StudentNumber;
  family: FamilyNumber;
  campus: DemoCampus;
  levelCode: string;
}

const childrenOf = (families: readonly DemoFamily[]): PlannedChild[] =>
  families.flatMap((family) =>
    family.children.map((child) => ({
      number: child.number,
      family: family.number,
      campus: family.campus,
      levelCode: child.level.code,
    }))
  );

interface SchoolActivity {
  store: StorePlan;
  approvals: ApprovalsPlan;
  studentLife: StudentLifePlan;
}

/** All new draws come after the wallets, so the school itself never changes. */
function planActivity(
  families: readonly DemoFamily[],
  options: {
    payments: readonly FamilyPayment[];
    wallets: readonly WalletPlan[];
    random: Random;
  }
): SchoolActivity {
  const { wallets, random } = options;
  const children = childrenOf(families);
  const walletFamilies = new Set(wallets.map((row) => row.family));
  const money = planMoneyApprovals(families, options);
  const adjusted = new Set(money.adjustments.map((row) => row.student));
  const voided = new Set(money.voids.map((row) => row.family));
  const free = children.filter(
    (row) =>
      !walletFamilies.has(row.family) &&
      !voided.has(row.family) &&
      !adjusted.has(row.number)
  );
  const studentLife = planStudentLife({
    pool: free
      .filter((row) => row.levelCode !== FINAL_YEAR_LEVEL)
      .map((row) => row.number),
    finalYear: free
      .filter((row) => row.levelCode === FINAL_YEAR_LEVEL)
      .map((row) => row.number),
    random,
  });
  const away = new Set(
    [...studentLife.inactive, ...studentLife.away, ...studentLife.left].map(
      (row) => row.student
    )
  );
  const resting = new Set([...away, ...studentLife.graduated]);
  const discounts = planDiscounts(
    children.filter((row) => !resting.has(row.number)).map((row) => row.number),
    random
  );
  const buyers: Buyer[] = random.shuffle(
    children
      .filter(
        (row) => !walletFamilies.has(row.family) && !resting.has(row.number)
      )
      .map((row) => ({
        student: row.number,
        campus: row.campus,
        levelCode: row.levelCode,
      }))
  );
  return {
    store: planStore(buyers, random),
    approvals: { ...money, discounts },
    studentLife,
  };
}

export function buildDemoPlan(size: DemoSize, today: string): DemoPlan {
  const random = createRandom(DEMO_SEED);
  const arms = buildArms();
  const teachers = buildTeachers(size.teachers, random);
  const built = buildFamilies(size.students, { today, random });
  const payments = planPayments(built, random);
  const wallets = planWallets(built, payments, {
    students: size.students,
    random,
  });
  const activity = planActivity(built, { payments, wallets, random });
  return {
    size,
    today,
    arms,
    leaders: buildLeaders(),
    teachers,
    subjectTeachers: planSubjectTeachers(teachers, arms),
    families: withSampleEmails(built, wallets),
    payments,
    wallets,
    walletRequests: planWalletRequests(wallets),
    ...activity,
    announcements: [...DEMO_ANNOUNCEMENTS],
    leave: planLeave(teachers, today),
  };
}
