import type { INestApplicationContext } from '@nestjs/common';
import type { OrgContext } from '../../src/app/common/auth';
import { KYSELY_TOKEN, type Database } from '../../src/app/common/db/tokens';
import { LedgerService } from '../../src/app/modules/ledger/ledger.service';
import { MoneyAccountService } from '../../src/app/modules/money-account/money-account.service';
import { shiftDate } from './date-shift';

const GO_LIVE = '2026-09-07';

type SeedCampus = 'Lekki' | 'Ikeja';

interface SeedMoneyAccount {
  name: string;
  kind: 'bank' | 'pos' | 'cash';
  bankName?: string;
  last4?: string;
  campus: SeedCampus | null;
}

interface SeedOpeningBalance {
  studentNumber: string;
  direction: 'debt' | 'credit';
  amountMinor: number;
}

export const SEED_MONEY_ACCOUNTS: readonly SeedMoneyAccount[] = [
  {
    name: 'GTBank current',
    kind: 'bank',
    bankName: 'GTBank',
    last4: '4417',
    campus: null,
  },
  { name: 'Moniepoint POS', kind: 'pos', campus: 'Lekki' },
];

export const SEED_OPENING_BALANCES: readonly SeedOpeningBalance[] = [
  { studentNumber: '0087', direction: 'debt', amountMinor: 1_200_000 },
  { studentNumber: '0152', direction: 'credit', amountMinor: 500_000 },
  { studentNumber: '0207', direction: 'debt', amountMinor: 9_500_000 },
  { studentNumber: '0175', direction: 'debt', amountMinor: 4_200_000 },
  { studentNumber: '0034', direction: 'debt', amountMinor: 2_500_000 },
];

function openingTotal(direction: SeedOpeningBalance['direction']): number {
  let total = 0;
  for (const balance of SEED_OPENING_BALANCES) {
    if (balance.direction === direction) {
      total += balance.amountMinor;
    }
  }
  return total;
}

export const OPENING_DEBT_MINOR = openingTotal('debt');
export const OPENING_CREDIT_MINOR = openingTotal('credit');

interface FinanceSeed {
  owner: OrgContext;
  campusIds: Map<string, string>;
  school: string;
  offsetDays: number;
}

async function studentIds(
  db: Database,
  organizationId: string,
  prefix: string
): Promise<Map<string, string>> {
  const rows = await db
    .selectFrom('student')
    .select(['id', 'admission_number'])
    .where('organization_id', '=', organizationId)
    .where(
      'admission_number',
      'in',
      SEED_OPENING_BALANCES.map(
        (balance) => `${prefix}-${balance.studentNumber}`
      )
    )
    .execute();
  return new Map(rows.map((row) => [row.admission_number, row.id]));
}

export async function seedFinance(
  app: INestApplicationContext,
  { owner, campusIds, school, offsetDays }: FinanceSeed
) {
  const accounts = app.get(MoneyAccountService, { strict: false });
  for (const account of SEED_MONEY_ACCOUNTS) {
    const campusId =
      account.campus === null
        ? null
        : campusIds.get(`${school}/${account.campus}`);
    if (campusId === undefined) {
      throw new Error(`Seed has no campus ${account.campus}`);
    }
    await accounts.create(owner, {
      name: account.name,
      kind: account.kind,
      bankName: account.bankName,
      last4: account.last4,
      campusId,
    });
  }

  const db = app.get<Database>(KYSELY_TOKEN, { strict: false });
  const ids = await studentIds(db, owner.organizationId, 'GF');
  const effectiveOn = shiftDate(GO_LIVE, offsetDays);
  await app.get(LedgerService, { strict: false }).postOpening(owner, {
    items: SEED_OPENING_BALANCES.map((balance) => {
      const studentId = ids.get(`GF-${balance.studentNumber}`);
      if (studentId === undefined) {
        throw new Error(`Seed has no student ${balance.studentNumber}`);
      }
      return {
        studentId,
        amountMinor: balance.amountMinor,
        direction: balance.direction,
        memo: 'Carried over from last term',
        effectiveOn,
      };
    }),
    moneyAccounts: [],
  });
}
