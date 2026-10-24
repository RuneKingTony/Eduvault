import { createHmac } from 'node:crypto';
import {
  GATEWAY_NOT_CONNECTED_MESSAGE,
  RESERVED_REFERENCE_MESSAGE,
  WALLET_NOT_FOUND_MESSAGE,
  type GatewayConnection,
  type GatewayTestResult,
  type MonnifyWebhookResult,
  type Wallet,
  type WalletMovementList,
} from '@eduvault/api-contract';
import type { Pool } from 'pg';
import { OrganizationAdminService } from '../src/app/common/auth';
import { reservedAccountReference } from '../src/app/modules/gateway/reserved-account.service';
import type { FakeMonnifyClient } from '../src/app/modules/gateway/fake-monnify-client';
import { acting, expect, type Fixtures } from './support/base-test';
import { createStudent } from './support/factories/students';
import {
  cashAccount,
  postTopUp,
  topUpWallet,
  walletIdOf,
} from './support/factories/wallets';
import { guardianOf, signInAs } from './support/portal';
import { schoolsTest as test } from './support/two-schools';

type Api = Fixtures['api'];
type Signed = Parameters<Api>[0];

const KEYS = {
  mode: 'sandbox',
  contractCode: '2957982769',
  apiKey: 'MK_TEST_APIKEY0001',
  secretKey: 'SECRET-OF-SCHOOL-A-0001',
} as const;
const SECRET_B = 'SECRET-OF-SCHOOL-B-0002';
const PLAIN_SECRETS = [
  KEYS.apiKey,
  KEYS.secretKey,
  SECRET_B,
  'MK_TEST_APIKEYB02',
];
const GROSS = 5_000_000;
const NET = 4_950_000;
const REFERENCE = 'MNFY|20|20261024120000|000001';

const guardianIdOf = (student: Parameters<typeof guardianOf>[0]) =>
  guardianOf(student)?.guardianId ?? '';

const connect = (api: Api, owner: Signed, overrides: object = {}) =>
  api(owner)
    .put('/finance/gateway/monnify')
    .send({ ...KEYS, ...overrides });

const sign = (secret: string, raw: string) =>
  createHmac('sha512', secret).update(raw).digest('hex');

const notice = (reference = REFERENCE, amountPaid: number = GROSS / 100) => ({
  eventType: 'SUCCESSFUL_TRANSACTION',
  eventData: {
    transactionReference: reference,
    paymentReference: 'pay-1',
    amountPaid,
  },
});

function deliver(
  api: Api,
  delivery: { organizationId: string; secret: string; body?: object }
) {
  const raw = JSON.stringify(delivery.body ?? notice());
  return api()
    .post(`/webhooks/monnify/${delivery.organizationId}`)
    .set('Content-Type', 'application/json')
    .set('monnify-signature', sign(delivery.secret, raw))
    .send(raw);
}

function script(
  monnify: FakeMonnifyClient,
  walletId: string,
  overrides: Partial<
    Parameters<FakeMonnifyClient['transactions']['set']>[1]
  > = {}
) {
  monnify.transactions.set(REFERENCE, {
    transactionReference: REFERENCE,
    paymentReference: 'pay-1',
    paymentStatus: 'PAID',
    currency: 'NGN',
    amountPaidMinor: GROSS,
    settlementMinor: NET,
    paidAt: new Date('2026-10-24T11:15:29Z'),
    accountReference: reservedAccountReference(walletId),
    ...overrides,
  });
}

const count = async (pool: Pool, table: string) =>
  Number(
    (
      await pool.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM ${table}`
      )
    ).rows[0]?.n
  );

const walletOf = async (api: Api, actor: Signed, walletId: string) =>
  (await api(actor).get(`/finance/wallets/${walletId}`).expect(200))
    .body as Wallet;

test.describe('the Monnify connection', () => {
  test('starts empty, with the URL to give Monnify', async ({
    api,
    schools: { owner, orgA },
  }) => {
    const res = await api(owner).get('/finance/gateway/monnify').expect(200);

    expect(res.body).toEqual({
      webhookUrl: `http://localhost:3000/webhooks/monnify/${orgA.id}`,
      connection: null,
    });
  });

  test('is saved encrypted and answers with masked tails only', async ({
    api,
    pool,
    schools: { owner },
  }) => {
    const saved = (await connect(api, owner).expect(200))
      .body as GatewayConnection;

    expect(saved.connection).toMatchObject({
      mode: 'sandbox',
      contractCode: '2957982769',
      apiKeyMask: '••••0001',
      secretKeyMask: '••••0001',
      lastTestedAt: null,
      lastTestOk: null,
    });
    const read = (await api(owner).get('/finance/gateway/monnify').expect(200))
      .body as GatewayConnection;
    const { rows } = await pool.query<Record<string, unknown>>(
      'SELECT * FROM gateway_connection'
    );
    for (const text of [
      JSON.stringify(saved),
      JSON.stringify(read),
      JSON.stringify(rows),
    ]) {
      for (const secret of PLAIN_SECRETS) {
        expect(text).not.toContain(secret);
      }
    }
    expect(rows).toHaveLength(1);
  });

  test('keeps the keys when only the contract code changes, and wants new keys to change mode', async ({
    api,
    schools: { owner },
  }) => {
    await connect(api, owner).expect(200);

    await api(owner)
      .put('/finance/gateway/monnify')
      .send({ mode: 'sandbox', contractCode: '555' })
      .expect(200);
    const refused = await api(owner)
      .put('/finance/gateway/monnify')
      .send({ mode: 'live', contractCode: '555' })
      .expect(400);

    expect(refused.body).toMatchObject({ code: 'BadRequest' });
  });

  test('records a test against Monnify, good or bad, and never repeats a secret', async ({
    api,
    monnify,
    schools: { owner },
  }) => {
    await connect(api, owner).expect(200);

    const good = (
      await api(owner).post('/finance/gateway/monnify/test').expect(200)
    ).body as GatewayTestResult;
    expect(good).toMatchObject({ ok: true });
    expect(good.connection.connection).toMatchObject({ lastTestOk: true });
    expect(monnify.logins.at(-1)).toMatchObject({
      apiKey: KEYS.apiKey,
      secretKey: KEYS.secretKey,
      contractCode: KEYS.contractCode,
    });

    monnify.rejectKeys = true;
    const bad = (
      await api(owner).post('/finance/gateway/monnify/test').expect(200)
    ).body as GatewayTestResult;
    expect(bad).toMatchObject({ ok: false });
    expect(bad.connection.connection).toMatchObject({ lastTestOk: false });
    for (const secret of PLAIN_SECRETS) {
      expect(JSON.stringify([good, bad])).not.toContain(secret);
    }
  });

  test('cannot be tested before it is saved', async ({
    api,
    schools: { owner },
  }) => {
    const res = await api(owner)
      .post('/finance/gateway/monnify/test')
      .expect(409);

    expect(res.body).toMatchObject({ message: GATEWAY_NOT_CONNECTED_MESSAGE });
  });
});

test.describe('deleting a school', () => {
  test('takes its connection with it when it holds no money', async ({
    api,
    app,
    pool,
    createOrganization,
    createUser,
  }) => {
    const owner = await createUser();
    const org = await createOrganization(owner, 'Short Lived');
    await connect(api, owner).expect(200);
    expect(await count(pool, 'gateway_connection')).toBe(1);

    await app.get(OrganizationAdminService).deleteById(org.id);

    expect(await count(pool, 'gateway_connection')).toBe(0);
  });
});

test.describe('a family’s reserved account', () => {
  test('is made once on request, under a reference that belongs to the wallet', async ({
    api,
    monnify,
    pool,
    schools: { owner, studentLekki },
  }) => {
    await connect(api, owner).expect(200);
    const walletId = await walletIdOf(pool, guardianIdOf(studentLekki.logins));

    const first = (
      await api(owner)
        .post(`/finance/wallets/${walletId}/reserved-account`)
        .expect(200)
    ).body as Wallet;
    const again = (
      await api(owner)
        .post(`/finance/wallets/${walletId}/reserved-account`)
        .expect(200)
    ).body as Wallet;

    expect(first.reservedAccount).toMatchObject({ bankName: 'Wema Bank' });
    expect(again.reservedAccount).toEqual(first.reservedAccount);
    expect(first.gatewayConnected).toBe(true);
    expect(monnify.created.map((made) => made.accountReference)).toEqual([
      reservedAccountReference(walletId),
    ]);
    expect(await count(pool, 'wallet_reserved_account')).toBe(1);
  });

  test('answers 409 until the school has connected', async ({
    api,
    pool,
    schools: { owner, studentLekki },
  }) => {
    const walletId = await walletIdOf(pool, guardianIdOf(studentLekki.logins));
    expect((await walletOf(api, owner, walletId)).gatewayConnected).toBe(false);

    const res = await api(owner)
      .post(`/finance/wallets/${walletId}/reserved-account`)
      .expect(409);

    expect(res.body).toMatchObject({ message: GATEWAY_NOT_CONNECTED_MESSAGE });
  });

  test('is made after the commit when a paying guardian is admitted, and Monnify being down costs nothing', async ({
    api,
    app,
    monnify,
    pool,
    schools: { owner, lekki },
  }) => {
    await connect(api, owner).expect(200);

    const served = await createStudent(app, owner, { campusId: lekki.id });
    const servedWallet = await walletIdOf(pool, guardianIdOf(served.logins));
    expect(
      (await walletOf(api, owner, servedWallet)).reservedAccount
    ).not.toBeNull();

    monnify.down = true;
    const missed = await createStudent(app, owner, { campusId: lekki.id });
    const missedWallet = await walletIdOf(pool, guardianIdOf(missed.logins));
    expect(
      (await walletOf(api, owner, missedWallet)).reservedAccount
    ).toBeNull();

    monnify.down = false;
    await api(owner)
      .post(`/finance/wallets/${missedWallet}/reserved-account`)
      .expect(200);
    expect(
      (await walletOf(api, owner, missedWallet)).reservedAccount
    ).not.toBeNull();
  });

  test('is refused with 503 when Monnify cannot be reached, and nothing is kept', async ({
    api,
    monnify,
    pool,
    schools: { owner, studentLekki },
  }) => {
    await connect(api, owner).expect(200);
    const walletId = await walletIdOf(pool, guardianIdOf(studentLekki.logins));
    monnify.down = true;

    await api(owner)
      .post(`/finance/wallets/${walletId}/reserved-account`)
      .expect(503);

    expect(await count(pool, 'wallet_reserved_account')).toBe(0);
  });
});

interface Ready {
  api: Api;
  pool: Pool;
  monnify: FakeMonnifyClient;
  owner: Signed;
  logins: Parameters<typeof guardianOf>[0];
}

async function ready({ api, pool, monnify, owner, logins }: Ready) {
  await connect(api, owner).expect(200);
  const walletId = await walletIdOf(pool, guardianIdOf(logins));
  await api(owner)
    .post(`/finance/wallets/${walletId}/reserved-account`)
    .expect(200);
  script(monnify, walletId);
  return walletId;
}

test.describe('a Monnify payment', () => {
  test('credits the net amount once, with the fee kept on the top-up and a balanced journal entry with no staff member', async ({
    api,
    monnify,
    pool,
    schools,
  }) => {
    const { owner, orgA } = schools;
    const walletId = await ready({
      api,
      pool,
      monnify,
      owner,
      logins: schools.studentLekki.logins,
    });

    const res = await deliver(api, {
      organizationId: orgA.id,
      secret: KEYS.secretKey,
    }).expect(200);

    expect(res.body as MonnifyWebhookResult).toEqual({ status: 'posted' });
    const wallet = await walletOf(api, owner, walletId);
    expect(wallet.balanceMinor).toBe(NET);
    const topUp = await pool.query(
      `SELECT t.gross_minor::int, t.fee_minor::int, t.net_minor::int, t.signature_verified,
              t.reference, t.payment_reference, e.kind, e.posted_by, e.reference AS entry_reference,
              e.source_id = t.id AS sourced
       FROM gateway_topup t JOIN journal_entry e ON e.id = t.journal_entry_id`
    );
    expect(topUp.rows).toEqual([
      {
        gross_minor: GROSS,
        fee_minor: GROSS - NET,
        net_minor: NET,
        signature_verified: true,
        reference: REFERENCE,
        payment_reference: 'pay-1',
        kind: 'wallet_topup',
        posted_by: null,
        entry_reference: REFERENCE,
        sourced: true,
      },
    ]);
    const lines = await pool.query(
      `SELECT la.system_key, jl.debit_minor::int AS debit, jl.credit_minor::int AS credit,
              jl.family_id
       FROM journal_line jl JOIN ledger_account la ON la.id = jl.ledger_account_id
       JOIN gateway_topup t ON t.journal_entry_id = jl.entry_id
       ORDER BY jl.debit_minor DESC`
    );
    expect(lines.rows).toEqual([
      {
        system_key: 'monnify_collections',
        debit: NET,
        credit: 0,
        family_id: null,
      },
      {
        system_key: 'student_wallets',
        debit: 0,
        credit: NET,
        family_id: wallet.guardian.id,
      },
    ]);
  });

  test('shows as a movement with its Trace, and the movements sum to the journal balance', async ({
    api,
    monnify,
    pool,
    schools,
  }) => {
    const { owner, orgA } = schools;
    const walletId = await ready({
      api,
      pool,
      monnify,
      owner,
      logins: schools.studentLekki.logins,
    });
    await deliver(api, {
      organizationId: orgA.id,
      secret: KEYS.secretKey,
    }).expect(200);

    const movements = (
      await api(owner).get(`/finance/wallets/${walletId}/movements`).expect(200)
    ).body as WalletMovementList;

    expect(movements.items).toHaveLength(1);
    expect(movements.items[0]).toMatchObject({
      kind: 'wallet_topup',
      reference: REFERENCE,
      amountMinor: NET,
      madeBy: null,
      source: {
        type: 'monnify',
        transactionReference: REFERENCE,
        paymentReference: 'pay-1',
        signatureVerified: true,
        paidAt: '2026-10-24T11:15:29.000Z',
        grossMinor: GROSS,
        feeMinor: GROSS - NET,
        netMinor: NET,
      },
    });
    const wallet = await walletOf(api, owner, walletId);
    expect(
      movements.items.reduce((sum, item) => sum + item.amountMinor, 0)
    ).toBe(wallet.balanceMinor);
  });

  test('answers a replay with 200 and posts nothing more', async ({
    api,
    monnify,
    pool,
    schools,
  }) => {
    const { owner, orgA } = schools;
    const walletId = await ready({
      api,
      pool,
      monnify,
      owner,
      logins: schools.studentLekki.logins,
    });
    const send = () =>
      deliver(api, { organizationId: orgA.id, secret: KEYS.secretKey });

    await send().expect(200);
    const replay = await send().expect(200);

    expect(replay.body as MonnifyWebhookResult).toEqual({ status: 'replayed' });
    expect(await count(pool, 'gateway_topup')).toBe(1);
    expect((await walletOf(api, owner, walletId)).balanceMinor).toBe(NET);
  });

  test('is not accepted with a bad or missing signature', async ({
    api,
    monnify,
    pool,
    schools,
  }) => {
    const { owner, orgA } = schools;
    await ready({
      api,
      pool,
      monnify,
      owner,
      logins: schools.studentLekki.logins,
    });
    const raw = JSON.stringify(notice());

    await api()
      .post(`/webhooks/monnify/${orgA.id}`)
      .set('Content-Type', 'application/json')
      .set('monnify-signature', sign('not-the-secret', raw))
      .send(raw)
      .expect(401);
    await api()
      .post(`/webhooks/monnify/${orgA.id}`)
      .set('Content-Type', 'application/json')
      .send(raw)
      .expect(401);

    expect(await count(pool, 'gateway_topup')).toBe(0);
    expect(monnify.lookups).toEqual([]);
  });

  test('is judged on the amount Monnify confirms, not the amount in the notification', async ({
    api,
    monnify,
    pool,
    schools,
  }) => {
    const { owner, orgA } = schools;
    await ready({
      api,
      pool,
      monnify,
      owner,
      logins: schools.studentLekki.logins,
    });

    await deliver(api, {
      organizationId: orgA.id,
      secret: KEYS.secretKey,
      body: notice(REFERENCE, 900_000),
    }).expect(400);

    expect(await count(pool, 'gateway_topup')).toBe(0);
    expect(await count(pool, "journal_entry WHERE kind = 'wallet_topup'")).toBe(
      0
    );
  });

  test('from school A signed with A’s secret, naming B’s account, cannot credit B', async ({
    api,
    monnify,
    pool,
    schools,
  }) => {
    const { owner, ownerB, orgA, orgB, studentB } = schools;
    await connect(api, owner).expect(200);
    await connect(api, ownerB, {
      apiKey: 'MK_TEST_APIKEYB02',
      secretKey: SECRET_B,
    }).expect(200);
    const walletB = await walletIdOf(pool, guardianIdOf(studentB.logins));
    await api(ownerB)
      .post(`/finance/wallets/${walletB}/reserved-account`)
      .expect(200);
    script(monnify, walletB);

    await deliver(api, {
      organizationId: orgA.id,
      secret: KEYS.secretKey,
    }).expect(400);

    expect(await count(pool, 'gateway_topup')).toBe(0);
    expect((await walletOf(api, ownerB, walletB)).balanceMinor).toBe(0);
    expect(orgB.id).not.toBe(orgA.id);
  });

  test('with school A’s secret on school B’s URL is rejected', async ({
    api,
    monnify,
    pool,
    schools,
  }) => {
    const { owner, ownerB, orgB } = schools;
    await connect(api, owner).expect(200);
    await connect(api, ownerB, {
      apiKey: 'MK_TEST_APIKEYB02',
      secretKey: SECRET_B,
    }).expect(200);
    const walletB = await walletIdOf(
      pool,
      guardianIdOf(schools.studentB.logins)
    );
    await api(ownerB)
      .post(`/finance/wallets/${walletB}/reserved-account`)
      .expect(200);
    script(monnify, walletB);

    await deliver(api, {
      organizationId: orgB.id,
      secret: KEYS.secretKey,
    }).expect(401);

    expect(await count(pool, 'gateway_topup')).toBe(0);
  });

  test('is turned away for a school that does not exist or has not connected', async ({
    api,
    schools: { orgA },
  }) => {
    await deliver(api, {
      organizationId: 'no-such-school',
      secret: 'x',
    }).expect(404);
    await deliver(api, { organizationId: orgA.id, secret: 'x' }).expect(404);
  });

  test('is ignored when the event is not a successful transaction', async ({
    api,
    monnify,
    pool,
    schools,
  }) => {
    const { owner, orgA } = schools;
    await ready({
      api,
      pool,
      monnify,
      owner,
      logins: schools.studentLekki.logins,
    });

    const res = await deliver(api, {
      organizationId: orgA.id,
      secret: KEYS.secretKey,
      body: { ...notice(), eventType: 'SUCCESSFUL_DISBURSEMENT' },
    }).expect(200);

    expect(res.body as MonnifyWebhookResult).toEqual({ status: 'ignored' });
    expect(await count(pool, 'gateway_topup')).toBe(0);
  });

  test('writes a finance activity row by the gateway on the family’s campus, with no secret-like key', async ({
    api,
    monnify,
    pool,
    schools,
  }) => {
    const { owner, orgA, lekki } = schools;
    await ready({
      api,
      pool,
      monnify,
      owner,
      logins: schools.studentLekki.logins,
    });
    await deliver(api, {
      organizationId: orgA.id,
      secret: KEYS.secretKey,
    }).expect(200);

    const { rows } = await pool.query<{
      campus_id: string;
      actor_user_id: string;
      subject_type: string;
      data: Record<string, unknown>;
    }>(
      `SELECT campus_id, actor_user_id, subject_type, data FROM activity_event
       WHERE kind = 'wallet.topped_up'`
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      campus_id: lekki.id,
      actor_user_id: 'system:monnify',
      subject_type: 'gateway_topup',
    });
    expect(Object.keys(rows[0]?.data ?? {}).join(' ')).not.toMatch(
      /pass(?:word|wd)|secret|token/i
    );
  });

  test('the database refuses a top-up that is edited, unverified or whose parts do not add up', async ({
    api,
    monnify,
    pool,
    schools,
  }) => {
    const { owner, orgA } = schools;
    await ready({
      api,
      pool,
      monnify,
      owner,
      logins: schools.studentLekki.logins,
    });
    await deliver(api, {
      organizationId: orgA.id,
      secret: KEYS.secretKey,
    }).expect(200);

    await expect(
      pool.query('UPDATE gateway_topup SET net_minor = net_minor + 1')
    ).rejects.toThrow(/append-only/);
    await expect(pool.query('DELETE FROM gateway_topup')).rejects.toThrow(
      /append-only/
    );
    const copy = (parts: {
      verified: boolean;
      gross: number;
      fee: number;
      net: number;
    }) =>
      pool.query(
        `INSERT INTO gateway_topup (organization_id, wallet_id, reserved_account_id, reference,
           payment_reference, gross_minor, fee_minor, net_minor, paid_at, signature_verified,
           journal_entry_id)
         SELECT organization_id, wallet_id, reserved_account_id, 'MNFY|raw', payment_reference,
           $1, $2, $3, paid_at, $4, journal_entry_id FROM gateway_topup`,
        [parts.gross, parts.fee, parts.net, parts.verified]
      );
    const good = { verified: true, gross: GROSS, fee: GROSS - NET, net: NET };
    await expect(copy({ ...good, verified: false })).rejects.toThrow(
      /gateway_topup_signature_verified/
    );
    await expect(copy({ ...good, fee: GROSS - NET + 1 })).rejects.toThrow(
      /gateway_topup_gross_is_net_plus_fee/
    );
    await expect(copy({ ...good, gross: 0, fee: 0, net: 0 })).rejects.toThrow(
      /gateway_topup_net_positive/
    );
    await expect(
      copy({ ...good, fee: -10, net: NET + GROSS - NET + 10 })
    ).rejects.toThrow(/gateway_topup_fee_not_negative/);
  });

  test('the database refuses a top-up whose account belongs to another school', async ({
    api,
    app,
    monnify,
    pool,
    schools,
  }) => {
    const { owner, ownerB, orgA, studentB } = schools;
    await ready({
      api,
      pool,
      monnify,
      owner,
      logins: schools.studentLekki.logins,
    });
    await deliver(api, {
      organizationId: orgA.id,
      secret: KEYS.secretKey,
    }).expect(200);
    await connect(api, ownerB, {
      apiKey: 'MK_TEST_APIKEYB02',
      secretKey: SECRET_B,
    }).expect(200);
    const walletB = await walletIdOf(pool, guardianIdOf(studentB.logins));
    await api(ownerB)
      .post(`/finance/wallets/${walletB}/reserved-account`)
      .expect(200);

    const account = await cashAccount(app, owner);
    await topUpWallet(api, owner, {
      walletId: await walletIdOf(
        pool,
        guardianIdOf(schools.studentLekki.logins)
      ),
      accountId: account.id,
    });
    const entry = await pool.query<{ journal_entry_id: string }>(
      'SELECT journal_entry_id FROM wallet_topup'
    );
    await expect(
      pool.query(
        `INSERT INTO gateway_topup (organization_id, wallet_id, reserved_account_id, reference,
           payment_reference, gross_minor, fee_minor, net_minor, paid_at, signature_verified,
           journal_entry_id)
         SELECT t.organization_id, t.wallet_id,
           (SELECT id FROM wallet_reserved_account WHERE wallet_id = $1), 'MNFY|cross',
           'p', 100, 0, 100, now(), TRUE, $2
         FROM gateway_topup t`,
        [walletB, entry.rows[0]?.journal_entry_id]
      )
    ).rejects.toThrow(/foreign key/);
  });
});

test.describe('staff top-ups', () => {
  test('cannot use a reference that looks like a Monnify number', async ({
    api,
    app,
    pool,
    schools: { owner, studentLekki },
  }) => {
    const account = await cashAccount(app, owner);
    const walletId = await walletIdOf(pool, guardianIdOf(studentLekki.logins));

    const res = await postTopUp(api, owner, {
      walletId,
      accountId: account.id,
      reference: 'MNFY|20|20261024120000|000009',
      status: 400,
    });

    expect(JSON.stringify(res.body)).toContain(RESERVED_REFERENCE_MESSAGE);
  });
});

test.describe('isolation', () => {
  test('another school finds no connection of A’s and no reserved account on A’s wallet', async ({
    api,
    pool,
    schools: { owner, ownerB, studentLekki },
  }) => {
    await connect(api, owner).expect(200);
    const walletId = await walletIdOf(pool, guardianIdOf(studentLekki.logins));

    const read = (await api(ownerB).get('/finance/gateway/monnify').expect(200))
      .body as GatewayConnection;
    expect(read.connection).toBeNull();
    const refused = await api(ownerB)
      .post(`/finance/wallets/${walletId}/reserved-account`)
      .expect(404);

    expect(refused.body).toMatchObject({ message: WALLET_NOT_FOUND_MESSAGE });
    expect(await count(pool, 'wallet_reserved_account')).toBe(0);
  });

  test('a campus member cannot create the account of a family on another campus', async ({
    api,
    pool,
    schools: { owner, lekkiOnly, studentIkeja },
  }) => {
    await connect(api, owner).expect(200);
    const walletId = await walletIdOf(pool, guardianIdOf(studentIkeja.logins));

    await api(lekkiOnly)
      .post(`/finance/wallets/${walletId}/reserved-account`)
      .expect(404);
  });

  test('the connection routes are for the owner only', async ({
    api,
    schools: { lekkiOnly, noPermission },
  }) => {
    for (const actor of [lekkiOnly, noPermission]) {
      await api(actor).get('/finance/gateway/monnify').expect(403);
      await connect(api, actor).expect(403);
      await api(actor).post('/finance/gateway/monnify/test').expect(403);
    }
  });

  test('creating a reserved account needs permission to top up', async ({
    api,
    pool,
    schools: { noPermission, studentLekki },
  }) => {
    const walletId = await walletIdOf(pool, guardianIdOf(studentLekki.logins));

    await api(noPermission)
      .post(`/finance/wallets/${walletId}/reserved-account`)
      .expect(403);
  });

  test('no session answers 401', async ({
    api,
    schools: { studentLekki },
    pool,
  }) => {
    const walletId = await walletIdOf(pool, guardianIdOf(studentLekki.logins));

    await api().get('/finance/gateway/monnify').expect(401);
    await api().put('/finance/gateway/monnify').send(KEYS).expect(401);
    await api().post('/finance/gateway/monnify/test').expect(401);
    await api()
      .post(`/finance/wallets/${walletId}/reserved-account`)
      .expect(401);
  });

  test('a super admin acting without a reason cannot change the connection', async ({
    api,
    createUser,
    makeSuperAdmin,
    pool,
    schools: { orgA },
  }) => {
    const admin = await makeSuperAdmin(await createUser());

    const res = await connect(api, admin).set(acting(orgA.id)).expect(403);

    expect(res.body).toMatchObject({ code: 'ActingReadOnly' });
    expect(await count(pool, 'gateway_connection')).toBe(0);
  });

  test('a guardian sees their own reserved account on their portal wallet and not another family’s', async ({
    api,
    pool,
    schools: { owner, studentLekki, studentIkeja },
  }) => {
    await connect(api, owner).expect(200);
    const lekkiWallet = await walletIdOf(
      pool,
      guardianIdOf(studentLekki.logins)
    );
    const ikejaWallet = await walletIdOf(
      pool,
      guardianIdOf(studentIkeja.logins)
    );
    await api(owner)
      .post(`/finance/wallets/${lekkiWallet}/reserved-account`)
      .expect(200);
    await api(owner)
      .post(`/finance/wallets/${ikejaWallet}/reserved-account`)
      .expect(200);

    const signedIn = await signInAs(api, guardianOf(studentLekki.logins));
    const own = (await api(signedIn).get('/portal/wallet').expect(200))
      .body as Wallet;

    expect(own.id).toBe(lekkiWallet);
    expect(own.reservedAccount).not.toBeNull();
    expect(JSON.stringify(own)).not.toContain(ikejaWallet);
  });
});
