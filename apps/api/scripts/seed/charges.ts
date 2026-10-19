import type { INestApplicationContext } from '@nestjs/common';
import type { OrgContext } from '../../src/app/common/auth';
import { KYSELY_TOKEN, type Database } from '../../src/app/common/db/tokens';
import { BillingService } from '../../src/app/modules/billing/billing.service';
import { orgContextFor } from './actors';
import { emailOf } from './members';

const PRIMARY_TUITION = [
  8_000_000, 9_000_000, 10_000_000, 11_500_000, 12_500_000, 14_000_000,
];
const JSS_TUITION = [17_000_000, 18_000_000, 19_000_000];
const SS_TUITION = [20_000_000, 21_000_000, 22_000_000];

const TUITION_BY_LEVEL: ReadonlyMap<string, number> = new Map([
  ...PRIMARY_TUITION.map((amount, index) => [`P${index + 1}`, amount] as const),
  ...JSS_TUITION.map((amount, index) => [`JSS${index + 1}`, amount] as const),
  ...SS_TUITION.map((amount, index) => [`SS${index + 1}`, amount] as const),
]);

const PTA_MINOR = 1_000_000;
const DEVELOPMENT_MINOR = 1_600_000;
const LABORATORY_MINOR = 2_000_000;
const FEE_TYPE_CODES = {
  tuition: 4010,
  pta: 4020,
  development: 4040,
  laboratory: 4050,
};

const SIBLINGS = ['0123', '0310', '0098'];
const SCHOLAR = '0158';
const SIBLING_REASON = 'Sibling discount (3 children)';
const SCHOLARSHIP_REASON = 'Academic scholarship, top of JSS 1';

interface ChargesSeed {
  owner: OrgContext;
}

interface Level {
  id: string;
  code: string;
  name: string;
}

async function idByCode(
  db: Database,
  organizationId: string
): Promise<Map<number, string>> {
  const rows = await db
    .selectFrom('ledger_account')
    .select(['id', 'code'])
    .where('organization_id', '=', organizationId)
    .where('code', 'in', Object.values(FEE_TYPE_CODES))
    .execute();
  return new Map(rows.map((row) => [row.code, row.id]));
}

async function termsOfCurrentYear(
  db: Database,
  organizationId: string
): Promise<Map<number, string>> {
  const rows = await db
    .selectFrom('term')
    .select(['id', 'sequence'])
    .where('organization_id', '=', organizationId)
    .where(
      'session_id',
      '=',
      db
        .selectFrom('term as current')
        .select('current.session_id')
        .where('current.organization_id', '=', organizationId)
        .where('current.is_current', '=', true)
    )
    .execute();
  return new Map(rows.map((row) => [row.sequence, row.id]));
}

function linesFor(level: Level, types: Map<number, string>) {
  const tuition = TUITION_BY_LEVEL.get(level.code) ?? 0;
  const secondary = level.code.startsWith('JSS') || level.code.startsWith('SS');
  const wanted: [number, string, number][] = [
    [FEE_TYPE_CODES.tuition, `${level.name} Tuition`, tuition],
    [FEE_TYPE_CODES.pta, 'PTA fee', PTA_MINOR],
    [FEE_TYPE_CODES.development, 'Development levy', DEVELOPMENT_MINOR],
  ];
  if (secondary) {
    wanted.push([
      FEE_TYPE_CODES.laboratory,
      'Laboratory fee',
      LABORATORY_MINOR,
    ]);
  }
  return wanted.flatMap(([code, name, amountMinor]) => {
    const feeTypeId = types.get(code);
    return feeTypeId === undefined || amountMinor === 0
      ? []
      : [{ feeTypeId, name, amountMinor }];
  });
}

async function seedFeeLines(
  app: INestApplicationContext,
  seed: ChargesSeed,
  termIds: readonly string[]
) {
  const db = app.get<Database>(KYSELY_TOKEN, { strict: false });
  const [levels, types] = await Promise.all([
    db
      .selectFrom('class_level')
      .select(['id', 'code', 'name'])
      .where('organization_id', '=', seed.owner.organizationId)
      .execute(),
    idByCode(db, seed.owner.organizationId),
  ]);
  for (const termId of termIds) {
    for (const level of levels) {
      for (const line of linesFor(level, types)) {
        await db
          .insertInto('fee_line')
          .values({
            organization_id: seed.owner.organizationId,
            term_id: termId,
            class_level_id: level.id,
            ledger_account_id: line.feeTypeId,
            campus_id: null,
            name: line.name,
            amount_minor: String(line.amountMinor),
            applies_to: 'all',
            is_optional: false,
            created_by: seed.owner.user.id,
          })
          .execute();
      }
    }
  }
}

async function seedDiscounts(
  app: INestApplicationContext,
  seed: ChargesSeed,
  terms: { first: string; second: string; third: string }
) {
  const db = app.get<Database>(KYSELY_TOKEN, { strict: false });
  const { organizationId } = seed.owner;
  const [bursar, principal, tuition, students] = await Promise.all([
    orgContextFor(app, emailOf('chika')),
    orgContextFor(app, emailOf('grace')),
    idByCode(db, organizationId),
    db
      .selectFrom('student')
      .select(['id', 'admission_number'])
      .where('organization_id', '=', organizationId)
      .where(
        'admission_number',
        'in',
        [...SIBLINGS, SCHOLAR].map((number) => `GF-${number}`)
      )
      .execute(),
  ]);
  const idOf = (number: string) =>
    students.find((row) => row.admission_number === `GF-${number}`)?.id;
  const tuitionId = tuition.get(FEE_TYPE_CODES.tuition);
  const base = {
    organization_id: organizationId,
    created_by: bursar.user.id,
    ledger_account_id: tuitionId ?? null,
  };
  for (const number of SIBLINGS) {
    await db
      .insertInto('student_discount')
      .values({
        ...base,
        student_id: idOf(number) ?? '',
        kind: 'percent',
        value: '5',
        reason: SIBLING_REASON,
        from_term_id: terms.first,
        status: 'approved',
        approved_by: principal.user.id,
        approved_at: new Date(),
      })
      .execute();
  }
  await db
    .insertInto('student_discount')
    .values({
      ...base,
      student_id: idOf(SCHOLAR) ?? '',
      kind: 'percent',
      value: '50',
      reason: SCHOLARSHIP_REASON,
      from_term_id: terms.second,
      to_term_id: terms.third,
      status: 'submitted',
    })
    .execute();
}

export async function seedCharges(
  app: INestApplicationContext,
  seed: ChargesSeed
) {
  const db = app.get<Database>(KYSELY_TOKEN, { strict: false });
  const terms = await termsOfCurrentYear(db, seed.owner.organizationId);
  const [first, second, third] = [1, 2, 3].map((sequence) => {
    const id = terms.get(sequence);
    if (id === undefined) {
      throw new Error(`Seeded year has no term ${sequence}`);
    }
    return id;
  }) as [string, string, string];

  await seedFeeLines(app, seed, [first, second]);
  await seedDiscounts(app, seed, { first, second, third });
  const bursar = await orgContextFor(app, emailOf('chika'));
  const billing = app.get(BillingService, { strict: false });
  const round = await billing.prepare(bursar, {
    termId: first,
    scope: 'school',
  });
  if (round.runId === null) {
    throw new Error('The seeded first-term round charged nobody');
  }
  await billing.issue(bursar, round.runId);
}
