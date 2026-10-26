import { createHmac } from 'node:crypto';
import {
  WALLET_CANCEL_ONLINE_MESSAGE,
  WALLET_NOT_FOUND_MESSAGE,
  WALLET_REFERENCE_TAKEN_MESSAGE,
  WALLET_REFUND_PROOF_DENIED_MESSAGE,
  WALLET_REFUND_PROOF_TAKEN_MESSAGE,
  WALLET_REQUEST_NOT_FOUND_MESSAGE,
  walletCancelOverMessage,
  walletRefundOverMessage,
  walletSpendOverMessage,
  type ApprovalSummary,
  type RefundOptions,
  type RequestedWalletCancellation,
  type RequestedWalletRefund,
  type SpentWallet,
  type Wallet,
  type WalletList,
  type WalletMovementList,
  type WalletRequestList,
} from '@eduvault/api-contract';
import type { Pool } from 'pg';
import { reservedAccountReference } from '../src/app/modules/gateway/reserved-account.service';
import { acting, expect, type Fixtures } from './support/base-test';
import { receivableBalance } from './support/factories/billing';
import {
  bankAccount,
  nextReference,
  owes,
  PDF_BYTES,
} from './support/factories/payments';
import {
  approveCancellationRequest,
  approveRefundRequest,
  cashAccount,
  postCancellation,
  postRefund,
  requestCancellation,
  requestRefund,
  topUpWallet,
  uploadRefundEmail,
  walletIdOf,
} from './support/factories/wallets';
import { family, signInAs } from './support/portal';
import { schoolsTest as test, type twoSchools } from './support/two-schools';

type Api = Fixtures['api'];
type Signed = Parameters<Api>[0];

const TOP_UP = 5_000_000;
const OWED = 2_000_000;

const KEYS = {
  mode: 'sandbox',
  contractCode: '2957982769',
  apiKey: 'MK_TEST_APIKEY0001',
  secretKey: 'SECRET-OF-SCHOOL-A-0001',
} as const;
const MONNIFY_REFERENCE = 'MNFY|20|20261024120000|000001';

const WALLET_REQUEST_ROUTES = [
  ['get', '/finance/wallets/refund-options'],
  ['get', '/finance/wallet-requests'],
  ['post', '/finance/wallets/x/refunds'],
  ['post', '/finance/wallets/x/top-ups/y/cancellations'],
  ['post', '/finance/wallet-refunds/x/approve'],
  ['post', '/finance/wallet-refunds/x/decline'],
  ['post', '/finance/wallet-topup-cancellations/x/approve'],
  ['post', '/finance/wallet-topup-cancellations/x/decline'],
] as const;

type Schools = Awaited<ReturnType<typeof twoSchools>>;

const byText = (a: string, b: string) => a.localeCompare(b);

const decisionsOn = (refundId: string, cancellationId: string) => [
  {
    path: `/finance/wallet-refunds/${refundId}/approve`,
    body: { payoutReference: 'NIP-1' },
  },
  {
    path: `/finance/wallet-refunds/${refundId}/decline`,
    body: { reason: 'No' },
  },
  {
    path: `/finance/wallet-topup-cancellations/${cancellationId}/approve`,
    body: {},
  },
  {
    path: `/finance/wallet-topup-cancellations/${cancellationId}/decline`,
    body: { reason: 'No' },
  },
];

async function ready({
  api,
  app,
  pool,
  withPermissions,
  schools,
}: Pick<Fixtures, 'api' | 'app' | 'pool' | 'withPermissions'> & {
  schools: Schools;
}) {
  const { owner, orgA } = schools;
  const { ada, guardianLogin } = await family(app, schools);
  await owes(app, owner, { studentId: ada.id, amountMinor: OWED });
  const walletId = await walletIdOf(pool, guardianLogin?.guardianId ?? '');
  const cash = await cashAccount(app, owner);
  const bank = await bankAccount(app, owner);
  const bursar = await withPermissions(orgA, [
    'wallet:read',
    'wallet:topUp',
    'wallet:requestRefund',
    'campus:readAll',
  ]);
  const principal = await withPermissions(orgA, [
    'wallet:read',
    'wallet:approveRefund',
    'campus:readAll',
  ]);
  const topUp = await topUpWallet(api, owner, {
    walletId,
    accountId: cash.id,
    amountMinor: TOP_UP,
  });
  return {
    ada,
    guardianLogin,
    walletId,
    cash,
    bank,
    bursar,
    principal,
    topUp,
    topUpId: topUp.id,
  };
}

const walletOf = async (api: Api, actor: Signed, walletId: string) =>
  (await api(actor).get(`/finance/wallets/${walletId}`).expect(200))
    .body as Wallet;

const scalar = async (pool: Pool, sql: string, values: unknown[] = []) =>
  Number(
    (await pool.query<{ n: string }>(sql, values)).rows[0]?.n ?? Number.NaN
  );

const entryCount = (pool: Pool, kind: string) =>
  scalar(
    pool,
    `SELECT count(*)::text AS n FROM journal_entry WHERE kind = $1`,
    [kind]
  );

const fingerprint = async (pool: Pool, reference: string) =>
  (
    await pool.query<{ fingerprint: string }>(
      `SELECT md5(
         (SELECT row_to_json(e)::text FROM journal_entry e WHERE e.reference = $1)
         || (SELECT COALESCE(string_agg(row_to_json(l)::text, '|' ORDER BY l.id), '')
             FROM journal_line l JOIN journal_entry e ON e.id = l.entry_id
             WHERE e.reference = $1)
       ) AS fingerprint`,
      [reference]
    )
  ).rows[0]?.fingerprint ?? '';

interface EntryLine {
  system_key: string | null;
  debit_minor: number;
  credit_minor: number;
  family_id: string | null;
  campus_id: string | null;
}

const entryOf = async (pool: Pool, reference: string) => {
  const { rows } = await pool.query<{
    id: string;
    kind: string;
    reverses_entry_id: string | null;
    posted_by: string | null;
    source_id: string | null;
  }>(
    `SELECT id, kind, reverses_entry_id, posted_by, source_id
     FROM journal_entry WHERE reference = $1`,
    [reference]
  );
  const [entry] = rows;
  if (entry === undefined) {
    return entry;
  }
  const lines = await pool.query<EntryLine>(
    `SELECT la.system_key, jl.debit_minor::int, jl.credit_minor::int,
            jl.family_id, jl.campus_id
     FROM journal_line jl JOIN ledger_account la ON la.id = jl.ledger_account_id
     WHERE jl.entry_id = $1
     ORDER BY (la.system_key IS NULL), la.system_key`,
    [entry.id]
  );
  return { ...entry, lines: lines.rows };
};

async function movementsAddUp(api: Api, actor: Signed, walletId: string) {
  const movements = (
    await api(actor)
      .get(`/finance/wallets/${walletId}/movements?pageSize=50`)
      .expect(200)
  ).body as WalletMovementList;
  const wallet = await walletOf(api, actor, walletId);
  expect(
    movements.items.reduce((total, row) => total + row.amountMinor, 0)
  ).toBe(wallet.balanceMinor);
  return movements;
}

test.describe('asking for a refund', () => {
  test('holds the money without posting anything: the balance stays, free money falls and the wallet and list show it', async ({
    api,
    app,
    pool,
    withPermissions,
    schools,
  }) => {
    const { owner } = schools;
    const { walletId, bank, bursar } = await ready({
      api,
      app,
      pool,
      withPermissions,
      schools,
    });
    const before = await entryCount(pool, 'wallet_refund');

    const made = (
      await requestRefund(api, bursar, {
        walletId,
        accountId: bank.id,
        amountMinor: 1_500_000,
      })
    ).request;

    expect(made).toMatchObject({
      kind: 'wallet_refund',
      status: 'submitted',
      amountMinor: 1_500_000,
      parentEmail: 'ada.parent@example.com',
      payoutReference: null,
    });
    expect(await entryCount(pool, 'wallet_refund')).toBe(before);
    expect(await walletOf(api, bursar, walletId)).toMatchObject({
      balanceMinor: TOP_UP,
      heldMinor: 1_500_000,
      freeMinor: TOP_UP - 1_500_000,
    });
    const list = (await api(owner).get('/finance/wallets').expect(200))
      .body as WalletList;
    expect(list.totals).toMatchObject({
      heldMinor: 1_500_000,
      freeMinor: TOP_UP - 1_500_000,
    });
    expect(list.items.find((item) => item.id === walletId)).toMatchObject({
      heldMinor: 1_500_000,
    });
    await movementsAddUp(api, bursar, walletId);
  });

  test('refuses more than the free money with 422 naming the most, and counts what is already held', async ({
    api,
    app,
    pool,
    withPermissions,
    schools,
  }) => {
    const { walletId, bank, bursar } = await ready({
      api,
      app,
      pool,
      withPermissions,
      schools,
    });
    const refused = await postRefund(api, bursar, {
      walletId,
      accountId: bank.id,
      amountMinor: TOP_UP + 1,
      status: 422,
    });
    expect(refused.body.message).toBe(walletRefundOverMessage(TOP_UP));
    await requestRefund(api, bursar, {
      walletId,
      accountId: bank.id,
      amountMinor: 4_000_000,
    });
    const second = await postRefund(api, bursar, {
      walletId,
      accountId: bank.id,
      amountMinor: 1_000_001,
      status: 422,
    });
    expect(second.body.message).toBe(walletRefundOverMessage(1_000_000));
    expect(
      await scalar(pool, 'SELECT count(*)::text AS n FROM wallet_refund')
    ).toBe(1);
  });

  test('blocks a guardian spend and a set-aside beyond the free money until the request is declined', async ({
    api,
    app,
    pool,
    withPermissions,
    schools,
  }) => {
    const { ada, guardianLogin, walletId, bank, bursar, principal } =
      await ready({ api, app, pool, withPermissions, schools });
    const guardian = await signInAs(api, guardianLogin);
    const request = (
      await requestRefund(api, bursar, {
        walletId,
        accountId: bank.id,
        amountMinor: 4_500_000,
      })
    ).request;
    const spend = {
      reference: nextReference('WSP'),
      lines: [{ studentId: ada.id, amountMinor: 600_000 }],
    };

    const refused = await api(guardian)
      .post('/portal/wallet/spend')
      .send(spend)
      .expect(422);
    expect(refused.body.message).toBe(
      walletSpendOverMessage('Ada Okeke', 500_000)
    );
    await api(guardian)
      .post('/portal/wallet/earmarks')
      .send({
        reference: nextReference('WSA'),
        studentId: ada.id,
        amountMinor: 500_001,
      })
      .expect(422);

    await api(principal)
      .post(`/finance/wallet-refunds/${request.id}/decline`)
      .send({ reason: 'The payment was not a mistake' })
      .expect(200);
    const spent = (
      await api(guardian).post('/portal/wallet/spend').send(spend).expect(201)
    ).body as SpentWallet;
    expect(spent.wallet).toMatchObject({
      heldMinor: 0,
      balanceMinor: TOP_UP - 600_000,
    });
    expect(await receivableBalance(pool, schools.orgA.id, ada.id)).toBe(
      OWED - 600_000
    );
  });

  test('answers the same request again with 200 replayed, holds once and refuses another body on the reference', async ({
    api,
    app,
    pool,
    withPermissions,
    schools,
  }) => {
    const { walletId, bank, bursar } = await ready({
      api,
      app,
      pool,
      withPermissions,
      schools,
    });
    const reference = nextReference('WRQ');
    const first = await requestRefund(api, bursar, {
      walletId,
      accountId: bank.id,
      reference,
    });
    const again = await postRefund(api, bursar, {
      walletId,
      accountId: bank.id,
      reference,
      status: 200,
    });
    expect((again.body as RequestedWalletRefund).replayed).toBe(true);
    expect((again.body as RequestedWalletRefund).request.id).toBe(
      first.request.id
    );
    const clash = await postRefund(api, bursar, {
      walletId,
      accountId: bank.id,
      reference,
      amountMinor: 1000,
      status: 409,
    });
    expect(clash.body.message).toBe(WALLET_REFERENCE_TAKEN_MESSAGE);
    expect(
      await scalar(pool, 'SELECT count(*)::text AS n FROM wallet_refund')
    ).toBe(1);
    expect((await walletOf(api, bursar, walletId)).heldMinor).toBe(1_500_000);
  });

  test('takes a bank account only, and keeps the parent’s email with one request', async ({
    api,
    app,
    pool,
    withPermissions,
    schools,
  }) => {
    const { walletId, cash, bank, bursar } = await ready({
      api,
      app,
      pool,
      withPermissions,
      schools,
    });
    await postRefund(api, bursar, {
      walletId,
      accountId: cash.id,
      status: 400,
    });
    const options = (
      await api(bursar).get('/finance/wallets/refund-options').expect(200)
    ).body as RefundOptions;
    expect(options.accounts.map((account) => account.id)).toEqual([bank.id]);

    const email = await uploadRefundEmail(api, bursar);
    await requestRefund(api, bursar, {
      walletId,
      accountId: bank.id,
      amountMinor: 500_000,
      proofFileId: email.id,
    });
    const reused = await postRefund(api, bursar, {
      walletId,
      accountId: bank.id,
      amountMinor: 500_000,
      proofFileId: email.id,
      status: 409,
    });
    expect(reused.body.message).toBe(WALLET_REFUND_PROOF_TAKEN_MESSAGE);
  });
});

test.describe('deciding a refund', () => {
  test('approving posts one balanced entry that takes the money out of the wallet and the bank account, and keeps the top-up entry as it was', async ({
    api,
    app,
    pool,
    withPermissions,
    schools,
  }) => {
    const { owner } = schools;
    const { guardianLogin, walletId, bank, bursar, principal, topUp } =
      await ready({ api, app, pool, withPermissions, schools });
    const topUpBefore = await fingerprint(pool, topUp.reference);
    const request = (
      await requestRefund(api, bursar, {
        walletId,
        accountId: bank.id,
        amountMinor: 1_500_000,
      })
    ).request;

    const approved = await approveRefundRequest(api, principal, {
      id: request.id,
      payoutReference: 'NIP-8841',
    });

    expect(approved).toMatchObject({
      status: 'approved',
      payoutReference: 'NIP-8841',
    });
    const entry = await entryOf(pool, `WRF-${request.reference}`);
    expect(entry).toMatchObject({
      kind: 'wallet_refund',
      source_id: request.id,
      reverses_entry_id: null,
      posted_by: principal.id,
    });
    expect(entry?.lines).toEqual([
      {
        system_key: 'student_wallets',
        debit_minor: 1_500_000,
        credit_minor: 0,
        family_id: guardianLogin?.guardianId,
        campus_id: null,
      },
      {
        system_key: null,
        debit_minor: 0,
        credit_minor: 1_500_000,
        family_id: null,
        campus_id: null,
      },
    ]);
    expect(await walletOf(api, owner, walletId)).toMatchObject({
      balanceMinor: TOP_UP - 1_500_000,
      heldMinor: 0,
      freeMinor: TOP_UP - 1_500_000,
    });
    const movements = await movementsAddUp(api, owner, walletId);
    expect(movements.items[0]).toMatchObject({
      kind: 'wallet_refund',
      amountMinor: -1_500_000,
      source: { type: 'refund', payoutReference: 'NIP-8841' },
      madeBy: expect.any(String) as string,
    });
    expect(await fingerprint(pool, topUp.reference)).toBe(topUpBefore);
  });

  test('refuses a decided request: a second decision answers 409 AlreadyDecided and nothing posts twice', async ({
    api,
    app,
    pool,
    withPermissions,
    schools,
  }) => {
    const { orgA } = schools;
    const { walletId, bank, bursar, principal } = await ready({
      api,
      app,
      pool,
      withPermissions,
      schools,
    });
    const other = await withPermissions(orgA, [
      'wallet:read',
      'wallet:approveRefund',
      'campus:readAll',
    ]);
    const request = (
      await requestRefund(api, bursar, { walletId, accountId: bank.id })
    ).request;
    await approveRefundRequest(api, principal, { id: request.id });

    const again = await api(other)
      .post(`/finance/wallet-refunds/${request.id}/approve`)
      .send({ payoutReference: nextReference('NIP') })
      .expect(409);
    expect(again.body.code).toBe('AlreadyDecided');
    await api(other)
      .post(`/finance/wallet-refunds/${request.id}/decline`)
      .send({ reason: 'Too late' })
      .expect(409);
    expect(await entryCount(pool, 'wallet_refund')).toBe(1);
  });

  test('refuses the requester deciding their own request, but lets an owner', async ({
    api,
    app,
    pool,
    withPermissions,
    schools,
  }) => {
    const { owner, orgA } = schools;
    const { walletId, bank } = await ready({
      api,
      app,
      pool,
      withPermissions,
      schools,
    });
    const both = await withPermissions(orgA, [
      'wallet:read',
      'wallet:requestRefund',
      'wallet:approveRefund',
      'campus:readAll',
    ]);
    const own = (
      await requestRefund(api, both, {
        walletId,
        accountId: bank.id,
        amountMinor: 500_000,
      })
    ).request;
    const refused = await api(both)
      .post(`/finance/wallet-refunds/${own.id}/approve`)
      .send({ payoutReference: nextReference('NIP') })
      .expect(409);
    expect(refused.body.code).toBe('SelfApproval');
    await api(both)
      .post(`/finance/wallet-refunds/${own.id}/decline`)
      .send({ reason: 'Changed my mind' })
      .expect(409);

    const ownersOwn = (
      await requestRefund(api, owner, {
        walletId,
        accountId: bank.id,
        amountMinor: 500_000,
      })
    ).request;
    await approveRefundRequest(api, owner, { id: ownersOwn.id });
    expect(await entryCount(pool, 'wallet_refund')).toBe(1);
  });

  test('posts once when two people approve at the same moment', async ({
    api,
    app,
    pool,
    withPermissions,
    schools,
  }) => {
    const { orgA } = schools;
    const { walletId, bank, bursar, principal } = await ready({
      api,
      app,
      pool,
      withPermissions,
      schools,
    });
    const second = await withPermissions(orgA, [
      'wallet:read',
      'wallet:approveRefund',
      'campus:readAll',
    ]);
    const request = (
      await requestRefund(api, bursar, {
        walletId,
        accountId: bank.id,
        amountMinor: 2_000_000,
      })
    ).request;

    const results = await Promise.all(
      [principal, second].map((actor) =>
        api(actor)
          .post(`/finance/wallet-refunds/${request.id}/approve`)
          .send({ payoutReference: nextReference('NIP') })
      )
    );

    expect(results.map((res) => res.status).toSorted((a, b) => a - b)).toEqual([
      200, 409,
    ]);
    expect(await entryCount(pool, 'wallet_refund')).toBe(1);
    expect((await walletOf(api, bursar, walletId)).balanceMinor).toBe(
      TOP_UP - 2_000_000
    );
    await movementsAddUp(api, bursar, walletId);
  });

  test('needs a reason to decline, releases the hold, and a decided request cannot change', async ({
    api,
    app,
    pool,
    withPermissions,
    schools,
  }) => {
    const { walletId, bank, bursar, principal } = await ready({
      api,
      app,
      pool,
      withPermissions,
      schools,
    });
    const request = (
      await requestRefund(api, bursar, {
        walletId,
        accountId: bank.id,
        amountMinor: 4_000_000,
      })
    ).request;
    await api(principal)
      .post(`/finance/wallet-refunds/${request.id}/decline`)
      .send({ reason: '  ' })
      .expect(400);
    const declined = await api(principal)
      .post(`/finance/wallet-refunds/${request.id}/decline`)
      .send({ reason: 'No such overpayment' })
      .expect(200);
    expect(declined.body).toMatchObject({
      status: 'rejected',
      rejectionReason: 'No such overpayment',
    });
    expect(await walletOf(api, bursar, walletId)).toMatchObject({
      heldMinor: 0,
      freeMinor: TOP_UP,
    });
    await expect(
      pool.query(`UPDATE wallet_refund SET reason = 'changed' WHERE id = $1`, [
        request.id,
      ])
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      pool.query(`DELETE FROM wallet_refund WHERE id = $1`, [request.id])
    ).rejects.toMatchObject({ code: '23514' });
  });

  test('answers 404 for a request that is not there and leaves a waiting one alone', async ({
    api,
    app,
    pool,
    withPermissions,
    schools,
  }) => {
    const { walletId, bank, bursar } = await ready({
      api,
      app,
      pool,
      withPermissions,
      schools,
    });
    const request = (
      await requestRefund(api, bursar, { walletId, accountId: bank.id })
    ).request;
    const unknown = '5d7e0f2a-3c1b-4e0a-9d7c-2f6a1b8c9d10';
    const res = await api(schools.owner)
      .post(`/finance/wallet-refunds/${unknown}/approve`)
      .send({ payoutReference: nextReference('NIP') })
      .expect(404);
    expect(res.body.message).toBe(WALLET_REQUEST_NOT_FOUND_MESSAGE);
    expect(
      await scalar(
        pool,
        `SELECT count(*)::text AS n FROM wallet_refund WHERE id = $1 AND status = 'submitted'`,
        [request.id]
      )
    ).toBe(1);
  });
});

test.describe('cancelling a top-up', () => {
  test('holds the top-up’s amount, then reverses it with a mirror entry that keeps the family tag and leaves the original alone', async ({
    api,
    app,
    pool,
    withPermissions,
    schools,
  }) => {
    const { owner } = schools;
    const { guardianLogin, walletId, bursar, principal, topUp, topUpId } =
      await ready({ api, app, pool, withPermissions, schools });
    const originalBefore = await fingerprint(pool, topUp.reference);
    const original = await entryOf(pool, topUp.reference);

    const asked = await requestCancellation(api, bursar, {
      walletId,
      topUpId,
    });
    expect(asked.request).toMatchObject({
      kind: 'wallet_topup_cancellation',
      status: 'submitted',
      amountMinor: TOP_UP,
      topUp: { id: topUpId, reference: topUp.reference },
    });
    expect(asked.wallet).toMatchObject({
      balanceMinor: TOP_UP,
      heldMinor: TOP_UP,
      freeMinor: 0,
    });
    const waitingMovements = await movementsAddUp(api, bursar, walletId);
    expect(waitingMovements.items[0]?.source).toMatchObject({
      type: 'topup',
      cancellation: 'submitted',
    });

    await approveCancellationRequest(api, principal, asked.request.id);

    const reversal = await entryOf(pool, `WTC-${asked.request.reference}`);
    expect(reversal).toMatchObject({
      kind: 'wallet_topup_void',
      reverses_entry_id: original?.id,
      source_id: asked.request.id,
    });
    expect(reversal?.lines).toEqual(
      original?.lines.map((line) => ({
        ...line,
        debit_minor: line.credit_minor,
        credit_minor: line.debit_minor,
      }))
    );
    expect(
      reversal?.lines.find((line) => line.system_key === 'student_wallets')
    ).toMatchObject({ family_id: guardianLogin?.guardianId });
    expect(await fingerprint(pool, topUp.reference)).toBe(originalBefore);
    expect(await walletOf(api, owner, walletId)).toMatchObject({
      balanceMinor: 0,
      heldMinor: 0,
      freeMinor: 0,
    });
    const movements = await movementsAddUp(api, owner, walletId);
    expect(movements.items.map((row) => row.source?.type)).toEqual([
      'topup_cancellation',
      'topup',
    ]);
    expect(movements.items[1]?.source).toMatchObject({
      cancellation: 'approved',
    });
  });

  test('refuses once the family has spent part of it, with 422 naming what is still free', async ({
    api,
    app,
    pool,
    withPermissions,
    schools,
  }) => {
    const { ada, guardianLogin, walletId, bursar, topUpId } = await ready({
      api,
      app,
      pool,
      withPermissions,
      schools,
    });
    const guardian = await signInAs(api, guardianLogin);
    await api(guardian)
      .post('/portal/wallet/spend')
      .send({
        reference: nextReference('WSP'),
        lines: [{ studentId: ada.id, amountMinor: 500_000 }],
      })
      .expect(201);

    const refused = await postCancellation(api, bursar, {
      walletId,
      topUpId,
      status: 422,
    });

    expect(refused.body.message).toBe(
      walletCancelOverMessage(TOP_UP, TOP_UP - 500_000)
    );
    expect(
      await scalar(
        pool,
        'SELECT count(*)::text AS n FROM wallet_topup_cancellation'
      )
    ).toBe(0);
  });

  test('refuses once the family has set part of it aside, with 422 naming what is still free', async ({
    api,
    app,
    pool,
    withPermissions,
    schools,
  }) => {
    const { ada, guardianLogin, walletId, bursar, topUpId } = await ready({
      api,
      app,
      pool,
      withPermissions,
      schools,
    });
    const guardian = await signInAs(api, guardianLogin);
    await api(guardian)
      .post('/portal/wallet/earmarks')
      .send({
        reference: nextReference('WSA'),
        studentId: ada.id,
        amountMinor: 500_000,
      })
      .expect(201);

    const refused = await postCancellation(api, bursar, {
      walletId,
      topUpId,
      status: 422,
    });

    expect(refused.body.message).toBe(
      walletCancelOverMessage(TOP_UP, TOP_UP - 500_000)
    );
    expect(
      await scalar(
        pool,
        'SELECT count(*)::text AS n FROM wallet_topup_cancellation'
      )
    ).toBe(0);
  });

  test('refuses a second cancellation while one waits or is done, but allows a new one after a decline', async ({
    api,
    app,
    pool,
    withPermissions,
    schools,
  }) => {
    const { walletId, bursar, principal, topUpId } = await ready({
      api,
      app,
      pool,
      withPermissions,
      schools,
    });
    const first = await requestCancellation(api, bursar, { walletId, topUpId });
    await postCancellation(api, bursar, { walletId, topUpId, status: 409 });
    await api(principal)
      .post(`/finance/wallet-topup-cancellations/${first.request.id}/decline`)
      .send({ reason: 'Not yet' })
      .expect(200);
    const second = await requestCancellation(api, bursar, {
      walletId,
      topUpId,
    });
    await approveCancellationRequest(api, principal, second.request.id);
    await postCancellation(api, bursar, { walletId, topUpId, status: 409 });
    await expect(
      pool.query(
        `INSERT INTO journal_entry (organization_id, reference, kind, effective_on, reverses_entry_id)
         SELECT organization_id, 'SECOND-REVERSAL', 'wallet_topup_void', CURRENT_DATE, reverses_entry_id
         FROM journal_entry WHERE kind = 'wallet_topup_void'`
      )
    ).rejects.toMatchObject({ code: '23505' });
  });

  test('replays the same request and refuses another reason on the reference', async ({
    api,
    app,
    pool,
    withPermissions,
    schools,
  }) => {
    const { walletId, bursar, topUpId } = await ready({
      api,
      app,
      pool,
      withPermissions,
      schools,
    });
    const reference = nextReference('WTQ');
    const first = await requestCancellation(api, bursar, {
      walletId,
      topUpId,
      reference,
    });
    const again = await postCancellation(api, bursar, {
      walletId,
      topUpId,
      reference,
      status: 200,
    });
    expect((again.body as RequestedWalletCancellation).replayed).toBe(true);
    expect((again.body as RequestedWalletCancellation).request.id).toBe(
      first.request.id
    );
    await postCancellation(api, bursar, {
      walletId,
      topUpId,
      reference,
      reason: 'Another reason',
      status: 409,
    });
    expect(
      await scalar(
        pool,
        'SELECT count(*)::text AS n FROM wallet_topup_cancellation'
      )
    ).toBe(1);
  });

  test('refuses a Monnify credit with 409 and an unknown top-up with 404', async ({
    api,
    app,
    monnify,
    pool,
    withPermissions,
    schools,
  }) => {
    const { owner, orgA } = schools;
    const { walletId, bursar } = await ready({
      api,
      app,
      pool,
      withPermissions,
      schools,
    });
    await api(owner).put('/finance/gateway/monnify').send(KEYS).expect(200);
    await api(owner)
      .post(`/finance/wallets/${walletId}/reserved-account`)
      .expect(200);
    monnify.transactions.set(MONNIFY_REFERENCE, {
      transactionReference: MONNIFY_REFERENCE,
      paymentReference: 'pay-1',
      paymentStatus: 'PAID',
      currency: 'NGN',
      amountPaidMinor: 5_000_000,
      settlementMinor: 4_950_000,
      paidAt: new Date('2026-10-24T11:15:29Z'),
      accountReference: reservedAccountReference(walletId),
    });
    const raw = JSON.stringify({
      eventType: 'SUCCESSFUL_TRANSACTION',
      eventData: {
        transactionReference: MONNIFY_REFERENCE,
        paymentReference: 'pay-1',
        amountPaid: 50_000,
      },
    });
    await api()
      .post(`/webhooks/monnify/${orgA.id}`)
      .set('Content-Type', 'application/json')
      .set(
        'monnify-signature',
        createHmac('sha512', KEYS.secretKey).update(raw).digest('hex')
      )
      .send(raw)
      .expect(200);
    const movements = (
      await api(bursar)
        .get(`/finance/wallets/${walletId}/movements?pageSize=50`)
        .expect(200)
    ).body as WalletMovementList;
    const online = movements.items.find(
      (row) => row.source?.type === 'monnify'
    );

    const refused = await postCancellation(api, bursar, {
      walletId,
      topUpId: online?.source?.type === 'monnify' ? online.source.id : '',
      status: 409,
    });

    expect(refused.body.message).toBe(WALLET_CANCEL_ONLINE_MESSAGE);
    await postCancellation(api, bursar, {
      walletId,
      topUpId: '5d7e0f2a-3c1b-4e0a-9d7c-2f6a1b8c9d10',
      status: 404,
    });
    expect(
      await scalar(
        pool,
        'SELECT count(*)::text AS n FROM wallet_topup_cancellation'
      )
    ).toBe(0);
  });
});

test.describe('the requests list and the approvals queue', () => {
  test('lists both kinds with the waiting count, filtered by kind and status', async ({
    api,
    app,
    pool,
    withPermissions,
    schools,
  }) => {
    const { owner } = schools;
    const { walletId, bank, bursar, principal, topUpId } = await ready({
      api,
      app,
      pool,
      withPermissions,
      schools,
    });
    await topUpWallet(api, owner, {
      walletId,
      accountId: (await cashAccount(app, owner)).id,
      amountMinor: TOP_UP,
    });
    const cancellation = await requestCancellation(api, bursar, {
      walletId,
      topUpId,
    });
    const refund = await requestRefund(api, bursar, {
      walletId,
      accountId: bank.id,
      amountMinor: 1_000_000,
    });
    await api(principal)
      .post(`/finance/wallet-refunds/${refund.request.id}/decline`)
      .send({ reason: 'Not now' })
      .expect(200);

    const all = (await api(bursar).get('/finance/wallet-requests').expect(200))
      .body as WalletRequestList;
    expect(all).toMatchObject({ total: 2, waitingCount: 1, currency: 'NGN' });
    expect(all.items.map((item) => item.id).toSorted(byText)).toEqual(
      [cancellation.request.id, refund.request.id].toSorted(byText)
    );
    const declined = (
      await api(bursar)
        .get('/finance/wallet-requests?status=rejected&kind=wallet_refund')
        .expect(200)
    ).body as WalletRequestList;
    expect(declined.items).toMatchObject([
      {
        id: refund.request.id,
        status: 'rejected',
        rejectionReason: 'Not now',
        decidedBy: expect.any(String) as string,
      },
    ]);
    expect(declined.waitingCount).toBe(1);
  });

  test('shows both kinds in the approvals queue to the wallet approver and counts them on Wallets, not Payments', async ({
    api,
    app,
    pool,
    withPermissions,
    schools,
  }) => {
    const { owner } = schools;
    const { walletId, bank, bursar, principal, topUpId } = await ready({
      api,
      app,
      pool,
      withPermissions,
      schools,
    });
    await topUpWallet(api, owner, {
      walletId,
      accountId: (await cashAccount(app, owner)).id,
      amountMinor: TOP_UP,
    });
    await requestCancellation(api, bursar, { walletId, topUpId });
    await requestRefund(api, bursar, {
      walletId,
      accountId: bank.id,
      amountMinor: 1_000_000,
    });

    const summary = (await api(principal).get('/approvals/summary').expect(200))
      .body as ApprovalSummary;
    expect(summary.byNav).toEqual({
      approvals: 2,
      payments: 0,
      store: 0,
      wallets: 2,
    });
    const queue = (await api(principal).get('/approvals').expect(200)).body as {
      items: { kind: string; label: string; decide: string }[];
    };
    expect(
      queue.items
        .map((item) => [item.kind, item.label, item.decide])
        .toSorted((a, b) => (a[0] ?? '').localeCompare(b[0] ?? ''))
    ).toEqual([
      ['wallet_refund', 'Wallet refund', 'yes'],
      ['wallet_topup_cancellation', 'Cancel a top-up', 'yes'],
    ]);
    const asked = (await api(bursar).get('/approvals/summary').expect(200))
      .body as ApprovalSummary;
    expect(asked.byNav).toEqual({
      approvals: 0,
      payments: 0,
      store: 0,
      wallets: 0,
    });
  });
});

test.describe('activity', () => {
  test('writes the six events on each campus the family has a child on', async ({
    api,
    app,
    pool,
    withPermissions,
    schools,
  }) => {
    const { walletId, bank, bursar, principal } = await ready({
      api,
      app,
      pool,
      withPermissions,
      schools,
    });
    const refundA = await requestRefund(api, bursar, {
      walletId,
      accountId: bank.id,
      amountMinor: 500_000,
    });
    await approveRefundRequest(api, principal, { id: refundA.request.id });
    const refundB = await requestRefund(api, bursar, {
      walletId,
      accountId: bank.id,
      amountMinor: 500_000,
    });
    await api(principal)
      .post(`/finance/wallet-refunds/${refundB.request.id}/decline`)
      .send({ reason: 'No' })
      .expect(200);

    const { rows } = await pool.query<{ kind: string; n: string }>(
      `SELECT kind, count(*)::text AS n FROM activity_event
       WHERE kind LIKE 'wallet.refund%' OR kind = 'wallet.refunded'
       GROUP BY kind ORDER BY kind`
    );
    expect(rows).toEqual([
      { kind: 'wallet.refund_declined', n: '2' },
      { kind: 'wallet.refund_requested', n: '4' },
      { kind: 'wallet.refunded', n: '2' },
    ]);
  });

  test('writes the cancellation events too', async ({
    api,
    app,
    pool,
    withPermissions,
    schools,
  }) => {
    const { walletId, bursar, principal, topUpId } = await ready({
      api,
      app,
      pool,
      withPermissions,
      schools,
    });
    const first = await requestCancellation(api, bursar, { walletId, topUpId });
    await api(principal)
      .post(`/finance/wallet-topup-cancellations/${first.request.id}/decline`)
      .send({ reason: 'Not yet' })
      .expect(200);
    const second = await requestCancellation(api, bursar, {
      walletId,
      topUpId,
    });
    await approveCancellationRequest(api, principal, second.request.id);

    const { rows } = await pool.query<{ kind: string; n: string }>(
      `SELECT kind, count(*)::text AS n FROM activity_event
       WHERE kind LIKE 'wallet.topup_cancel%' GROUP BY kind ORDER BY kind`
    );
    expect(rows).toEqual([
      { kind: 'wallet.topup_cancel_declined', n: '2' },
      { kind: 'wallet.topup_cancel_requested', n: '4' },
      { kind: 'wallet.topup_cancelled', n: '2' },
    ]);
  });
});

test.describe('isolation', () => {
  test('1: another school answers 404 on every request route and lists none of A’s', async ({
    api,
    app,
    pool,
    withPermissions,
    schools,
  }) => {
    const { owner, ownerB } = schools;
    const { walletId, cash, bank, bursar, topUpId } = await ready({
      api,
      app,
      pool,
      withPermissions,
      schools,
    });
    const bankB = await bankAccount(app, ownerB);
    const refund = (
      await requestRefund(api, bursar, { walletId, accountId: bank.id })
    ).request;
    await topUpWallet(api, owner, { walletId, accountId: cash.id });
    const cancellation = (
      await requestCancellation(api, bursar, { walletId, topUpId })
    ).request;

    await postRefund(api, ownerB, {
      walletId,
      accountId: bank.id,
      status: 404,
    });
    await postCancellation(api, ownerB, { walletId, topUpId, status: 404 });
    for (const { path, body } of decisionsOn(refund.id, cancellation.id)) {
      const res = await api(ownerB).post(path).send(body).expect(404);
      expect(res.body.message).toBe(WALLET_REQUEST_NOT_FOUND_MESSAGE);
    }
    const options = (
      await api(ownerB).get('/finance/wallets/refund-options').expect(200)
    ).body as RefundOptions;
    expect(options.accounts.map((account) => account.id)).toEqual([bankB.id]);
    expect(
      await scalar(
        pool,
        `SELECT count(*)::text AS n FROM wallet_refund WHERE status <> 'submitted'`
      )
    ).toBe(0);
    expect(
      await scalar(
        pool,
        `SELECT count(*)::text AS n FROM wallet_topup_cancellation WHERE status <> 'submitted'`
      )
    ).toBe(0);
    const list = (await api(ownerB).get('/finance/wallet-requests').expect(200))
      .body as WalletRequestList;
    expect(list).toMatchObject({ items: [], total: 0, waitingCount: 0 });
    const notFound = await postRefund(api, ownerB, {
      walletId,
      accountId: bank.id,
      status: 404,
    });
    expect(notFound.body.message).toBe(WALLET_NOT_FOUND_MESSAGE);
  });

  test('2 and 4: the owner’s list holds both campuses’ requests and a campus member sees only their campus’s', async ({
    api,
    app,
    pool,
    withPermissions,
    schools,
  }) => {
    const { owner, lekkiOnly, studentIkeja } = schools;
    const { walletId, bank, bursar } = await ready({
      api,
      app,
      pool,
      withPermissions,
      schools,
    });
    const ikejaWallet = await walletIdOf(
      pool,
      studentIkeja.logins.find((login) => login.who === 'guardian')
        ?.guardianId ?? ''
    );
    await topUpWallet(api, owner, {
      walletId: ikejaWallet,
      accountId: (await cashAccount(app, owner)).id,
    });
    const lekkiRequest = (
      await requestRefund(api, bursar, { walletId, accountId: bank.id })
    ).request;
    const ikejaRequest = (
      await requestRefund(api, owner, {
        walletId: ikejaWallet,
        accountId: bank.id,
      })
    ).request;

    const all = (await api(owner).get('/finance/wallet-requests').expect(200))
      .body as WalletRequestList;
    expect(all.items.map((item) => item.id).toSorted(byText)).toEqual(
      [lekkiRequest.id, ikejaRequest.id].toSorted(byText)
    );
    const scoped = (
      await api(lekkiOnly).get('/finance/wallet-requests').expect(200)
    ).body as WalletRequestList;
    expect(scoped.items.map((item) => item.id)).toEqual([lekkiRequest.id]);
    expect(scoped.waitingCount).toBe(1);
  });

  test('3: a campus member answers 404 for a family on another campus, for a request and its decision', async ({
    api,
    app,
    pool,
    withPermissions,
    schools,
  }) => {
    const { owner, orgA, lekkiOnly, studentIkeja } = schools;
    const { cash, bank } = await ready({
      api,
      app,
      pool,
      withPermissions,
      schools,
    });
    const ikejaWallet = await walletIdOf(
      pool,
      studentIkeja.logins.find((login) => login.who === 'guardian')
        ?.guardianId ?? ''
    );
    const ikejaTopUp = await topUpWallet(api, owner, {
      walletId: ikejaWallet,
      accountId: cash.id,
    });
    await topUpWallet(api, owner, {
      walletId: ikejaWallet,
      accountId: cash.id,
    });
    const approver = await withPermissions(orgA, [
      'wallet:read',
      'wallet:approveRefund',
    ]);
    const request = (
      await requestRefund(api, owner, {
        walletId: ikejaWallet,
        accountId: bank.id,
      })
    ).request;
    const cancellation = (
      await requestCancellation(api, owner, {
        walletId: ikejaWallet,
        topUpId: ikejaTopUp.id,
      })
    ).request;

    await postRefund(api, lekkiOnly, {
      walletId: ikejaWallet,
      accountId: bank.id,
      uploadedBy: owner,
      status: 404,
    });
    await postCancellation(api, lekkiOnly, {
      walletId: ikejaWallet,
      topUpId: ikejaTopUp.id,
      status: 404,
    });
    for (const { path, body } of decisionsOn(request.id, cancellation.id)) {
      const res = await api(approver).post(path).send(body).expect(404);
      expect(res.body.message).toBe(WALLET_REQUEST_NOT_FOUND_MESSAGE);
    }
    expect(
      await scalar(
        pool,
        `SELECT count(*)::text AS n FROM wallet_refund WHERE status <> 'submitted'`
      )
    ).toBe(0);
    expect(
      await scalar(
        pool,
        `SELECT count(*)::text AS n FROM wallet_topup_cancellation WHERE status <> 'submitted'`
      )
    ).toBe(0);
  });

  test('5: someone without the permission answers 403, and a reader cannot ask or decide', async ({
    api,
    app,
    pool,
    withPermissions,
    schools,
  }) => {
    const { owner, orgA, noPermission } = schools;
    const { walletId, cash, bank, bursar, topUpId } = await ready({
      api,
      app,
      pool,
      withPermissions,
      schools,
    });
    const reader = await withPermissions(orgA, [
      'wallet:read',
      'campus:readAll',
    ]);
    const request = (
      await requestRefund(api, bursar, { walletId, accountId: bank.id })
    ).request;
    await topUpWallet(api, owner, { walletId, accountId: cash.id });
    const cancellation = (
      await requestCancellation(api, bursar, { walletId, topUpId })
    ).request;

    await api(noPermission).get('/finance/wallet-requests').expect(403);
    await api(noPermission).get('/finance/wallets/refund-options').expect(403);
    await api(reader).get('/finance/wallet-requests').expect(200);
    await api(reader).get('/finance/wallets/refund-options').expect(403);
    for (const actor of [noPermission, reader]) {
      await postRefund(api, actor, {
        walletId,
        accountId: bank.id,
        uploadedBy: owner,
        status: 403,
      });
      await postCancellation(api, actor, { walletId, topUpId, status: 403 });
    }
    for (const actor of [noPermission, reader, bursar]) {
      for (const { path, body } of decisionsOn(request.id, cancellation.id)) {
        await api(actor).post(path).send(body).expect(403);
      }
    }
    const refusedUpload = await api(reader)
      .post('/files')
      .field('kind', 'wallet_refund_request')
      .attach('file', PDF_BYTES, { filename: 'parent-email.pdf' })
      .expect(403);
    expect(refusedUpload.body.message).toBe(WALLET_REFUND_PROOF_DENIED_MESSAGE);
  });

  test('6: no session answers 401 on every request route', async ({ api }) => {
    for (const [method, path] of WALLET_REQUEST_ROUTES) {
      await api()[method](path).expect(401);
    }
  });

  test('7: a raw insert that names another school’s wallet, top-up or account is refused by the composite foreign keys', async ({
    api,
    app,
    pool,
    withPermissions,
    schools,
  }) => {
    const { orgB } = schools;
    const { walletId, bank, bursar, topUpId } = await ready({
      api,
      app,
      pool,
      withPermissions,
      schools,
    });
    const unattached = await uploadRefundEmail(api, bursar);

    await expect(
      pool.query(
        `INSERT INTO wallet_refund
           (organization_id, wallet_id, money_account_id, amount_minor, parent_email,
            reason, proof_file_id, reference, request_hash)
         VALUES ($1, $2, $3, 1000, 'p@example.com', 'x', $4, 'RAW-1', 'h')`,
        [orgB.id, walletId, bank.id, unattached.id]
      )
    ).rejects.toMatchObject({ code: '23503' });
    await expect(
      pool.query(
        `INSERT INTO wallet_topup_cancellation
           (organization_id, wallet_topup_id, reason, reference, request_hash)
         VALUES ($1, $2, 'x', 'RAW-2', 'h')`,
        [orgB.id, topUpId]
      )
    ).rejects.toMatchObject({ code: '23503' });
  });

  test('12: an acting super admin without a reason gets 403 ActingReadOnly on a request and a decision, and with a reason can write', async ({
    api,
    app,
    createUser,
    makeSuperAdmin,
    pool,
    withPermissions,
    schools,
  }) => {
    const { owner, orgA } = schools;
    const { walletId, cash, bank, bursar, topUpId } = await ready({
      api,
      app,
      pool,
      withPermissions,
      schools,
    });
    const admin = await makeSuperAdmin(await createUser());
    const reason = 'SUP-2207 pay back the family the school confirmed';
    const request = (
      await requestRefund(api, bursar, { walletId, accountId: bank.id })
    ).request;
    await topUpWallet(api, owner, { walletId, accountId: cash.id });
    const cancellation = (
      await requestCancellation(api, bursar, { walletId, topUpId })
    ).request;
    const before = await scalar(
      pool,
      'SELECT count(*)::text AS n FROM wallet_refund'
    );

    const refusals = [
      api(admin)
        .post(`/finance/wallets/${walletId}/top-ups/${topUpId}/cancellations`)
        .set(acting(orgA.id))
        .send({ reference: nextReference('WTQ'), reason: 'Wrong family' }),
      ...decisionsOn(request.id, cancellation.id).map(({ path, body }) =>
        api(admin).post(path).set(acting(orgA.id)).send(body)
      ),
    ];
    for (const res of await Promise.all(refusals)) {
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('ActingReadOnly');
    }
    expect(
      await scalar(pool, 'SELECT count(*)::text AS n FROM wallet_refund')
    ).toBe(before);
    expect(
      await scalar(
        pool,
        `SELECT count(*)::text AS n FROM wallet_topup_cancellation WHERE status <> 'submitted'`
      )
    ).toBe(0);
    await api(admin)
      .get('/finance/wallet-requests')
      .set(acting(orgA.id))
      .expect(200);
    await api(admin)
      .post(`/finance/wallet-refunds/${request.id}/approve`)
      .set(acting(orgA.id, reason))
      .send({ payoutReference: 'NIP-13' })
      .expect(200);
  });
});
