import type { INestApplication } from '@nestjs/common';
import type {
  FileRef,
  MoneyAccount,
  RequestedWalletCancellation,
  RequestedWalletRefund,
  ToppedUpWallet,
  WalletCancellationRequest,
  WalletRefundRequest,
} from '@eduvault/api-contract';
import type { Pool } from 'pg';
import type { Fixtures, TestUser } from '../base-test';
import { createMoneyAccount } from './finance';
import { PDF_BYTES, nextReference } from './payments';

type Api = Fixtures['api'];

export async function walletIdOf(
  pool: Pool,
  guardianId: string
): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    'SELECT id FROM wallet WHERE guardian_id = $1',
    [guardianId]
  );
  const [row] = rows;
  if (row === undefined) {
    throw new Error(`No wallet for guardian ${guardianId}`);
  }
  return row.id;
}

export async function uploadWalletProof(
  api: Api,
  actor: Pick<TestUser, 'cookie'>,
  bytes: Buffer = PDF_BYTES
): Promise<FileRef> {
  const res = await api(actor)
    .post('/files')
    .field('kind', 'wallet_proof')
    .attach('file', bytes, { filename: 'receipt.pdf' })
    .expect(201);
  return res.body as FileRef;
}

export async function cashAccount(
  app: INestApplication,
  owner: TestUser,
  campusId: string | null = null
): Promise<MoneyAccount> {
  return createMoneyAccount(app, owner, {
    name: `Front desk ${nextReference('ACC')}`,
    kind: 'cash',
    campusId,
  });
}

interface TopUpInput {
  accountId: string;
  amountMinor?: number;
  reference?: string;
  receivedOn?: string;
  depositorName?: string;
  proofFileId?: string;
}

export async function topUpBody(
  api: Api,
  actor: Pick<TestUser, 'cookie'>,
  input: TopUpInput
) {
  const proofFileId =
    input.proofFileId ?? (await uploadWalletProof(api, actor)).id;
  return {
    reference: input.reference ?? nextReference('CSH'),
    moneyAccountId: input.accountId,
    method: 'cash',
    amountMinor: input.amountMinor ?? 5_000_000,
    receivedOn: input.receivedOn ?? '2026-10-07',
    ...(input.depositorName === undefined
      ? {}
      : { depositorName: input.depositorName }),
    proofFileId,
  };
}

interface WalletTopUp extends TopUpInput {
  walletId: string;
}

interface TopUpAttempt extends WalletTopUp {
  status: number;
  uploadedBy?: Pick<TestUser, 'cookie'>;
}

/** The body is built first: supertest closes the shared server when the upload inside `topUpBody` ends, which would cut a request already opened. */
export async function postTopUp(
  api: Api,
  actor: Pick<TestUser, 'cookie'>,
  attempt: TopUpAttempt
) {
  const { walletId, status, uploadedBy, ...input } = attempt;
  const body = await topUpBody(api, uploadedBy ?? actor, input);
  return api(actor)
    .post(`/finance/wallets/${walletId}/top-ups`)
    .send(body)
    .expect(status);
}

export async function topUpWallet(
  api: Api,
  actor: Pick<TestUser, 'cookie'>,
  request: WalletTopUp
): Promise<ToppedUpWallet> {
  const res = await postTopUp(api, actor, { ...request, status: 201 });
  return res.body as ToppedUpWallet;
}

export async function uploadRefundEmail(
  api: Api,
  actor: Pick<TestUser, 'cookie'>,
  bytes: Buffer = PDF_BYTES
): Promise<FileRef> {
  const res = await api(actor)
    .post('/files')
    .field('kind', 'wallet_refund_request')
    .attach('file', bytes, { filename: 'parent-email.pdf' })
    .expect(201);
  return res.body as FileRef;
}

interface RefundInput {
  accountId: string;
  amountMinor?: number;
  reference?: string;
  reason?: string;
  parentEmail?: string;
  proofFileId?: string;
}

async function refundBody(
  api: Api,
  actor: Pick<TestUser, 'cookie'>,
  input: RefundInput
) {
  const proofFileId =
    input.proofFileId ?? (await uploadRefundEmail(api, actor)).id;
  return {
    reference: input.reference ?? nextReference('WRQ'),
    moneyAccountId: input.accountId,
    amountMinor: input.amountMinor ?? 1_500_000,
    parentEmail: input.parentEmail ?? 'ada.parent@example.com',
    reason: input.reason ?? 'Paid twice by mistake',
    proofFileId,
  };
}

interface RefundAttempt extends RefundInput {
  walletId: string;
  status: number;
  uploadedBy?: Pick<TestUser, 'cookie'>;
}

/** The body is built first: supertest closes the shared server when the upload inside `refundBody` ends. */
export async function postRefund(
  api: Api,
  actor: Pick<TestUser, 'cookie'>,
  attempt: RefundAttempt
) {
  const { walletId, status, uploadedBy, ...input } = attempt;
  const body = await refundBody(api, uploadedBy ?? actor, input);
  return api(actor)
    .post(`/finance/wallets/${walletId}/refunds`)
    .send(body)
    .expect(status);
}

export async function requestRefund(
  api: Api,
  actor: Pick<TestUser, 'cookie'>,
  request: Omit<RefundAttempt, 'status'>
): Promise<RequestedWalletRefund> {
  const res = await postRefund(api, actor, { ...request, status: 201 });
  return res.body as RequestedWalletRefund;
}

interface CancellationAttempt {
  walletId: string;
  topUpId: string;
  reference?: string;
  reason?: string;
  status: number;
}

export function postCancellation(
  api: Api,
  actor: Pick<TestUser, 'cookie'>,
  attempt: CancellationAttempt
) {
  return api(actor)
    .post(
      `/finance/wallets/${attempt.walletId}/top-ups/${attempt.topUpId}/cancellations`
    )
    .send({
      reference: attempt.reference ?? nextReference('WTQ'),
      reason: attempt.reason ?? 'Keyed against the wrong family',
    })
    .expect(attempt.status);
}

export async function requestCancellation(
  api: Api,
  actor: Pick<TestUser, 'cookie'>,
  request: Omit<CancellationAttempt, 'status'>
): Promise<RequestedWalletCancellation> {
  const res = await postCancellation(api, actor, { ...request, status: 201 });
  return res.body as RequestedWalletCancellation;
}

export async function approveRefundRequest(
  api: Api,
  actor: Pick<TestUser, 'cookie'>,
  request: { id: string; payoutReference?: string }
): Promise<WalletRefundRequest> {
  const res = await api(actor)
    .post(`/finance/wallet-refunds/${request.id}/approve`)
    .send({ payoutReference: request.payoutReference ?? nextReference('NIP') })
    .expect(200);
  return res.body as WalletRefundRequest;
}

export async function approveCancellationRequest(
  api: Api,
  actor: Pick<TestUser, 'cookie'>,
  id: string
): Promise<WalletCancellationRequest> {
  const res = await api(actor)
    .post(`/finance/wallet-topup-cancellations/${id}/approve`)
    .expect(200);
  return res.body as WalletCancellationRequest;
}
