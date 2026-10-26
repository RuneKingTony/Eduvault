import { readFileSync } from 'node:fs';
import {
  WALLET_ACCOUNT_GATEWAY_MESSAGE,
  WALLET_ACCOUNT_NOT_FOUND_MESSAGE,
  WALLET_NOT_FOUND_MESSAGE,
  WALLET_PROOF_NOT_FOUND_MESSAGE,
  WALLET_PROOF_TAKEN_MESSAGE,
  WALLET_REFERENCE_TAKEN_MESSAGE,
  WALLET_STUDENT_NOT_FOUND_MESSAGE,
  walletEarmarkReleaseOverMessage,
  walletEarmarkSetOverMessage,
  walletSpendOverMessage,
  type EarmarkedWallet,
  type FileRef,
  type SpentWallet,
  type StudentStatement,
  type ToppedUpWallet,
  type TopUpOptions,
  type Wallet,
  type WalletList,
  type PortalWalletMovementList,
  type WalletMovementList,
} from '@eduvault/api-contract';
import { acting, expect } from './support/base-test';
import { receivableBalance } from './support/factories/billing';
import { journalItems } from './support/wallet-movements';
import { gatewayAccountId } from './support/factories/store';
import { ledgerAccountId } from './support/factories/finance';
import {
  PDF_BYTES,
  bankAccount,
  nextReference,
  owes,
} from './support/factories/payments';
import {
  cashAccount,
  postTopUp,
  requestRefund,
  topUpBody,
  topUpWallet,
  uploadRefundEmail,
  uploadWalletProof,
  walletIdOf,
} from './support/factories/wallets';
import { createStudent } from './support/factories/students';
import { family, guardianOf, signInAs } from './support/portal';
import { schoolsTest as test } from './support/two-schools';

const TOP_UP = 5_000_000;
const OWED = 2_000_000;

const sumOf = async (
  pool: {
    query: (
      sql: string,
      values: unknown[]
    ) => Promise<{ rows: { n: string }[] }>;
  },
  sql: string,
  values: unknown[]
) => Number((await pool.query(sql, values)).rows[0]?.n);

const walletWrites = (pool: Parameters<typeof sumOf>[0]) =>
  sumOf(
    pool,
    `SELECT (SELECT count(*) FROM wallet_topup) + (SELECT count(*) FROM wallet_spend) + (SELECT count(*) FROM wallet_earmark) AS n`,
    []
  );

const familyBalance = (
  pool: Parameters<typeof sumOf>[0],
  organizationId: string,
  guardianId: string
) =>
  sumOf(
    pool,
    `SELECT COALESCE(sum(jl.credit_minor - jl.debit_minor), 0)::text AS n
     FROM journal_line jl
     JOIN ledger_account la ON la.id = jl.ledger_account_id
     WHERE jl.organization_id = $1 AND jl.family_id = $2
       AND la.system_key = 'student_wallets'`,
    [organizationId, guardianId]
  );

const guardianIdOf = (student: Parameters<typeof guardianOf>[0]) =>
  guardianOf(student)?.guardianId ?? '';

test.describe('a wallet for every paying guardian', () => {
  test('is created once by the database for each paying guardian, in every school', async ({
    pool,
    schools: { studentLekki, studentIkeja, studentB },
  }) => {
    const paying = guardianIdOf(studentLekki.logins);
    const { rows } = await pool.query<{ guardian_id: string }>(
      'SELECT guardian_id FROM wallet ORDER BY guardian_id'
    );
    expect(rows.map((row) => row.guardian_id)).toEqual(
      [
        paying,
        guardianIdOf(studentIkeja.logins),
        guardianIdOf(studentB.logins),
      ].toSorted((a, b) => a.localeCompare(b))
    );

    await pool.query(
      `UPDATE guardian_student SET pays_fees = FALSE WHERE guardian_id = $1`,
      [paying]
    );
    await pool.query(
      `UPDATE guardian_student SET pays_fees = TRUE WHERE guardian_id = $1`,
      [paying]
    );
    expect(
      await sumOf(
        pool,
        'SELECT count(*)::text AS n FROM wallet WHERE guardian_id = $1',
        [paying]
      )
    ).toBe(1);
  });

  test('is created only when a guardian first pays, not for a guardian linked without paying', async ({
    app,
    pool,
    schools: { owner, lekki },
  }) => {
    const student = await createStudent(app, owner, {
      campusId: lekki.id,
      guardians: [
        {
          new: {
            fullName: 'Mrs Payer',
            phone: '08022221111',
            address: '1 Test Street',
            relationship: 'mother',
            paysFees: true,
            login: { kind: 'username' },
          },
        },
        {
          new: {
            fullName: 'Mr Sponsor',
            phone: '08033334444',
            address: '2 Test Street',
            relationship: 'father',
            paysFees: false,
            login: { kind: 'username' },
          },
        },
      ],
    });
    const sponsor = student.logins.filter(
      (login) => login.who === 'guardian'
    )[1];
    const guardian = sponsor?.guardianId ?? '';
    const wallets = () =>
      sumOf(
        pool,
        'SELECT count(*)::text AS n FROM wallet WHERE guardian_id = $1',
        [guardian]
      );
    expect(await wallets()).toBe(0);
    await pool.query(
      `UPDATE guardian_student SET pays_fees = TRUE WHERE guardian_id = $1`,
      [guardian]
    );
    expect(await wallets()).toBe(1);
  });
});

test.describe('topping up a wallet', () => {
  test('posts one balanced entry that credits 2200 with the family, and shows it on the wallet', async ({
    api,
    app,
    pool,
    schools: { owner, orgA, studentLekki },
  }) => {
    const account = await cashAccount(app, owner);
    const guardianId = guardianIdOf(studentLekki.logins);
    const walletId = await walletIdOf(pool, guardianId);
    const reference = nextReference('CSH');

    const res = await postTopUp(api, owner, {
      walletId,
      accountId: account.id,
      amountMinor: TOP_UP,
      reference,
      depositorName: 'Uncle Bode',
      status: 201,
    });

    const topUp = res.body as ToppedUpWallet;
    expect(topUp).toMatchObject({
      reference,
      amountMinor: TOP_UP,
      method: 'cash',
      replayed: false,
    });
    expect(topUp.wallet).toMatchObject({
      id: walletId,
      balanceMinor: TOP_UP,
      setAsideMinor: 0,
      freeMinor: TOP_UP,
    });

    const { rows } = await pool.query<{
      code: number;
      family_id: string | null;
      student_id: string | null;
      debit_minor: string;
      credit_minor: string;
      kind: string;
    }>(
      `SELECT la.code, jl.family_id, jl.student_id, jl.debit_minor::text, jl.credit_minor::text, je.kind
       FROM journal_entry je
       JOIN journal_line jl ON jl.entry_id = je.id
       JOIN ledger_account la ON la.id = jl.ledger_account_id
       WHERE je.organization_id = $1 AND je.reference = $2
       ORDER BY la.code`,
      [orgA.id, reference]
    );
    expect(rows).toEqual([
      {
        code: expect.any(Number) as number,
        family_id: null,
        student_id: null,
        debit_minor: String(TOP_UP),
        credit_minor: '0',
        kind: 'wallet_topup',
      },
      {
        code: 2200,
        family_id: guardianId,
        student_id: null,
        debit_minor: '0',
        credit_minor: String(TOP_UP),
        kind: 'wallet_topup',
      },
    ]);
    expect(rows.reduce((sum, row) => sum + Number(row.debit_minor), 0)).toBe(
      rows.reduce((sum, row) => sum + Number(row.credit_minor), 0)
    );
    expect(
      await sumOf(pool, 'SELECT count(*)::text AS n FROM wallet_topup', [])
    ).toBe(1);
  });

  test('answers a repeated reference with 200 replayed true and posts once, and 409 for the same reference with another body', async ({
    api,
    app,
    pool,
    schools: { owner, studentLekki },
  }) => {
    const account = await cashAccount(app, owner);
    const walletId = await walletIdOf(pool, guardianIdOf(studentLekki.logins));
    const body = await topUpBody(api, owner, {
      accountId: account.id,
      reference: 'CSH-REPLAY-1',
    });
    const first = await api(owner)
      .post(`/finance/wallets/${walletId}/top-ups`)
      .send(body)
      .expect(201);
    const again = await api(owner)
      .post(`/finance/wallets/${walletId}/top-ups`)
      .send(body)
      .expect(200);
    expect(again.body).toMatchObject({
      id: (first.body as ToppedUpWallet).id,
      replayed: true,
    });
    expect((again.body as ToppedUpWallet).wallet.balanceMinor).toBe(TOP_UP);

    const refused = await api(owner)
      .post(`/finance/wallets/${walletId}/top-ups`)
      .send({ ...body, amountMinor: TOP_UP + 1 })
      .expect(409);
    expect(refused.body.message).toBe(WALLET_REFERENCE_TAKEN_MESSAGE);
    expect(
      await sumOf(
        pool,
        'SELECT count(*)::text AS n FROM journal_entry WHERE reference = $1',
        ['CSH-REPLAY-1']
      )
    ).toBe(1);
  });

  test('refuses a gateway account, a receipt that is not found or already used, and a reference another entry holds', async ({
    api,
    app,
    pool,
    schools: { owner, orgA, studentLekki, studentIkeja },
  }) => {
    const account = await cashAccount(app, owner);
    const walletId = await walletIdOf(pool, guardianIdOf(studentLekki.logins));
    const otherWallet = await walletIdOf(
      pool,
      guardianIdOf(studentIkeja.logins)
    );
    const post = (id: string, body: Record<string, unknown>) =>
      api(owner).post(`/finance/wallets/${id}/top-ups`).send(body);

    const gateway = await gatewayAccountId(pool, orgA.id);
    const gatewayRes = await post(
      walletId,
      await topUpBody(api, owner, { accountId: gateway })
    ).expect(400);
    expect(gatewayRes.body.message).toBe(WALLET_ACCOUNT_GATEWAY_MESSAGE);

    const missing = await post(walletId, {
      ...(await topUpBody(api, owner, { accountId: account.id })),
      proofFileId: '0b0c8a8e-8a3e-4c6c-a8c4-0e2f0f6b1f11',
    }).expect(404);
    expect(missing.body.message).toBe(WALLET_PROOF_NOT_FOUND_MESSAGE);

    const proof = await uploadWalletProof(api, owner);
    await post(
      walletId,
      await topUpBody(api, owner, {
        accountId: account.id,
        proofFileId: proof.id,
      })
    ).expect(201);
    const taken = await post(
      otherWallet,
      await topUpBody(api, owner, {
        accountId: account.id,
        proofFileId: proof.id,
      })
    ).expect(409);
    expect(taken.body.message).toBe(WALLET_PROOF_TAKEN_MESSAGE);

    const used = await post(
      otherWallet,
      await topUpBody(api, owner, {
        accountId: account.id,
        reference: (
          await topUpWallet(api, owner, { walletId, accountId: account.id })
        ).reference,
      })
    ).expect(409);
    expect(used.body.message).toBe(WALLET_REFERENCE_TAKEN_MESSAGE);
  });

  test('keeps a receipt locked once it is attached to a top-up, and readable to wallet readers', async ({
    api,
    app,
    pool,
    schools: { owner, studentLekki },
  }) => {
    const account = await cashAccount(app, owner);
    const walletId = await walletIdOf(pool, guardianIdOf(studentLekki.logins));
    const proof = await uploadWalletProof(api, owner);
    await topUpWallet(api, owner, {
      walletId,
      accountId: account.id,
      proofFileId: proof.id,
    });
    await api(owner).delete(`/files/${proof.id}`).expect(409);
    await api(owner).get(`/files/${proof.id}`).expect(200);
  });
});

test.describe('money held for a request', () => {
  test('refuses a set-aside beyond the free money, naming the limit, and shows held money on the wallet a guardian reads', async ({
    api,
    app,
    pool,
    schools,
  }) => {
    const { owner } = schools;
    const account = await cashAccount(app, owner);
    const bank = await bankAccount(app, owner);
    const { ada, guardianLogin } = await family(app, schools);
    const walletId = await walletIdOf(pool, guardianLogin?.guardianId ?? '');
    const guardian = await signInAs(api, guardianLogin);
    await owes(app, owner, { studentId: ada.id, amountMinor: OWED });
    await topUpWallet(api, owner, { walletId, accountId: account.id });
    await requestRefund(api, owner, {
      walletId,
      accountId: bank.id,
      amountMinor: 4_000_000,
    });

    const refused = await api(guardian)
      .post('/portal/wallet/earmarks')
      .send({
        reference: nextReference('WSA'),
        studentId: ada.id,
        amountMinor: 1_000_001,
      })
      .expect(422);
    expect(refused.body.message).toBe(walletEarmarkSetOverMessage(1_000_000));
    const own = (await api(guardian).get('/portal/wallet').expect(200))
      .body as Wallet;
    expect(own).toMatchObject({
      balanceMinor: TOP_UP,
      heldMinor: 4_000_000,
      freeMinor: 1_000_000,
    });
    expect(
      own.children.find((child) => child.studentId === ada.id)
    ).toMatchObject({ spendableMinor: 1_000_000 });
    await api(guardian)
      .post('/portal/wallet/earmarks')
      .send({
        reference: nextReference('WSA'),
        studentId: ada.id,
        amountMinor: 1_000_000,
      })
      .expect(201);
  });

  test('keeps the parent’s email locked once it is attached to a request, and readable only on the campuses the family is on', async ({
    api,
    app,
    pool,
    schools,
  }) => {
    const { owner, lekkiOnly, studentIkeja } = schools;
    const account = await cashAccount(app, owner);
    const bank = await bankAccount(app, owner);
    const { guardianLogin } = await family(app, schools);
    const walletId = await walletIdOf(pool, guardianLogin?.guardianId ?? '');
    const ikejaWallet = await walletIdOf(
      pool,
      guardianIdOf(studentIkeja.logins)
    );
    const email = await uploadRefundEmail(api, owner);
    const other = await uploadRefundEmail(api, owner);
    await topUpWallet(api, owner, { walletId, accountId: account.id });
    await topUpWallet(api, owner, {
      walletId: ikejaWallet,
      accountId: account.id,
    });
    await requestRefund(api, owner, {
      walletId,
      accountId: bank.id,
      amountMinor: 500_000,
      proofFileId: email.id,
    });
    await requestRefund(api, owner, {
      walletId: ikejaWallet,
      accountId: bank.id,
      amountMinor: 500_000,
      proofFileId: other.id,
    });

    await api(owner).delete(`/files/${email.id}`).expect(409);
    await api(owner).get(`/files/${email.id}`).expect(200);
    await api(lekkiOnly).get(`/files/${email.id}`).expect(200);
    await api(lekkiOnly).get(`/files/${other.id}`).expect(404);
  });
});

test.describe('the staff wallet screens', () => {
  test('list the wallets with search and totals, and show a wallet with its children', async ({
    api,
    app,
    pool,
    schools: { owner, studentLekki },
  }) => {
    const account = await cashAccount(app, owner);
    const lekki = await walletIdOf(pool, guardianIdOf(studentLekki.logins));
    await owes(app, owner, { studentId: studentLekki.id, amountMinor: OWED });
    await topUpWallet(api, owner, { walletId: lekki, accountId: account.id });

    const list = (await api(owner).get('/finance/wallets').expect(200))
      .body as WalletList;
    expect(list.currency).toBe('NGN');
    expect(list.items).toHaveLength(2);
    expect(list.total).toBe(2);
    expect(list.totals).toEqual({
      walletCount: 2,
      balanceMinor: TOP_UP,
      setAsideMinor: 0,
      heldMinor: 0,
      freeMinor: TOP_UP,
    });
    const funded = list.items.find((item) => item.id === lekki);
    expect(funded).toMatchObject({
      childCount: 1,
      balanceMinor: TOP_UP,
      freeMinor: TOP_UP,
    });
    const empty = list.items.find((item) => item.id !== lekki);
    expect(empty).toMatchObject({ balanceMinor: 0, freeMinor: 0 });

    const found = (
      await api(owner)
        .get('/finance/wallets')
        .query({ q: funded?.guardianName.slice(0, 5).toLowerCase() })
        .expect(200)
    ).body as WalletList;
    expect(found.items.map((item) => item.id)).toContain(lekki);

    const wallet = (
      await api(owner).get(`/finance/wallets/${lekki}`).expect(200)
    ).body as Wallet;
    expect(wallet.children).toEqual([
      expect.objectContaining({
        studentId: studentLekki.id,
        owedMinor: OWED,
        earmarkMinor: 0,
        spendableMinor: OWED,
        inScope: true,
      }),
    ]);
  });

  test('offer the accounts that can take a top-up and the ways of paying, to wallet:topUp only', async ({
    api,
    app,
    pool,
    withPermissions,
    schools: { owner, orgA, lekkiOnly, noPermission },
  }) => {
    const account = await cashAccount(app, owner);
    const gateway = await gatewayAccountId(pool, orgA.id);
    const reader = await withPermissions(orgA, ['wallet:read']);

    const options = (
      await api(owner).get('/finance/wallets/top-up-options').expect(200)
    ).body as TopUpOptions;
    expect(options).toMatchObject({
      currency: 'NGN',
      methods: { cash: true, transfer: true, pos: true },
    });
    expect(options.accounts.map((row) => row.id)).toContain(account.id);
    expect(options.accounts.map((row) => row.id)).not.toContain(gateway);
    await api(lekkiOnly).get('/finance/wallets/top-up-options').expect(200);
    await api(reader).get('/finance/wallets/top-up-options').expect(403);
    await api(noPermission).get('/finance/wallets/top-up-options').expect(403);
    await api().get('/finance/wallets/top-up-options').expect(401);
  });

  test('list every movement on the wallet newest first, and they add up to the journal balance', async ({
    api,
    app,
    pool,
    schools,
  }) => {
    const { owner, orgA } = schools;
    const account = await cashAccount(app, owner);
    const { ada, guardianLogin } = await family(app, schools);
    const walletId = await walletIdOf(pool, guardianLogin?.guardianId ?? '');
    await owes(app, owner, { studentId: ada.id, amountMinor: OWED });
    await topUpWallet(api, owner, {
      walletId,
      accountId: account.id,
      amountMinor: 3_000_000,
      depositorName: 'Uncle Bode',
    });
    await topUpWallet(api, owner, {
      walletId,
      accountId: account.id,
      amountMinor: 1_000_000,
    });
    const guardian = await signInAs(api, guardianLogin);
    await api(guardian)
      .post('/portal/wallet/spend')
      .send({
        reference: nextReference('WSP'),
        lines: [{ studentId: ada.id, amountMinor: 1_500_000 }],
      })
      .expect(201);

    const movements = (
      await api(owner).get(`/finance/wallets/${walletId}/movements`).expect(200)
    ).body as WalletMovementList;
    expect(movements.total).toBe(3);
    const journal = journalItems(movements);
    expect(journal.map((item) => [item.kind, item.amountMinor])).toEqual([
      ['wallet_spend', -1_500_000],
      ['wallet_topup', 1_000_000],
      ['wallet_topup', 3_000_000],
    ]);
    expect(journal[0]).toMatchObject({
      studentId: ada.id,
      source: { type: 'spend' },
    });
    expect(journal[2]?.source).toMatchObject({
      type: 'topup',
      method: 'cash',
      depositorName: 'Uncle Bode',
    });
    const total = journal.reduce((sum, item) => sum + item.amountMinor, 0);
    expect(total).toBe(
      await familyBalance(pool, orgA.id, guardianLogin?.guardianId ?? '')
    );
    expect(total).toBe(2_500_000);
    const wallet = (
      await api(owner).get(`/finance/wallets/${walletId}`).expect(200)
    ).body as Wallet;
    expect(wallet.balanceMinor).toBe(total);
  });
});

test.describe('the guardian’s wallet', () => {
  test('is the signed-in guardian’s own, never another family’s', async ({
    api,
    app,
    pool,
    schools,
  }) => {
    const { owner } = schools;
    const account = await cashAccount(app, owner);
    const { guardianLogin } = await family(app, schools);
    const own = await walletIdOf(pool, guardianLogin?.guardianId ?? '');
    await topUpWallet(api, owner, { walletId: own, accountId: account.id });
    const guardian = await signInAs(api, guardianLogin);

    const wallet = (await api(guardian).get('/portal/wallet').expect(200))
      .body as Wallet;
    expect(wallet).toMatchObject({ id: own, balanceMinor: TOP_UP });
    expect(wallet.children.map((child) => child.name)).toEqual([
      'Ada Okeke',
      'Tobi Okeke',
    ]);

    await api(guardian).get(`/finance/wallets/${own}`).expect(403);
    await api(guardian).get('/finance/wallets').expect(403);
    await postTopUp(api, guardian, {
      walletId: own,
      accountId: account.id,
      uploadedBy: owner,
      status: 403,
    });
  });

  test('spends an amount per child as one balanced entry with one receivable credit per child', async ({
    api,
    app,
    pool,
    schools,
  }) => {
    const { owner, orgA } = schools;
    const account = await cashAccount(app, owner);
    const { ada, tobi, guardianLogin } = await family(app, schools);
    const guardianId = guardianLogin?.guardianId ?? '';
    const walletId = await walletIdOf(pool, guardianId);
    await owes(app, owner, { studentId: ada.id, amountMinor: OWED });
    await owes(app, owner, { studentId: tobi.id, amountMinor: 1_000_000 });
    await topUpWallet(api, owner, { walletId, accountId: account.id });
    const guardian = await signInAs(api, guardianLogin);
    const reference = nextReference('WSP');

    const res = await api(guardian)
      .post('/portal/wallet/spend')
      .send({
        reference,
        lines: [
          { studentId: ada.id, amountMinor: 1_500_000 },
          { studentId: tobi.id, amountMinor: 600_000 },
        ],
      })
      .expect(201);
    const spent = res.body as SpentWallet;
    expect(spent).toMatchObject({
      reference,
      totalMinor: 2_100_000,
      replayed: false,
    });
    expect(spent.wallet).toMatchObject({
      balanceMinor: TOP_UP - 2_100_000,
      freeMinor: TOP_UP - 2_100_000,
    });

    const { rows } = await pool.query<{
      code: number;
      family_id: string | null;
      student_id: string | null;
      campus_id: string | null;
      debit_minor: string;
      credit_minor: string;
    }>(
      `SELECT la.code, jl.family_id, jl.student_id, jl.campus_id, jl.debit_minor::text, jl.credit_minor::text
       FROM journal_entry je
       JOIN journal_line jl ON jl.entry_id = je.id
       JOIN ledger_account la ON la.id = jl.ledger_account_id
       WHERE je.organization_id = $1 AND je.reference = $2 AND je.kind = 'wallet_spend'`,
      [orgA.id, reference]
    );
    expect(rows).toHaveLength(4);
    expect(rows.reduce((sum, row) => sum + Number(row.debit_minor), 0)).toBe(
      rows.reduce((sum, row) => sum + Number(row.credit_minor), 0)
    );
    const receivable = rows.filter((row) => row.code === 1100);
    expect(
      receivable.map((row) => [row.student_id, row.credit_minor, row.family_id])
    ).toEqual(
      expect.arrayContaining([
        [ada.id, '1500000', null],
        [tobi.id, '600000', null],
      ])
    );
    expect(receivable.every((row) => row.campus_id !== null)).toBe(true);
    const wallets = rows.filter((row) => row.code === 2200);
    expect(wallets.map((row) => row.family_id)).toEqual([
      guardianId,
      guardianId,
    ]);

    expect(await receivableBalance(pool, orgA.id, ada.id)).toBe(
      OWED - 1_500_000
    );
    expect(await receivableBalance(pool, orgA.id, tobi.id)).toBe(400_000);
    expect(await familyBalance(pool, orgA.id, guardianId)).toBe(
      TOP_UP - 2_100_000
    );
  });

  test('shows on the child’s statement as paid from the wallet, for staff and for the guardian', async ({
    api,
    app,
    pool,
    schools,
  }) => {
    const { owner } = schools;
    const account = await cashAccount(app, owner);
    const { ada, guardianLogin } = await family(app, schools);
    const walletId = await walletIdOf(pool, guardianLogin?.guardianId ?? '');
    await owes(app, owner, { studentId: ada.id, amountMinor: OWED });
    await topUpWallet(api, owner, {
      walletId,
      accountId: account.id,
    });
    const guardian = await signInAs(api, guardianLogin);
    await api(guardian)
      .post('/portal/wallet/spend')
      .send({
        reference: nextReference('WSP'),
        lines: [{ studentId: ada.id, amountMinor: 1_500_000 }],
      })
      .expect(201);

    const staff = (
      await api(owner).get(`/finance/students/${ada.id}/statement`).expect(200)
    ).body as StudentStatement;
    expect(staff.totals).toMatchObject({
      balanceMinor: 500_000,
      paidMinor: 1_500_000,
    });
    expect(staff.rows.find((row) => row.status === 'paid')).toMatchObject({
      description: 'Paid from wallet',
      amountMinor: 1_500_000,
      link: null,
    });
    const portal = (
      await api(guardian)
        .get(`/portal/students/${ada.id}/statement`)
        .expect(200)
    ).body as StudentStatement;
    expect(portal.totals.paidMinor).toBe(1_500_000);
    expect(portal.rows.find((row) => row.status === 'paid')?.description).toBe(
      'Paid from wallet'
    );
  });

  test('answers a repeated spend 200 replayed true and a changed one 409, and spends once', async ({
    api,
    app,
    pool,
    schools,
  }) => {
    const { owner, orgA } = schools;
    const account = await cashAccount(app, owner);
    const { ada, guardianLogin } = await family(app, schools);
    const walletId = await walletIdOf(pool, guardianLogin?.guardianId ?? '');
    await owes(app, owner, { studentId: ada.id, amountMinor: OWED });
    await topUpWallet(api, owner, { walletId, accountId: account.id });
    const guardian = await signInAs(api, guardianLogin);
    const body = {
      reference: 'WSP-REPLAY-1',
      lines: [{ studentId: ada.id, amountMinor: 1_000_000 }],
    };
    const first = await api(guardian)
      .post('/portal/wallet/spend')
      .send(body)
      .expect(201);
    const again = await api(guardian)
      .post('/portal/wallet/spend')
      .send(body)
      .expect(200);
    expect(again.body).toMatchObject({
      id: (first.body as SpentWallet).id,
      replayed: true,
    });
    const changed = await api(guardian)
      .post('/portal/wallet/spend')
      .send({ ...body, lines: [{ studentId: ada.id, amountMinor: 900_000 }] })
      .expect(409);
    expect(changed.body.message).toBe(WALLET_REFERENCE_TAKEN_MESSAGE);
    expect(await receivableBalance(pool, orgA.id, ada.id)).toBe(
      OWED - 1_000_000
    );
  });

  test('refuses a line over the free money or over what the child owes with 422 and the maximum, and another family’s child with 404', async ({
    api,
    app,
    pool,
    schools,
  }) => {
    const { owner, orgA, studentLekki } = schools;
    const account = await cashAccount(app, owner);
    const { ada, guardianLogin } = await family(app, schools);
    const walletId = await walletIdOf(pool, guardianLogin?.guardianId ?? '');
    await owes(app, owner, { studentId: ada.id, amountMinor: OWED });
    await topUpWallet(api, owner, {
      walletId,
      accountId: account.id,
      amountMinor: 1_200_000,
    });
    const guardian = await signInAs(api, guardianLogin);
    const spend = (studentId: string, amountMinor: number) =>
      api(guardian)
        .post('/portal/wallet/spend')
        .send({
          reference: nextReference('WSP'),
          lines: [{ studentId, amountMinor }],
        });

    const overFree = await spend(ada.id, 1_200_001).expect(422);
    expect(overFree.body.message).toBe(
      walletSpendOverMessage('Ada Okeke', 1_200_000)
    );
    await topUpWallet(api, owner, {
      walletId,
      accountId: account.id,
      amountMinor: 3_800_000,
    });
    const overOwed = await spend(ada.id, OWED + 1).expect(422);
    expect(overOwed.body.message).toBe(
      walletSpendOverMessage('Ada Okeke', OWED)
    );

    const foreign = await spend(studentLekki.id, 100).expect(404);
    expect(foreign.body.message).toBe(WALLET_STUDENT_NOT_FOUND_MESSAGE);
    expect(
      await sumOf(
        pool,
        `SELECT count(*)::text AS n FROM journal_entry WHERE organization_id = $1 AND kind = 'wallet_spend'`,
        [orgA.id]
      )
    ).toBe(0);
    expect(await receivableBalance(pool, orgA.id, ada.id)).toBe(OWED);
    expect(
      await familyBalance(pool, orgA.id, guardianLogin?.guardianId ?? '')
    ).toBe(TOP_UP);
  });

  test('never lets two spends at the same moment use more than the free money', async ({
    api,
    app,
    pool,
    schools,
  }) => {
    const { owner, orgA } = schools;
    const account = await cashAccount(app, owner);
    const { ada, tobi, guardianLogin } = await family(app, schools);
    const guardianId = guardianLogin?.guardianId ?? '';
    const walletId = await walletIdOf(pool, guardianId);
    await owes(app, owner, { studentId: ada.id, amountMinor: OWED });
    await owes(app, owner, { studentId: tobi.id, amountMinor: OWED });
    await topUpWallet(api, owner, {
      walletId,
      accountId: account.id,
      amountMinor: 2_500_000,
    });
    const guardian = await signInAs(api, guardianLogin);
    const attempts = await Promise.all(
      [ada, tobi, ada, tobi].map((student) =>
        api(guardian)
          .post('/portal/wallet/spend')
          .send({
            reference: nextReference('WSP'),
            lines: [{ studentId: student.id, amountMinor: 2_000_000 }],
          })
      )
    );
    const statuses = attempts
      .map((res) => res.status)
      .toSorted((a, b) => a - b);
    expect(statuses).toEqual([201, 422, 422, 422]);
    const balance = await familyBalance(pool, orgA.id, guardianId);
    expect(balance).toBe(500_000);
    expect(balance).toBeGreaterThanOrEqual(0);
  });

  test('sets money aside for a child, spends it first, and releases what is left', async ({
    api,
    app,
    pool,
    schools,
  }) => {
    const { owner } = schools;
    const account = await cashAccount(app, owner);
    const { ada, tobi, guardianLogin } = await family(app, schools);
    const walletId = await walletIdOf(pool, guardianLogin?.guardianId ?? '');
    await owes(app, owner, { studentId: ada.id, amountMinor: OWED });
    await owes(app, owner, { studentId: tobi.id, amountMinor: OWED });
    await topUpWallet(api, owner, {
      walletId,
      accountId: account.id,
      amountMinor: 3_000_000,
    });
    const guardian = await signInAs(api, guardianLogin);
    const mark = (
      path: string,
      body: { reference: string; studentId: string; amountMinor: number }
    ) => api(guardian).post(`/portal/wallet/earmarks${path}`).send(body);

    const set = await mark('', {
      reference: 'ERM-1',
      studentId: tobi.id,
      amountMinor: 2_000_000,
    }).expect(201);
    expect((set.body as EarmarkedWallet).wallet).toMatchObject({
      balanceMinor: 3_000_000,
      setAsideMinor: 2_000_000,
      freeMinor: 1_000_000,
    });
    const replay = await mark('', {
      reference: 'ERM-1',
      studentId: tobi.id,
      amountMinor: 2_000_000,
    }).expect(200);
    expect((replay.body as EarmarkedWallet).replayed).toBe(true);
    await mark('', {
      reference: 'ERM-1',
      studentId: tobi.id,
      amountMinor: 1,
    }).expect(409);

    const tooMuch = await mark('', {
      reference: 'ERM-2',
      studentId: ada.id,
      amountMinor: 1_000_001,
    }).expect(422);
    expect(tooMuch.body.message).toBe(walletEarmarkSetOverMessage(1_000_000));

    const spent = await api(guardian)
      .post('/portal/wallet/spend')
      .send({
        reference: nextReference('WSP'),
        lines: [{ studentId: tobi.id, amountMinor: 1_500_000 }],
      })
      .expect(201);
    expect((spent.body as SpentWallet).wallet).toMatchObject({
      balanceMinor: 1_500_000,
      setAsideMinor: 500_000,
      freeMinor: 1_000_000,
    });

    const over = await mark('/release', {
      reference: 'ERM-3',
      studentId: tobi.id,
      amountMinor: 500_001,
    }).expect(422);
    expect(over.body.message).toBe(walletEarmarkReleaseOverMessage(500_000));
    const released = await mark('/release', {
      reference: 'ERM-4',
      studentId: tobi.id,
      amountMinor: 500_000,
    }).expect(201);
    expect((released.body as EarmarkedWallet).wallet).toMatchObject({
      setAsideMinor: 0,
      freeMinor: 1_500_000,
    });
  });

  test('lists a set-aside and a release in the movements between the money movements, for staff and the guardian, without counting toward the balance', async ({
    api,
    app,
    pool,
    schools,
  }) => {
    const { owner, ownerB, orgA } = schools;
    const account = await cashAccount(app, owner);
    const { ada, tobi, guardianLogin } = await family(app, schools);
    const walletId = await walletIdOf(pool, guardianLogin?.guardianId ?? '');
    await owes(app, owner, { studentId: ada.id, amountMinor: OWED });
    await owes(app, owner, { studentId: tobi.id, amountMinor: OWED });
    await topUpWallet(api, owner, {
      walletId,
      accountId: account.id,
      amountMinor: 3_000_000,
    });
    const guardian = await signInAs(api, guardianLogin);
    await api(guardian)
      .post('/portal/wallet/earmarks')
      .send({ reference: 'ERM-H1', studentId: tobi.id, amountMinor: 2_000_000 })
      .expect(201);
    await api(guardian)
      .post('/portal/wallet/spend')
      .send({
        reference: nextReference('WSP'),
        lines: [{ studentId: tobi.id, amountMinor: 1_500_000 }],
      })
      .expect(201);
    await api(guardian)
      .post('/portal/wallet/earmarks/release')
      .send({ reference: 'ERM-H2', studentId: tobi.id, amountMinor: 500_000 })
      .expect(201);

    const staff = async (query: string) =>
      (
        await api(owner)
          .get(`/finance/wallets/${walletId}/movements${query}`)
          .expect(200)
      ).body as WalletMovementList;
    const all = await staff('');
    expect(all.total).toBe(4);
    expect(
      all.items.map((item) => [
        item.type,
        item.type === 'earmark' ? item.kind : item.source?.type,
        item.amountMinor,
      ])
    ).toEqual([
      ['earmark', 'release', -500_000],
      ['journal', 'spend', -1_500_000],
      ['earmark', 'set', 2_000_000],
      ['journal', 'topup', 3_000_000],
    ]);
    expect(all.items[0]).toMatchObject({
      studentId: tobi.id,
      reference: 'ERM-H2',
      madeBy: expect.any(String),
    });
    expect(
      journalItems(all).reduce((sum, item) => sum + item.amountMinor, 0)
    ).toBe(await familyBalance(pool, orgA.id, guardianLogin?.guardianId ?? ''));

    const second = await staff('?pageSize=2&page=2');
    expect(second.total).toBe(4);
    expect(second.items.map((item) => item.type)).toEqual([
      'earmark',
      'journal',
    ]);

    const portal = (
      await api(guardian).get('/portal/wallet/movements').expect(200)
    ).body as PortalWalletMovementList;
    expect(portal.total).toBe(4);
    expect(portal.items.map((item) => item.type)).toEqual([
      'earmark',
      'journal',
      'earmark',
      'journal',
    ]);
    expect(JSON.stringify(portal)).not.toContain('madeBy');

    await api(ownerB).get(`/finance/wallets/${walletId}/movements`).expect(404);
  });

  test('answers 404 to a staff member who is no guardian and 403 to someone without the wallet permissions', async ({
    api,
    schools: { owner, noPermission },
  }) => {
    const missing = await api(owner).get('/portal/wallet').expect(404);
    expect(missing.body.message).toBe(WALLET_NOT_FOUND_MESSAGE);
    await api(noPermission).get('/portal/wallet').expect(403);
    await api(noPermission)
      .post('/portal/wallet/spend')
      .send({
        reference: nextReference('WSP'),
        lines: [
          { studentId: '0b0c8a8e-8a3e-4c6c-a8c4-0e2f0f6b1f11', amountMinor: 1 },
        ],
      })
      .expect(403);
  });
});

test.describe('isolation', () => {
  test('1: another school answers 404 on a wallet, its movements and a top-up, and lists none of A’s', async ({
    api,
    app,
    pool,
    schools: { owner, ownerB, studentLekki },
  }) => {
    const account = await cashAccount(app, owner);
    const walletId = await walletIdOf(pool, guardianIdOf(studentLekki.logins));
    await topUpWallet(api, owner, { walletId, accountId: account.id });

    await api(ownerB).get(`/finance/wallets/${walletId}`).expect(404);
    await api(ownerB).get(`/finance/wallets/${walletId}/movements`).expect(404);
    await postTopUp(api, ownerB, {
      walletId,
      accountId: account.id,
      status: 404,
    });
    const list = (await api(ownerB).get('/finance/wallets').expect(200))
      .body as WalletList;
    expect(list.items.map((item) => item.id)).not.toContain(walletId);
    expect(list.items).toHaveLength(1);
    expect(list.totals.balanceMinor).toBe(0);
  });

  test('2 and 4: A’s list as the owner holds both campuses’ families and a campus member sees only their campus’s', async ({
    api,
    pool,
    schools: { owner, lekkiOnly, studentLekki, studentIkeja },
  }) => {
    const lekki = await walletIdOf(pool, guardianIdOf(studentLekki.logins));
    const ikeja = await walletIdOf(pool, guardianIdOf(studentIkeja.logins));
    const all = (await api(owner).get('/finance/wallets').expect(200))
      .body as WalletList;
    expect(
      all.items.map((item) => item.id).toSorted((a, b) => a.localeCompare(b))
    ).toEqual([lekki, ikeja].toSorted((a, b) => a.localeCompare(b)));
    const scoped = (await api(lekkiOnly).get('/finance/wallets').expect(200))
      .body as WalletList;
    expect(scoped.items.map((item) => item.id)).toEqual([lekki]);
    expect(scoped.totals.walletCount).toBe(1);
  });

  test('3: a campus member answers 404 for a family whose children are all on another campus, for every route', async ({
    api,
    app,
    pool,
    schools: { owner, lekkiOnly, studentIkeja },
  }) => {
    const account = await cashAccount(app, owner);
    const ikeja = await walletIdOf(pool, guardianIdOf(studentIkeja.logins));
    await api(lekkiOnly).get(`/finance/wallets/${ikeja}`).expect(404);
    await api(lekkiOnly).get(`/finance/wallets/${ikeja}/movements`).expect(404);
    await postTopUp(api, lekkiOnly, {
      walletId: ikeja,
      accountId: account.id,
      status: 404,
    });
  });

  test('3: a campus member sees a family with a child on their campus whole, and can top it up', async ({
    api,
    app,
    pool,
    schools,
  }) => {
    const { owner, lekkiOnly } = schools;
    const account = await cashAccount(app, owner, schools.lekki.id);
    const { guardianLogin } = await family(app, schools);
    const walletId = await walletIdOf(pool, guardianLogin?.guardianId ?? '');
    const wallet = (
      await api(lekkiOnly).get(`/finance/wallets/${walletId}`).expect(200)
    ).body as Wallet;
    expect(wallet.children.map((child) => [child.name, child.inScope])).toEqual(
      [
        ['Ada Okeke', true],
        ['Tobi Okeke', false],
      ]
    );
    await topUpWallet(api, lekkiOnly, { walletId, accountId: account.id });
  });

  test('5: someone without the wallet permissions answers 403, and read-only cannot top up', async ({
    api,
    app,
    pool,
    withPermissions,
    schools: { owner, orgA, noPermission, studentLekki },
  }) => {
    const account = await cashAccount(app, owner);
    const walletId = await walletIdOf(pool, guardianIdOf(studentLekki.logins));
    const reader = await withPermissions(orgA, [
      'wallet:read',
      'campus:readAll',
    ]);
    await api(noPermission).get('/finance/wallets').expect(403);
    await api(noPermission).get(`/finance/wallets/${walletId}`).expect(403);
    await api(noPermission)
      .get(`/finance/wallets/${walletId}/movements`)
      .expect(403);
    await postTopUp(api, noPermission, {
      walletId,
      accountId: account.id,
      uploadedBy: owner,
      status: 403,
    });
    await api(reader).get(`/finance/wallets/${walletId}`).expect(200);
    await postTopUp(api, reader, {
      walletId,
      accountId: account.id,
      uploadedBy: owner,
      status: 403,
    });
  });

  test('6: no session answers 401 on every wallet route', async ({
    api,
    schools: { studentLekki },
  }) => {
    const id = guardianIdOf(studentLekki.logins);
    await api().get('/finance/wallets').expect(401);
    await api().get(`/finance/wallets/${id}`).expect(401);
    await api().get(`/finance/wallets/${id}/movements`).expect(401);
    await api().post(`/finance/wallets/${id}/top-ups`).send({}).expect(401);
    await api().get('/portal/wallet').expect(401);
    await api().post('/portal/wallet/spend').send({}).expect(401);
    await api().post('/portal/wallet/earmarks').send({}).expect(401);
    await api().post('/portal/wallet/earmarks/release').send({}).expect(401);
  });

  test('7: a top-up in A naming school B’s money account or receipt answers 404 and posts nothing', async ({
    api,
    app,
    pool,
    schools: { owner, ownerB, studentLekki },
  }) => {
    const walletId = await walletIdOf(pool, guardianIdOf(studentLekki.logins));
    const account = await cashAccount(app, owner);
    const foreignAccount = await cashAccount(app, ownerB);
    const foreignProof = await uploadWalletProof(api, ownerB);

    const byAccount = await postTopUp(api, owner, {
      walletId,
      accountId: foreignAccount.id,
      status: 404,
    });
    expect(byAccount.body.message).toBe(WALLET_ACCOUNT_NOT_FOUND_MESSAGE);
    const byProof = await postTopUp(api, owner, {
      walletId,
      accountId: account.id,
      proofFileId: foreignProof.id,
      status: 404,
    });
    expect(byProof.body.message).toBe(WALLET_PROOF_NOT_FOUND_MESSAGE);
    expect(
      await sumOf(pool, 'SELECT count(*)::text AS n FROM wallet_topup', [])
    ).toBe(0);
  });

  test('7: the database refuses a wallet, top-up, spend, earmark or ledger line that names another school’s guardian, student, account, receipt or entry', async ({
    api,
    app,
    pool,
    schools: { owner, ownerB, orgA, orgB, studentLekki, studentB },
  }) => {
    const walletId = await walletIdOf(pool, guardianIdOf(studentLekki.logins));
    const guardianId = guardianIdOf(studentLekki.logins);
    const foreignGuardian = guardianIdOf(studentB.logins);
    const account = await cashAccount(app, owner);
    const foreignAccount = await cashAccount(app, ownerB);
    const proof = await uploadWalletProof(api, owner);
    const foreignProof = await uploadWalletProof(api, ownerB);
    const ledgerAccount = await ledgerAccountId(pool, orgA.id, 2200);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const entryIn = async (organizationId: string, reference: string) => {
        const { rows } = await client.query<{ id: string }>(
          `INSERT INTO journal_entry (organization_id, reference, kind, effective_on)
           VALUES ($1, $2, 'wallet_topup', '2026-10-07') RETURNING id`,
          [organizationId, reference]
        );
        return rows[0]?.id ?? '';
      };
      const topUpEntry = await entryIn(orgA.id, 'RAW-TOPUP');
      const spendEntry = await entryIn(orgA.id, 'RAW-SPEND');
      const foreignEntry = await entryIn(orgB.id, 'RAW-FOREIGN');
      const insertWallet = (forGuardian: string) =>
        client.query(
          'INSERT INTO wallet (organization_id, guardian_id) VALUES ($1, $2)',
          [orgA.id, forGuardian]
        );
      const insertTopUp = (using: {
        accountId: string;
        proofId: string;
        entryId: string;
      }) =>
        client.query(
          `INSERT INTO wallet_topup (organization_id, wallet_id, reference, money_account_id, method, amount_minor, received_on, proof_file_id, request_hash, journal_entry_id, created_by)
           VALUES ($1, $2, 'RAW-TOPUP', $3, 'cash', 100, '2026-10-07', $4, 'raw', $5, $6)`,
          [
            orgA.id,
            walletId,
            using.accountId,
            using.proofId,
            using.entryId,
            owner.id,
          ]
        );
      const insertSpend = (entryId: string) =>
        client.query(
          `INSERT INTO wallet_spend (organization_id, wallet_id, reference, request_hash, journal_entry_id, created_by)
           VALUES ($1, $2, 'RAW-SPEND', 'raw', $3, $4)`,
          [orgA.id, walletId, entryId, owner.id]
        );
      const insertEarmark = (studentId: string) =>
        client.query(
          `INSERT INTO wallet_earmark (organization_id, wallet_id, student_id, kind, delta_minor, reference, created_by)
           VALUES ($1, $2, $3, 'set', 100, 'RAW-ERM', $4)`,
          [orgA.id, walletId, studentId, owner.id]
        );
      const insertLine = (familyId: string) =>
        client.query(
          `INSERT INTO journal_line (organization_id, entry_id, ledger_account_id, family_id, credit_minor)
           VALUES ($1, $2, $3, $4, 100)`,
          [orgA.id, spendEntry, ledgerAccount, familyId]
        );
      const refuses = async (
        attempt: () => Promise<unknown>,
        constraint: string
      ) => {
        await client.query('SAVEPOINT attempt');
        await expect(attempt()).rejects.toMatchObject({
          code: '23503',
          constraint,
        });
        await client.query('ROLLBACK TO SAVEPOINT attempt');
      };
      const own = {
        accountId: account.id,
        proofId: proof.id,
        entryId: topUpEntry,
      };

      await refuses(
        () => insertWallet(foreignGuardian),
        'wallet_guardian_id_organization_id_fkey'
      );
      await refuses(
        () => insertEarmark(studentB.id),
        'wallet_earmark_student_id_organization_id_fkey'
      );
      await refuses(
        () => insertTopUp({ ...own, accountId: foreignAccount.id }),
        'wallet_topup_money_account_id_organization_id_fkey'
      );
      await refuses(
        () => insertTopUp({ ...own, proofId: foreignProof.id }),
        'wallet_topup_proof_file_id_organization_id_fkey'
      );
      await refuses(
        () => insertTopUp({ ...own, entryId: foreignEntry }),
        'wallet_topup_journal_entry_id_organization_id_fkey'
      );
      await refuses(
        () => insertSpend(foreignEntry),
        'wallet_spend_journal_entry_id_organization_id_fkey'
      );
      await refuses(
        () => insertLine(foreignGuardian),
        'journal_line_family_fkey'
      );

      await insertTopUp(own);
      await insertSpend(spendEntry);
      await insertEarmark(studentLekki.id);
      await insertLine(guardianId);
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  });

  test('refuses to roll the wallet migration back once a top-up has been posted', async ({
    api,
    app,
    pool,
    schools: { owner, studentLekki },
  }) => {
    const account = await cashAccount(app, owner);
    const walletId = await walletIdOf(pool, guardianIdOf(studentLekki.logins));
    await topUpWallet(api, owner, { walletId, accountId: account.id });
    const migration = readFileSync(
      new URL(
        '../db/migrations/20261023090000_wallet_ledger_core.sql',
        import.meta.url
      ),
      'utf8'
    );
    const [, down = ''] = migration.split('-- migrate:down');

    await expect(pool.query(down)).rejects.toMatchObject({
      code: '23514',
      message:
        'wallet money has been posted, so this migration cannot be rolled back',
    });
    expect(
      await sumOf(pool, 'SELECT count(*)::text AS n FROM wallet_topup', [])
    ).toBe(1);
  });

  test('keeps the wallet tables append-only', async ({
    api,
    app,
    pool,
    schools: { owner, studentLekki },
  }) => {
    const account = await cashAccount(app, owner);
    const walletId = await walletIdOf(pool, guardianIdOf(studentLekki.logins));
    await topUpWallet(api, owner, { walletId, accountId: account.id });
    for (const statement of [
      `UPDATE wallet_topup SET amount_minor = 1`,
      `DELETE FROM wallet_topup`,
      `UPDATE wallet SET guardian_id = guardian_id`,
      `DELETE FROM wallet`,
    ]) {
      await expect(pool.query(statement)).rejects.toMatchObject({
        code: '23514',
        constraint: 'wallet_append_only',
      });
    }
  });

  test('9: a guardian asking to spend or set aside money for another family’s child answers 404 on every portal write', async ({
    api,
    app,
    pool,
    schools,
  }) => {
    const { owner, orgA, studentLekki } = schools;
    const account = await cashAccount(app, owner);
    const { ada, guardianLogin } = await family(app, schools);
    const walletId = await walletIdOf(pool, guardianLogin?.guardianId ?? '');
    await owes(app, owner, { studentId: ada.id, amountMinor: OWED });
    await topUpWallet(api, owner, { walletId, accountId: account.id });
    const guardian = await signInAs(api, guardianLogin);
    const body = { studentId: studentLekki.id, amountMinor: 100 };
    const before = await walletWrites(pool);

    for (const [path, send] of [
      [
        '/portal/wallet/spend',
        { reference: nextReference('WSP'), lines: [body] },
      ],
      ['/portal/wallet/earmarks', { reference: nextReference('ERM'), ...body }],
      [
        '/portal/wallet/earmarks/release',
        { reference: nextReference('ERM'), ...body },
      ],
    ] as const) {
      const refused = await api(guardian).post(path).send(send).expect(404);
      expect(refused.body.message).toBe(WALLET_STUDENT_NOT_FOUND_MESSAGE);
    }
    expect(await walletWrites(pool)).toBe(before);
    expect(await receivableBalance(pool, orgA.id, ada.id)).toBe(OWED);
  });

  test('12: an acting super admin without a reason gets 403 on a top-up, and with a reason can write', async ({
    api,
    app,
    createUser,
    makeSuperAdmin,
    pool,
    schools: { owner, orgA, studentLekki },
  }) => {
    const account = await cashAccount(app, owner);
    const walletId = await walletIdOf(pool, guardianIdOf(studentLekki.logins));
    const admin = await makeSuperAdmin(await createUser());
    const reason = 'SUP-2207 record the cash the school counted';
    const body = await topUpBody(api, owner, { accountId: account.id });

    const refused = await api(admin)
      .post(`/finance/wallets/${walletId}/top-ups`)
      .set(acting(orgA.id))
      .send(body)
      .expect(403);
    expect(refused.body.code).toBe('ActingReadOnly');
    expect(
      await sumOf(pool, 'SELECT count(*)::text AS n FROM wallet_topup', [])
    ).toBe(0);
    await api(admin)
      .get(`/finance/wallets/${walletId}`)
      .set(acting(orgA.id))
      .expect(200);

    const proof = await api(admin)
      .post('/files')
      .set(acting(orgA.id, reason))
      .field('kind', 'wallet_proof')
      .attach('file', PDF_BYTES, { filename: 'receipt.pdf' })
      .expect(201);
    await api(admin)
      .post(`/finance/wallets/${walletId}/top-ups`)
      .set(acting(orgA.id, reason))
      .send({ ...body, proofFileId: (proof.body as FileRef).id })
      .expect(201);
  });
});

test.describe('refused amounts', () => {
  test('a top-up amount, spend line or earmark of zero or less is refused before anything is posted', async ({
    api,
    app,
    pool,
    schools,
  }) => {
    const { owner } = schools;
    const account = await cashAccount(app, owner);
    const { ada, guardianLogin } = await family(app, schools);
    const walletId = await walletIdOf(pool, guardianLogin?.guardianId ?? '');
    await owes(app, owner, { studentId: ada.id, amountMinor: OWED });
    await topUpWallet(api, owner, { walletId, accountId: account.id });
    const guardian = await signInAs(api, guardianLogin);
    const before = await walletWrites(pool);

    for (const amountMinor of [0, -1]) {
      await postTopUp(api, owner, {
        walletId,
        accountId: account.id,
        amountMinor,
        status: 400,
      });
      await api(guardian)
        .post('/portal/wallet/spend')
        .send({
          reference: nextReference('WSP'),
          lines: [{ studentId: ada.id, amountMinor }],
        })
        .expect(400);
      for (const path of ['', '/release']) {
        await api(guardian)
          .post(`/portal/wallet/earmarks${path}`)
          .send({
            reference: nextReference('ERM'),
            studentId: ada.id,
            amountMinor,
          })
          .expect(400);
      }
    }
    expect(await walletWrites(pool)).toBe(before);
  });
});
