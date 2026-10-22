import type { INestApplicationContext } from '@nestjs/common';
import type { OrgContext } from '../../src/app/common/auth';
import { KYSELY_TOKEN, type Database } from '../../src/app/common/db/tokens';
import { AdjustmentService } from '../../src/app/modules/adjustment/adjustment.service';
import { PaymentVoidService } from '../../src/app/modules/payment/payment-void.service';
import { PaymentService } from '../../src/app/modules/payment/payment.service';
import { orgContextFor } from './actors';
import { emailOf } from './members';

export const SEED_PAYMENT_MINOR = 2_000_000;

const PAYMENT_STUDENT = 'GF-0170';
const WRITE_OFF_STUDENT = 'GF-0087';
const WRITE_OFF_MINOR = 1_200_000;

interface ApprovalsSeed {
  owner: OrgContext;
  today: string;
}

async function studentId(
  db: Database,
  organizationId: string,
  admissionNumber: string
): Promise<string> {
  const row = await db
    .selectFrom('student')
    .select('id')
    .where('organization_id', '=', organizationId)
    .where('admission_number', '=', admissionNumber)
    .executeTakeFirstOrThrow();
  return row.id;
}

async function seedWaitingCancellation(
  app: INestApplicationContext,
  seed: ApprovalsSeed,
  bursar: OrgContext
) {
  const db = app.get<Database>(KYSELY_TOKEN, { strict: false });
  const { organizationId } = seed.owner;
  const [account, student] = await Promise.all([
    db
      .selectFrom('money_account')
      .select('id')
      .where('organization_id', '=', organizationId)
      .where('name', '=', 'GTBank current')
      .executeTakeFirstOrThrow(),
    studentId(db, organizationId, PAYMENT_STUDENT),
  ]);
  const payment = await app
    .get(PaymentService, { strict: false })
    .record(bursar, {
      reference: `CSH-${seed.today.replaceAll('-', '')}-DANJUMA`,
      payerName: 'Mrs Danjuma',
      moneyAccountId: account.id,
      method: 'cash',
      providerReference: undefined,
      amountMinor: SEED_PAYMENT_MINOR,
      paidOn: seed.today,
      allocations: [{ studentId: student, amountMinor: SEED_PAYMENT_MINOR }],
    });
  await app
    .get(PaymentVoidService, { strict: false })
    .request(bursar, payment.id, {
      reason: 'Keyed against the wrong child. Please cancel the receipt.',
    });
}

async function seedCorrections(
  app: INestApplicationContext,
  seed: ApprovalsSeed,
  people: { bursar: OrgContext; principal: OrgContext }
) {
  const db = app.get<Database>(KYSELY_TOKEN, { strict: false });
  const adjustments = app.get(AdjustmentService, { strict: false });
  const { organizationId } = seed.owner;
  const [ada, daniel, bola] = await Promise.all(
    ['GF-0123', 'GF-0175', WRITE_OFF_STUDENT].map((number) =>
      studentId(db, organizationId, number)
    )
  );
  const first = await adjustments.create(people.bursar, {
    kind: 'credit_note',
    studentId: ada ?? '',
    amountMinor: 1_000_000,
    reason: 'Late enrolment',
  });
  await adjustments.decline(
    people.principal,
    first.adjustment.id,
    'Not agreed with the owner'
  );
  const second = await adjustments.create(people.bursar, {
    kind: 'write_off',
    studentId: daniel ?? '',
    amountMinor: 500_000,
    reason: 'Family asked us to forgive the levy',
  });
  await adjustments.decline(
    people.principal,
    second.adjustment.id,
    'Ask the family to pay in instalments first'
  );
  await adjustments.create(people.bursar, {
    kind: 'write_off',
    studentId: bola ?? '',
    amountMinor: WRITE_OFF_MINOR,
    reason: 'Family moved to Abuja; the balance will not be paid',
  });
}

export async function seedApprovals(
  app: INestApplicationContext,
  seed: ApprovalsSeed
) {
  const [bursar, principal] = await Promise.all([
    orgContextFor(app, emailOf('chika')),
    orgContextFor(app, emailOf('grace')),
  ]);
  await seedWaitingCancellation(app, seed, bursar);
  await seedCorrections(app, seed, { bursar, principal });
}
