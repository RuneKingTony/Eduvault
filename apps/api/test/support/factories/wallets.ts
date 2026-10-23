import type { INestApplication } from '@nestjs/common';
import type {
  FileRef,
  MoneyAccount,
  ToppedUpWallet,
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
