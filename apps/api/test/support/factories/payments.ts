import type { INestApplication } from '@nestjs/common';
import type {
  FileRef,
  MoneyAccount,
  Payment,
  RecordedPayment,
} from '@eduvault/api-contract';
import type { Fixtures, TestUser } from '../base-test';
import { createMoneyAccount, importOpening } from './finance';

type Api = Fixtures['api'];

export const PDF_BYTES = Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n');

let sequence = 0;

export const nextReference = (prefix = 'TRF'): string => {
  sequence += 1;
  return `${prefix}-20261007-${String(sequence).padStart(6, '0')}`;
};

export async function bankAccount(
  app: INestApplication,
  owner: TestUser,
  campusId: string | null = null
): Promise<MoneyAccount> {
  return createMoneyAccount(app, owner, {
    name: `GTBank ${nextReference('ACC')}`,
    kind: 'bank',
    bankName: 'GTBank',
    last4: '4417',
    campusId,
  });
}

export async function uploadProof(
  api: Api,
  actor: TestUser,
  bytes: Buffer = PDF_BYTES
): Promise<FileRef> {
  const res = await api(actor)
    .post('/files')
    .field('kind', 'payment_proof')
    .attach('file', bytes, { filename: 'alert.pdf' })
    .expect(201);
  return res.body as FileRef;
}

export async function owes(
  app: INestApplication,
  owner: TestUser,
  debt: { studentId: string; amountMinor: number }
): Promise<void> {
  await importOpening(app, owner, {
    items: [
      {
        ...debt,
        direction: 'debt',
        effectiveOn: '2026-09-01',
      },
    ],
  });
}

interface CashPayment {
  accountId: string;
  allocations: { studentId: string; amountMinor: number }[];
  reference?: string;
  payerName?: string;
  paidOn?: string;
  providerReference?: string;
}

export const cashBody = (input: CashPayment) => ({
  reference: input.reference ?? nextReference('CSH'),
  payerName: input.payerName ?? 'Mrs Ojo',
  moneyAccountId: input.accountId,
  method: 'cash',
  amountMinor: input.allocations.reduce((sum, row) => sum + row.amountMinor, 0),
  paidOn: input.paidOn ?? '2026-10-07',
  allocations: input.allocations,
  ...(input.providerReference === undefined
    ? {}
    : { providerReference: input.providerReference }),
});

export async function recordCash(
  api: Api,
  actor: TestUser,
  input: CashPayment
): Promise<RecordedPayment> {
  const res = await api(actor)
    .post('/finance/payments')
    .send(cashBody(input))
    .expect(201);
  return res.body as RecordedPayment;
}

export async function receiptOf(
  api: Api,
  actor: TestUser,
  id: string
): Promise<Payment> {
  return (await api(actor).get(`/finance/payments/${id}`).expect(200))
    .body as Payment;
}
