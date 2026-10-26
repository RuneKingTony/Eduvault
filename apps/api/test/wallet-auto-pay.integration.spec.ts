import { createHmac } from 'node:crypto';
import {
  WALLET_NOT_FOUND_MESSAGE,
  WALLET_REFERENCE_TAKEN_MESSAGE,
  type PortalWalletMovementList,
  type Wallet,
} from '@eduvault/api-contract';
import type { Pool } from 'pg';
import { reservedAccountReference } from '../src/app/modules/gateway/reserved-account.service';
import { expect, type Fixtures } from './support/base-test';
import { importOpening } from './support/factories/finance';
import { receivableBalance } from './support/factories/billing';
import { bankAccount } from './support/factories/payments';
import {
  cashAccount,
  requestRefund,
  topUpBody,
  topUpWallet,
  walletIdOf,
} from './support/factories/wallets';
import { family, guardianOf, signInAs } from './support/portal';
import { schoolsTest as test } from './support/two-schools';

type Api = Fixtures['api'];

const OWED = 2_000_000;
const TOP_UP = 5_000_000;
const SECRET = 'SECRET-OF-SCHOOL-A-0001';
const MONNIFY_REFERENCE = 'MNFY|20|20261025120000|000007';

const owing = (
  app: Parameters<typeof importOpening>[0],
  owner: Parameters<typeof importOpening>[1],
  debts: { studentId: string; amountMinor: number; effectiveOn: string }[]
) =>
  importOpening(app, owner, {
    items: debts.map((debt) => ({ ...debt, direction: 'debt' })),
  });

const autoPay = (
  api: Api,
  guardian: Parameters<Api>[0],
  change: { reference: string; enabled?: boolean }
) =>
  api(guardian)
    .put('/portal/wallet/auto-pay')
    .send({ enabled: change.enabled ?? true, reference: change.reference });

const spendCount = async (pool: Pool) =>
  Number(
    (
      await pool.query<{ n: string }>(
        'SELECT count(*)::text AS n FROM wallet_spend'
      )
    ).rows[0]?.n
  );

test.describe('auto-pay', () => {
  test('is off by default: a top-up pays nothing', async ({
    api,
    app,
    pool,
    schools,
  }) => {
    const { owner, orgA } = schools;
    const account = await cashAccount(app, owner);
    const { ada, guardianLogin } = await family(app, schools);
    await owing(app, owner, [
      { studentId: ada.id, amountMinor: OWED, effectiveOn: '2026-09-01' },
    ]);
    const walletId = await walletIdOf(pool, guardianLogin?.guardianId ?? '');
    const topUp = await topUpWallet(api, owner, {
      walletId,
      accountId: account.id,
      amountMinor: TOP_UP,
    });
    expect(topUp.wallet.autoPay).toBe(false);
    expect(topUp.wallet.balanceMinor).toBe(TOP_UP);
    expect(await spendCount(pool)).toBe(0);
    expect(await receivableBalance(pool, orgA.id, ada.id)).toBe(OWED);
  });

  test('pays the child with the oldest charge first when money lands, in the same transaction as the top-up', async ({
    api,
    app,
    pool,
    schools,
  }) => {
    const { owner, orgA } = schools;
    const account = await cashAccount(app, owner);
    const { ada, tobi, guardianLogin } = await family(app, schools);
    await owing(app, owner, [
      { studentId: ada.id, amountMinor: OWED, effectiveOn: '2026-09-01' },
      { studentId: tobi.id, amountMinor: OWED, effectiveOn: '2026-03-01' },
    ]);
    const walletId = await walletIdOf(pool, guardianLogin?.guardianId ?? '');
    const guardian = await signInAs(api, guardianLogin);
    const on = await autoPay(api, guardian, { reference: 'APY-ON-1' }).expect(
      200
    );
    expect((on.body as Wallet).autoPay).toBe(true);

    const reference = 'CSH-20261025-AUTO01';
    const topUp = await topUpWallet(api, owner, {
      walletId,
      accountId: account.id,
      amountMinor: 3_000_000,
      reference,
    });

    expect(await receivableBalance(pool, orgA.id, tobi.id)).toBe(0);
    expect(await receivableBalance(pool, orgA.id, ada.id)).toBe(1_000_000);
    expect(topUp.wallet.balanceMinor).toBe(0);
    const spends = await pool.query<{ reference: string; kind: string }>(
      `SELECT s.reference, e.kind FROM wallet_spend s JOIN journal_entry e ON e.id = s.journal_entry_id`
    );
    expect(spends.rows).toEqual([
      { reference: `AUTOPAY-${reference}`, kind: 'wallet_spend' },
    ]);
    const activity = await pool.query<{ kind: string }>(
      `SELECT kind FROM activity_event WHERE kind = 'wallet.spent'`
    );
    expect(activity.rows.length).toBeGreaterThan(0);
  });

  for (const [name, revoke] of [
    [
      'has lost wallet:spend',
      `UPDATE "member" SET role = '' WHERE "userId" = $1`,
    ],
    ['is no longer a member', `DELETE FROM "member" WHERE "userId" = $1`],
  ] as const) {
    test(`pays nothing when the guardian who switched it on ${name}`, async ({
      api,
      app,
      pool,
      schools,
    }) => {
      const { owner, orgA } = schools;
      const account = await cashAccount(app, owner);
      const { ada, guardianLogin } = await family(app, schools);
      await owing(app, owner, [
        { studentId: ada.id, amountMinor: OWED, effectiveOn: '2026-09-01' },
      ]);
      const walletId = await walletIdOf(pool, guardianLogin?.guardianId ?? '');
      const guardian = await signInAs(api, guardianLogin);
      await autoPay(api, guardian, { reference: 'APY-ON-REVOKED' }).expect(200);
      const setting = await pool.query<{ created_by: string }>(
        'SELECT created_by FROM wallet_auto_pay_setting WHERE organization_id = $1',
        [orgA.id]
      );
      await pool.query(revoke, [setting.rows[0]?.created_by]);

      const topUp = await topUpWallet(api, owner, {
        walletId,
        accountId: account.id,
        amountMinor: TOP_UP,
      });

      expect(topUp.wallet.balanceMinor).toBe(TOP_UP);
      expect(await spendCount(pool)).toBe(0);
      expect(await receivableBalance(pool, orgA.id, ada.id)).toBe(OWED);
    });
  }

  test('pays only from the free money while a refund request holds some of the wallet', async ({
    api,
    app,
    pool,
    schools,
  }) => {
    const { owner, orgA } = schools;
    const account = await cashAccount(app, owner);
    const bank = await bankAccount(app, owner);
    const { ada, guardianLogin } = await family(app, schools);
    await owing(app, owner, [
      { studentId: ada.id, amountMinor: OWED, effectiveOn: '2026-09-01' },
    ]);
    const walletId = await walletIdOf(pool, guardianLogin?.guardianId ?? '');
    const guardian = await signInAs(api, guardianLogin);
    await topUpWallet(api, owner, {
      walletId,
      accountId: account.id,
      amountMinor: 1_500_000,
    });
    await requestRefund(api, owner, {
      walletId,
      accountId: bank.id,
      amountMinor: 1_200_000,
    });
    await autoPay(api, guardian, { reference: 'APY-ON-HELD' }).expect(200);

    const topUp = await topUpWallet(api, owner, {
      walletId,
      accountId: account.id,
      amountMinor: 1_000_000,
    });

    expect(await receivableBalance(pool, orgA.id, ada.id)).toBe(
      OWED - 1_300_000
    );
    expect(topUp.wallet).toMatchObject({
      balanceMinor: 1_200_000,
      heldMinor: 1_200_000,
      freeMinor: 0,
    });
  });

  test('posts once when the same top-up is sent again', async ({
    api,
    app,
    pool,
    schools,
  }) => {
    const { owner, orgA } = schools;
    const account = await cashAccount(app, owner);
    const { ada, guardianLogin } = await family(app, schools);
    await owing(app, owner, [
      { studentId: ada.id, amountMinor: OWED, effectiveOn: '2026-09-01' },
    ]);
    const walletId = await walletIdOf(pool, guardianLogin?.guardianId ?? '');
    const guardian = await signInAs(api, guardianLogin);
    await autoPay(api, guardian, { reference: 'APY-ON-2' }).expect(200);

    const body = await topUpBody(api, owner, {
      accountId: account.id,
      amountMinor: 1_500_000,
      reference: 'CSH-20261025-AUTO02',
    });
    await api(owner)
      .post(`/finance/wallets/${walletId}/top-ups`)
      .send(body)
      .expect(201);
    await api(owner)
      .post(`/finance/wallets/${walletId}/top-ups`)
      .send(body)
      .expect(200);

    expect(await spendCount(pool)).toBe(1);
    expect(await receivableBalance(pool, orgA.id, ada.id)).toBe(500_000);
  });

  test('uses set-aside money first and leaves what a child does not owe in the wallet', async ({
    api,
    app,
    pool,
    schools,
  }) => {
    const { owner, orgA } = schools;
    const account = await cashAccount(app, owner);
    const { ada, tobi, guardianLogin } = await family(app, schools);
    const walletId = await walletIdOf(pool, guardianLogin?.guardianId ?? '');
    await topUpWallet(api, owner, {
      walletId,
      accountId: account.id,
      amountMinor: 1_000_000,
    });
    const guardian = await signInAs(api, guardianLogin);
    await api(guardian)
      .post('/portal/wallet/earmarks')
      .send({
        reference: 'ERM-AUTO-1',
        studentId: tobi.id,
        amountMinor: 400_000,
      })
      .expect(201);
    await owing(app, owner, [
      { studentId: ada.id, amountMinor: 300_000, effectiveOn: '2026-02-01' },
      { studentId: tobi.id, amountMinor: 900_000, effectiveOn: '2026-03-01' },
    ]);
    await autoPay(api, guardian, { reference: 'APY-ON-3' }).expect(200);

    const res = await topUpWallet(api, owner, {
      walletId,
      accountId: account.id,
      amountMinor: 200_000,
    });

    expect(await receivableBalance(pool, orgA.id, ada.id)).toBe(0);
    expect(await receivableBalance(pool, orgA.id, tobi.id)).toBe(0);
    expect(res.wallet.balanceMinor).toBe(1_200_000 - 300_000 - 900_000);
    expect(res.wallet.setAsideMinor).toBe(0);
  });

  test('can be turned off again, and the latest row of the log counts', async ({
    api,
    app,
    pool,
    schools,
  }) => {
    const { owner, orgA } = schools;
    const account = await cashAccount(app, owner);
    const { ada, guardianLogin } = await family(app, schools);
    await owing(app, owner, [
      { studentId: ada.id, amountMinor: OWED, effectiveOn: '2026-09-01' },
    ]);
    const walletId = await walletIdOf(pool, guardianLogin?.guardianId ?? '');
    const guardian = await signInAs(api, guardianLogin);
    await autoPay(api, guardian, { reference: 'APY-LOG-1' }).expect(200);
    const off = await autoPay(api, guardian, {
      reference: 'APY-LOG-2',
      enabled: false,
    }).expect(200);
    expect((off.body as Wallet).autoPay).toBe(false);

    await topUpWallet(api, owner, { walletId, accountId: account.id });

    expect(await spendCount(pool)).toBe(0);
    expect(await receivableBalance(pool, orgA.id, ada.id)).toBe(OWED);
    const log = await pool.query<{ enabled: boolean }>(
      'SELECT enabled FROM wallet_auto_pay_setting ORDER BY sequence'
    );
    expect(log.rows.map((row) => row.enabled)).toEqual([true, false]);
    await expect(
      pool.query('UPDATE wallet_auto_pay_setting SET enabled = TRUE')
    ).rejects.toThrow(/append-only/);
    await expect(
      pool.query('DELETE FROM wallet_auto_pay_setting')
    ).rejects.toThrow(/append-only/);
  });

  test('never loses the top-up when paying from it fails', async ({
    api,
    app,
    pool,
    schools,
  }) => {
    const { owner, orgA } = schools;
    const account = await cashAccount(app, owner);
    const { ada, guardianLogin } = await family(app, schools);
    await owing(app, owner, [
      { studentId: ada.id, amountMinor: OWED, effectiveOn: '2026-09-01' },
    ]);
    const walletId = await walletIdOf(pool, guardianLogin?.guardianId ?? '');
    const guardian = await signInAs(api, guardianLogin);
    await autoPay(api, guardian, { reference: 'APY-FAIL-1' }).expect(200);
    await pool.query(`
      CREATE FUNCTION refuse_spend() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'spend refused for the test'; END; $$;
      CREATE TRIGGER refuse_spend BEFORE INSERT ON wallet_spend
        FOR EACH ROW EXECUTE FUNCTION refuse_spend();`);
    try {
      const topUp = await topUpWallet(api, owner, {
        walletId,
        accountId: account.id,
        amountMinor: 1_500_000,
      });
      expect(topUp.wallet.balanceMinor).toBe(1_500_000);
    } finally {
      await pool.query(
        'DROP TRIGGER refuse_spend ON wallet_spend; DROP FUNCTION refuse_spend();'
      );
    }

    expect(await spendCount(pool)).toBe(0);
    expect(await receivableBalance(pool, orgA.id, ada.id)).toBe(OWED);
    const entries = await pool.query(
      `SELECT 1 FROM journal_entry WHERE kind = 'wallet_spend'`
    );
    expect(entries.rowCount).toBe(0);
  });

  test('answers a repeated reference 200 and records it once, and another body with the same reference 409', async ({
    api,
    app,
    pool,
    schools,
  }) => {
    const { guardianLogin } = await family(app, schools);
    const guardian = await signInAs(api, guardianLogin);
    await autoPay(api, guardian, { reference: 'APY-REPLAY-1' }).expect(200);
    const again = await autoPay(api, guardian, {
      reference: 'APY-REPLAY-1',
    }).expect(200);
    expect((again.body as Wallet).autoPay).toBe(true);
    const changed = await autoPay(api, guardian, {
      reference: 'APY-REPLAY-1',
      enabled: false,
    }).expect(409);
    expect(changed.body.message).toBe(WALLET_REFERENCE_TAKEN_MESSAGE);
    const rows = await pool.query('SELECT 1 FROM wallet_auto_pay_setting');
    expect(rows.rowCount).toBe(1);
  });

  test('refuses someone without wallet:spend with 403, a staff member who is no guardian with 404, and no session with 401', async ({
    api,
    schools: { owner, noPermission },
  }) => {
    await autoPay(api, noPermission, { reference: 'APY-403' }).expect(403);
    const missing = await autoPay(api, owner, { reference: 'APY-404' }).expect(
      404
    );
    expect(missing.body.message).toBe(WALLET_NOT_FOUND_MESSAGE);
    await api()
      .put('/portal/wallet/auto-pay')
      .send({ enabled: true, reference: 'APY-401' })
      .expect(401);
  });

  test('keeps one family’s switch away from another’s, and from another school', async ({
    api,
    app,
    pool,
    schools,
  }) => {
    const { owner, orgA, studentLekki } = schools;
    const account = await cashAccount(app, owner);
    const { ada, guardianLogin } = await family(app, schools);
    const other = guardianOf(studentLekki.logins);
    await owing(app, owner, [
      { studentId: ada.id, amountMinor: OWED, effectiveOn: '2026-09-01' },
      {
        studentId: studentLekki.id,
        amountMinor: OWED,
        effectiveOn: '2026-09-01',
      },
    ]);
    const guardian = await signInAs(api, guardianLogin);
    await autoPay(api, guardian, { reference: 'APY-MINE' }).expect(200);

    const otherWallet = await walletIdOf(pool, other?.guardianId ?? '');
    const res = await topUpWallet(api, owner, {
      walletId: otherWallet,
      accountId: account.id,
    });

    expect(res.wallet.autoPay).toBe(false);
    expect(await spendCount(pool)).toBe(0);
    expect(await receivableBalance(pool, orgA.id, studentLekki.id)).toBe(OWED);
  });
});

test.describe('auto-pay on a Monnify payment', () => {
  test('pays the oldest charge in the transaction that credits the wallet, and pays nothing twice on a replay', async ({
    api,
    app,
    monnify,
    pool,
    schools,
  }) => {
    const { owner, orgA } = schools;
    const { ada, guardianLogin } = await family(app, schools);
    await owing(app, owner, [
      { studentId: ada.id, amountMinor: OWED, effectiveOn: '2026-09-01' },
    ]);
    const walletId = await walletIdOf(pool, guardianLogin?.guardianId ?? '');
    await api(owner)
      .put('/finance/gateway/monnify')
      .send({
        mode: 'sandbox',
        contractCode: '2957982769',
        apiKey: 'MK_TEST_APIKEY0001',
        secretKey: SECRET,
      })
      .expect(200);
    await api(owner)
      .post(`/finance/wallets/${walletId}/reserved-account`)
      .expect(200);
    monnify.transactions.set(MONNIFY_REFERENCE, {
      transactionReference: MONNIFY_REFERENCE,
      paymentReference: 'pay-auto',
      paymentStatus: 'PAID',
      currency: 'NGN',
      amountPaidMinor: 1_500_000,
      settlementMinor: 1_480_000,
      paidAt: new Date('2026-10-25T11:15:29Z'),
      accountReference: reservedAccountReference(walletId),
    });
    const guardian = await signInAs(api, guardianLogin);
    await autoPay(api, guardian, { reference: 'APY-MNFY' }).expect(200);
    const raw = JSON.stringify({
      eventType: 'SUCCESSFUL_TRANSACTION',
      eventData: {
        transactionReference: MONNIFY_REFERENCE,
        paymentReference: 'pay-auto',
        amountPaid: 15_000,
      },
    });
    const deliver = () =>
      api()
        .post(`/webhooks/monnify/${orgA.id}`)
        .set('Content-Type', 'application/json')
        .set(
          'monnify-signature',
          createHmac('sha512', SECRET).update(raw).digest('hex')
        )
        .send(raw);

    await deliver().expect(200);
    await deliver().expect(200);

    expect(await receivableBalance(pool, orgA.id, ada.id)).toBe(
      OWED - 1_480_000
    );
    const spends = await pool.query<{ reference: string }>(
      'SELECT reference FROM wallet_spend'
    );
    expect(spends.rows).toHaveLength(1);
    expect(spends.rows[0]?.reference.startsWith('AUTOPAY-')).toBe(true);
    const wallet = (await api(guardian).get('/portal/wallet').expect(200))
      .body as Wallet;
    expect(wallet.balanceMinor).toBe(0);
  });
});

test.describe('the guardian’s movements', () => {
  test('list the family’s own movements without who recorded them or the receipt file', async ({
    api,
    app,
    pool,
    schools,
  }) => {
    const { owner } = schools;
    const account = await cashAccount(app, owner);
    const { ada, guardianLogin } = await family(app, schools);
    await owing(app, owner, [
      { studentId: ada.id, amountMinor: OWED, effectiveOn: '2026-09-01' },
    ]);
    const walletId = await walletIdOf(pool, guardianLogin?.guardianId ?? '');
    await topUpWallet(api, owner, {
      walletId,
      accountId: account.id,
      depositorName: 'Uncle Bode',
    });
    const guardian = await signInAs(api, guardianLogin);
    await api(guardian)
      .post('/portal/wallet/spend')
      .send({
        reference: 'WSP-MOVES-1',
        lines: [{ studentId: ada.id, amountMinor: 700_000 }],
      })
      .expect(201);

    const res = await api(guardian).get('/portal/wallet/movements').expect(200);
    const list = res.body as PortalWalletMovementList;

    expect(list.currency).toBe('NGN');
    expect(list.total).toBe(2);
    expect(list.items.map((item) => item.kind)).toEqual([
      'wallet_spend',
      'wallet_topup',
    ]);
    expect(list.items.map((item) => item.amountMinor)).toEqual([
      -700_000,
      TOP_UP,
    ]);
    const text = JSON.stringify(res.body);
    for (const hidden of ['madeBy', 'proofFileId', 'entryId', 'lineId']) {
      expect(text).not.toContain(hidden);
    }
    expect(list.items[1]?.source).toEqual({
      type: 'topup',
      method: 'cash',
      depositorName: 'Uncle Bode',
    });
  });

  test('never show another family’s movements, or those of another school', async ({
    api,
    app,
    pool,
    schools,
  }) => {
    const { owner, studentLekki } = schools;
    const account = await cashAccount(app, owner);
    const { guardianLogin } = await family(app, schools);
    const own = await walletIdOf(pool, guardianLogin?.guardianId ?? '');
    const theirs = await walletIdOf(
      pool,
      guardianOf(studentLekki.logins)?.guardianId ?? ''
    );
    await topUpWallet(api, owner, {
      walletId: theirs,
      accountId: account.id,
      amountMinor: 1_234_500,
    });
    await topUpWallet(api, owner, {
      walletId: own,
      accountId: account.id,
      amountMinor: 777_700,
    });

    const guardian = await signInAs(api, guardianLogin);
    const mine = (
      await api(guardian).get('/portal/wallet/movements').expect(200)
    ).body as PortalWalletMovementList;
    expect(mine.items.map((item) => item.amountMinor)).toEqual([777_700]);

    const neighbour = await signInAs(api, guardianOf(studentLekki.logins));
    const theirList = (
      await api(neighbour).get('/portal/wallet/movements').expect(200)
    ).body as PortalWalletMovementList;
    expect(theirList.items.map((item) => item.amountMinor)).toEqual([
      1_234_500,
    ]);

    const foreign = await signInAs(api, guardianOf(schools.studentB.logins));
    const foreignList = (
      await api(foreign).get('/portal/wallet/movements').expect(200)
    ).body as PortalWalletMovementList;
    expect(foreignList.items).toEqual([]);
  });

  test('pages with page and pageSize', async ({ api, app, pool, schools }) => {
    const { owner } = schools;
    const account = await cashAccount(app, owner);
    const { guardianLogin } = await family(app, schools);
    const walletId = await walletIdOf(pool, guardianLogin?.guardianId ?? '');
    for (const amountMinor of [100_000, 200_000, 300_000]) {
      await topUpWallet(api, owner, {
        walletId,
        accountId: account.id,
        amountMinor,
      });
    }
    const guardian = await signInAs(api, guardianLogin);

    const second = (
      await api(guardian)
        .get('/portal/wallet/movements?page=2&pageSize=2')
        .expect(200)
    ).body as PortalWalletMovementList;

    expect(second.total).toBe(3);
    expect(second.items.map((item) => item.amountMinor)).toEqual([100_000]);
  });

  test('answer 404 to a staff member who is no guardian, 403 without wallet:readOwn and 401 without a session', async ({
    api,
    schools: { owner, noPermission },
  }) => {
    const missing = await api(owner)
      .get('/portal/wallet/movements')
      .expect(404);
    expect(missing.body.message).toBe(WALLET_NOT_FOUND_MESSAGE);
    await api(noPermission).get('/portal/wallet/movements').expect(403);
    await api().get('/portal/wallet/movements').expect(401);
  });
});

test.describe('the portal profile', () => {
  test('carries the school profile email for the refund note, null when unset', async ({
    api,
    app,
    pool,
    schools,
  }) => {
    const { orgA } = schools;
    const { guardianLogin } = await family(app, schools);
    const guardian = await signInAs(api, guardianLogin);
    const unset = (await api(guardian).get('/portal/me').expect(200)).body as {
      school: { email: string | null };
    };
    expect(unset.school.email).toBeNull();

    await pool.query(
      'UPDATE school_account SET email = $1 WHERE organization_id = $2',
      ['bursar@greenfield.test', orgA.id]
    );
    const set = (await api(guardian).get('/portal/me').expect(200)).body as {
      school: { email: string | null };
    };
    expect(set.school.email).toBe('bursar@greenfield.test');
  });
});
