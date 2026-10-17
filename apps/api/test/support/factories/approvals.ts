import type {
  Adjustment,
  CreateAdjustmentInput,
  CreateStudentDiscountInput,
  CreatedAdjustment,
  CreatedStudentDiscount,
  PaymentVoidItem,
  RequestedPaymentVoid,
  StudentDiscount,
} from '@eduvault/api-contract';
import type { Pool } from 'pg';
import type { Fixtures, TestUser } from '../base-test';
import { importOpening } from './finance';

type Api = Fixtures['api'];

export async function askVoid(
  api: Api,
  actor: TestUser,
  receipt: string | { id: string; reason: string }
): Promise<RequestedPaymentVoid> {
  const { id, reason } =
    typeof receipt === 'string'
      ? { id: receipt, reason: 'Keyed against the wrong child' }
      : receipt;
  return (
    await api(actor)
      .post(`/finance/payments/${id}/void-requests`)
      .send({ reason })
      .expect(201)
  ).body as RequestedPaymentVoid;
}

export async function approveVoid(
  api: Api,
  actor: TestUser,
  id: string
): Promise<PaymentVoidItem> {
  return (
    await api(actor).post(`/finance/payment-voids/${id}/approve`).expect(200)
  ).body as PaymentVoidItem;
}

export async function askAdjustment(
  api: Api,
  actor: TestUser,
  body: CreateAdjustmentInput
): Promise<CreatedAdjustment> {
  const res = await api(actor).post('/finance/adjustments').send(body);
  if (res.status !== 201) {
    throw new Error(`${res.status} ${JSON.stringify(res.body)}`);
  }
  return res.body as CreatedAdjustment;
}

export async function approveAdjustment(
  api: Api,
  actor: TestUser,
  id: string
): Promise<Adjustment> {
  return (
    await api(actor).post(`/finance/adjustments/${id}/approve`).expect(200)
  ).body as Adjustment;
}

export async function askDiscount(
  api: Api,
  actor: TestUser,
  body: CreateStudentDiscountInput
): Promise<CreatedStudentDiscount> {
  return (await api(actor).post('/finance/discounts').send(body).expect(201))
    .body as CreatedStudentDiscount;
}

export async function approveDiscount(
  api: Api,
  actor: TestUser,
  id: string
): Promise<StudentDiscount> {
  return (await api(actor).post(`/finance/discounts/${id}/approve`).expect(200))
    .body as StudentDiscount;
}

export async function switchApproval(
  api: Api,
  owner: TestUser,
  change: Record<string, boolean>
): Promise<void> {
  await api(owner)
    .patch('/school-settings/approval-rules')
    .send(change)
    .expect(200);
}

export async function entryCount(
  pool: Pool,
  organizationId: string,
  reference: string
): Promise<number> {
  const { rows } = await pool.query<{ n: string }>(
    `SELECT count(*)::text AS n FROM journal_entry
     WHERE organization_id = $1 AND reference = $2`,
    [organizationId, reference]
  );
  return Number(rows[0]?.n ?? 0);
}

export async function holdCredit(
  app: Parameters<typeof importOpening>[0],
  owner: TestUser,
  credit: { studentId: string; amountMinor: number }
): Promise<void> {
  await importOpening(app, owner, {
    items: [{ ...credit, direction: 'credit', effectiveOn: '2026-09-01' }],
  });
}
