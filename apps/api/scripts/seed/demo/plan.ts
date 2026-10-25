import type { DemoSize } from './config';
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
  type SubjectAssignment,
} from './people-plan';
import { createRandom } from './prng';

const DEMO_SEED = 0x52_56_53_44;

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
}

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
  };
}
