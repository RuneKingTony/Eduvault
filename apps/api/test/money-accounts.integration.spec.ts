import {
  MONEY_ACCOUNT_BANK_NAME_MESSAGE,
  MONEY_ACCOUNT_RETIRE_MESSAGE,
  MONEY_ACCOUNT_SCHOOL_WIDE_MESSAGE,
  MONEY_ACCOUNT_NOT_FOUND_MESSAGE,
  type CashBook,
  type DashboardMoney,
  type MoneyAccount,
  type MoneyAccountList,
} from '@eduvault/api-contract';
import type { Permission } from '@eduvault/policy';
import { CAMPUS_NOT_FOUND_MESSAGE } from '../src/app/modules/campus/campus.service';
import { MoneyAccountService } from '../src/app/modules/money-account/money-account.service';
import { acting, expect } from './support/base-test';
import {
  createMoneyAccount,
  importOpening,
  ledgerAccountId,
  postEntry,
} from './support/factories/finance';
import { orgContextFor } from './support/factories/org-context';
import { bareSchoolsTest, schoolsTest as test } from './support/two-schools';

const byName = (a: string, b: string) => a.localeCompare(b);

const WRITER: Permission[] = [
  'moneyAccount:create',
  'moneyAccount:read',
  'moneyAccount:update',
];

const bank = {
  name: 'GTBank current',
  kind: 'bank',
  bankName: 'GTBank',
  last4: '4417',
  campusId: null,
} as const;

test.describe('adding an account', () => {
  test('answers 400 for a blank name, an unknown kind and last 4 that is not four digits', async ({
    api,
    schools,
  }) => {
    const { owner, lekki } = schools;
    const post = (body: Record<string, unknown>) =>
      api(owner)
        .post('/finance/money-accounts')
        .send({
          kind: 'cash',
          campusId: lekki.id,
          name: 'Front desk',
          ...body,
        });
    await post({ name: '   ' }).expect(400);
    await post({ kind: 'wallet' }).expect(400);
    await post({ kind: 'gateway' }).expect(400);
    await post({ last4: '12a' }).expect(400);
    await post({ last4: '123' }).expect(400);
    await post({ last4: '12345' }).expect(400);
    await post({ campusId: undefined }).expect(400);
    await post({}).expect(201);
  });

  test('answers 403 for a school-wide account without access to every campus, and 404 for a campus out of scope', async ({
    api,
    schools,
    withPermissions,
  }) => {
    const { orgA, ikeja, lekki } = schools;
    const writer = await withPermissions(orgA, WRITER, { campuses: [lekki] });
    const refused = await api(writer)
      .post('/finance/money-accounts')
      .send(bank)
      .expect(403);
    expect(refused.body.message).toBe(MONEY_ACCOUNT_SCHOOL_WIDE_MESSAGE);
    const missing = await api(writer)
      .post('/finance/money-accounts')
      .send({ ...bank, campusId: ikeja.id })
      .expect(404);
    expect(missing.body.message).toBe(CAMPUS_NOT_FOUND_MESSAGE);
    await api(writer)
      .post('/finance/money-accounts')
      .send({ ...bank, campusId: lekki.id })
      .expect(201);
  });

  test('gives ledger codes 1240, 1250 and 1260 under 1200, after Monnify collections at 1230, and answers 409 for a duplicate name', async ({
    api,
    pool,
    schools,
  }) => {
    const { orgA, owner, lekki, ikeja } = schools;
    const first = await api(owner)
      .post('/finance/money-accounts')
      .send(bank)
      .expect(201);
    const second = await api(owner)
      .post('/finance/money-accounts')
      .send({ name: 'Moniepoint POS', kind: 'pos', campusId: lekki.id })
      .expect(201);
    const third = await api(owner)
      .post('/finance/money-accounts')
      .send({ name: 'Front desk cash', kind: 'cash', campusId: ikeja.id })
      .expect(201);
    expect(
      [first, second, third].map((res) => (res.body as MoneyAccount).ledgerCode)
    ).toEqual([1240, 1250, 1260]);
    expect(first.body).toMatchObject({
      name: 'GTBank current',
      kind: 'bank',
      bankName: 'GTBank',
      last4: '4417',
      campusId: null,
      campusName: null,
      balanceMinor: 0,
      retiredAt: null,
    });
    expect(second.body).toMatchObject({ campusName: 'Lekki', bankName: null });

    const parent = await ledgerAccountId(pool, orgA.id, 1200);
    const { rows } = await pool.query<{ code: number; parent_id: string }>(
      `SELECT code, parent_id FROM ledger_account
       WHERE organization_id = $1 AND code BETWEEN 1201 AND 1299 ORDER BY code`,
      [orgA.id]
    );
    expect(rows).toEqual([
      { code: 1230, parent_id: parent },
      { code: 1240, parent_id: parent },
      { code: 1250, parent_id: parent },
      { code: 1260, parent_id: parent },
    ]);

    const duplicate = await api(owner)
      .post('/finance/money-accounts')
      .send({ ...bank, name: 'gtbank CURRENT' })
      .expect(409);
    expect(duplicate.body.message).toBe(
      'An account called gtbank CURRENT already exists.'
    );
  });

  test('keeps a bank name for a bank account only', async ({
    api,
    schools,
  }) => {
    const { owner, lekki } = schools;
    const res = await api(owner)
      .post('/finance/money-accounts')
      .send({
        name: 'Front desk',
        kind: 'cash',
        bankName: 'GTBank',
        campusId: lekki.id,
      })
      .expect(201);
    expect(res.body.bankName).toBeNull();
  });
});

test.describe('the list and the cash book', () => {
  test('shows tiles whose balances come from the journal lines', async ({
    api,
    app,
    schools,
  }) => {
    const { owner, lekki } = schools;
    const gtbank = await createMoneyAccount(app, owner, bank);
    const pos = await createMoneyAccount(app, owner, {
      name: 'Moniepoint POS',
      kind: 'pos',
      campusId: lekki.id,
    });
    await importOpening(app, owner, {
      moneyAccounts: [
        {
          moneyAccountId: gtbank.id,
          amountMinor: 9_500_000,
          effectiveOn: '2026-09-01',
        },
        {
          moneyAccountId: pos.id,
          amountMinor: 1_200_000,
          effectiveOn: '2026-09-01',
        },
      ],
    });

    const list = (await api(owner).get('/finance/money-accounts').expect(200))
      .body as MoneyAccountList;
    expect(list.currency).toBe('NGN');
    expect(list.hiddenSchoolWideCount).toBe(0);
    expect(
      list.items.map((item) => [item.name, item.ledgerCode, item.balanceMinor])
    ).toEqual([
      ['Monnify collections', 1230, 0],
      ['GTBank current', 1240, 9_500_000],
      ['Moniepoint POS', 1250, 1_200_000],
    ]);
  });

  test('lists the cash book newest first with a running balance over effective date then sequence', async ({
    api,
    app,
    pool,
    schools,
  }) => {
    const { orgA, owner, lekki, studentLekki } = schools;
    const account = await createMoneyAccount(app, owner, {
      name: 'Lekki cash',
      kind: 'cash',
      campusId: lekki.id,
    });
    const receivable = await ledgerAccountId(pool, orgA.id, 1100);
    const entry = ({
      reference,
      kind,
      effectiveOn,
      direction,
      amount,
    }: {
      reference: string;
      kind: 'payment' | 'adjustment';
      effectiveOn: string;
      direction: 'in' | 'out';
      amount: number;
    }) =>
      postEntry(app, {
        organizationId: orgA.id,
        reference,
        kind,
        effectiveOn,
        memo: reference,
        postedBy: null,
        lines: [
          {
            ledgerAccountId: account.ledgerAccountId,
            campusId: lekki.id,
            debitMinor: direction === 'in' ? amount : 0,
            creditMinor: direction === 'out' ? amount : 0,
          },
          {
            ledgerAccountId: receivable,
            studentId: studentLekki.id,
            campusId: lekki.id,
            debitMinor: direction === 'out' ? amount : 0,
            creditMinor: direction === 'in' ? amount : 0,
          },
        ],
      });
    await entry({
      reference: 'RCT-1',
      kind: 'payment',
      effectiveOn: '2026-09-01',
      direction: 'in',
      amount: 9_500_000,
    });
    await entry({
      reference: 'RCT-2',
      kind: 'payment',
      effectiveOn: '2026-09-15',
      direction: 'in',
      amount: 1_000_000,
    });
    await entry({
      reference: 'ADJ-1',
      kind: 'adjustment',
      effectiveOn: '2026-09-20',
      direction: 'out',
      amount: 300_000,
    });
    await entry({
      reference: 'RCT-LATE',
      kind: 'payment',
      effectiveOn: '2026-09-10',
      direction: 'in',
      amount: 200_000,
    });

    const book = (
      await api(owner)
        .get(`/finance/money-accounts/${account.id}/cash-book`)
        .expect(200)
    ).body as CashBook;
    expect(book.currency).toBe('NGN');
    expect(book.total).toBe(4);
    expect(book.account.balanceMinor).toBe(10_400_000);
    expect(
      book.items.map((item) => [
        item.reference,
        item.effectiveOn,
        item.inMinor,
        item.outMinor,
        item.runningBalanceMinor,
        item.link,
      ])
    ).toEqual([
      ['ADJ-1', '2026-09-20', 0, 300_000, 10_400_000, null],
      ['RCT-2', '2026-09-15', 1_000_000, 0, 10_700_000, null],
      ['RCT-LATE', '2026-09-10', 200_000, 0, 9_700_000, null],
      ['RCT-1', '2026-09-01', 9_500_000, 0, 9_500_000, null],
    ]);

    const paged = (
      await api(owner)
        .get(
          `/finance/money-accounts/${account.id}/cash-book?page=2&pageSize=3`
        )
        .expect(200)
    ).body as CashBook;
    expect(paged.total).toBe(4);
    expect(paged.items.map((item) => item.reference)).toEqual(['RCT-1']);
    await api(owner)
      .get(`/finance/money-accounts/${account.id}/cash-book?pageSize=51`)
      .expect(400);
  });

  test('shows a campus-scoped member only their campus and counts the school-wide accounts hidden', async ({
    api,
    app,
    schools,
  }) => {
    const { owner, lekkiOnly, lekki, ikeja } = schools;
    const schoolWide = await createMoneyAccount(app, owner, bank);
    const lekkiPos = await createMoneyAccount(app, owner, {
      name: 'Lekki POS',
      kind: 'pos',
      campusId: lekki.id,
    });
    const ikejaCash = await createMoneyAccount(app, owner, {
      name: 'Ikeja cash',
      kind: 'cash',
      campusId: ikeja.id,
    });
    await createMoneyAccount(app, owner, {
      ...bank,
      name: 'Zenith savings',
      last4: '9001',
    });

    const list = (
      await api(lekkiOnly).get('/finance/money-accounts').expect(200)
    ).body as MoneyAccountList;
    expect(list.items.map((item) => item.id)).toEqual([lekkiPos.id]);
    expect(list.hiddenSchoolWideCount).toBe(3);

    await api(lekkiOnly)
      .get(`/finance/money-accounts/${lekkiPos.id}/cash-book`)
      .expect(200);
    for (const hidden of [schoolWide, ikejaCash]) {
      const res = await api(lekkiOnly)
        .get(`/finance/money-accounts/${hidden.id}/cash-book`)
        .expect(404);
      expect(res.body.message).toBe(MONEY_ACCOUNT_NOT_FOUND_MESSAGE);
    }
  });
});

test.describe('editing and retiring', () => {
  test('renames the account and its ledger account, and edits the bank name and last 4', async ({
    api,
    app,
    pool,
    schools,
  }) => {
    const { owner } = schools;
    const account = await createMoneyAccount(app, owner, bank);
    const edited = await api(owner)
      .patch(`/finance/money-accounts/${account.id}`)
      .send({ name: 'GTBank main', bankName: 'Guaranty Trust', last4: '0099' })
      .expect(200);
    expect(edited.body).toMatchObject({
      name: 'GTBank main',
      bankName: 'Guaranty Trust',
      last4: '0099',
      ledgerCode: 1240,
    });
    const { rows } = await pool.query<{ name: string }>(
      'SELECT name FROM ledger_account WHERE id = $1',
      [account.ledgerAccountId]
    );
    expect(rows[0]?.name).toBe('GTBank main');

    const cleared = await api(owner)
      .patch(`/finance/money-accounts/${account.id}`)
      .send({ last4: null })
      .expect(200);
    expect(cleared.body.last4).toBeNull();
  });

  test('answers 409 when a rename takes another account’s name', async ({
    api,
    app,
    schools,
  }) => {
    const { owner } = schools;
    await createMoneyAccount(app, owner, bank);
    const other = await createMoneyAccount(app, owner, {
      name: 'Zenith savings',
      kind: 'bank',
    });
    await api(owner)
      .patch(`/finance/money-accounts/${other.id}`)
      .send({ name: 'GTBANK current' })
      .expect(409);
  });

  test('retires one way, keeps the cash book and sorts retired accounts last', async ({
    api,
    app,
    schools,
  }) => {
    const { owner } = schools;
    const old = await createMoneyAccount(app, owner, bank);
    const current = await createMoneyAccount(app, owner, {
      name: 'Zenith savings',
      kind: 'bank',
    });
    await importOpening(app, owner, {
      moneyAccounts: [
        {
          moneyAccountId: old.id,
          amountMinor: 800_000,
          effectiveOn: '2026-09-01',
        },
      ],
    });

    const retired = await api(owner)
      .patch(`/finance/money-accounts/${old.id}`)
      .send({ retired: true })
      .expect(200);
    expect(retired.body.retiredAt).not.toBeNull();
    expect(retired.body.balanceMinor).toBe(800_000);

    const list = (await api(owner).get('/finance/money-accounts').expect(200))
      .body as MoneyAccountList;
    expect(
      list.items
        .filter((item) => item.kind !== 'gateway')
        .map((item) => item.id)
    ).toEqual([current.id, old.id]);
    const book = (
      await api(owner)
        .get(`/finance/money-accounts/${old.id}/cash-book`)
        .expect(200)
    ).body as CashBook;
    expect(book.items).toHaveLength(1);

    const back = await api(owner)
      .patch(`/finance/money-accounts/${old.id}`)
      .send({ retired: false })
      .expect(400);
    expect(back.body.message).toBe(MONEY_ACCOUNT_RETIRE_MESSAGE);
    await api(owner)
      .patch(`/finance/money-accounts/${old.id}`)
      .send({ retired: true })
      .expect(200);
  });

  test('answers 409 when the Monnify collections account is retired, and keeps it open', async ({
    api,
    schools,
  }) => {
    const { owner } = schools;
    const list = (await api(owner).get('/finance/money-accounts').expect(200))
      .body as MoneyAccountList;
    const gateway = list.items.find((item) => item.kind === 'gateway');
    expect(gateway).toMatchObject({
      name: 'Monnify collections',
      ledgerCode: 1230,
      campusId: null,
      retiredAt: null,
    });
    const refused = await api(owner)
      .patch(`/finance/money-accounts/${gateway?.id}`)
      .send({ retired: true })
      .expect(409);
    expect(refused.body.code).toBe('Conflict');
    const after = (await api(owner).get('/finance/money-accounts').expect(200))
      .body as MoneyAccountList;
    expect(
      after.items.find((item) => item.kind === 'gateway')?.retiredAt
    ).toBeNull();
  });

  test('answers 400 for a kind or campus edit and for a bank name on a POS account', async ({
    api,
    app,
    schools,
  }) => {
    const { owner, lekki, ikeja } = schools;
    const pos = await createMoneyAccount(app, owner, {
      name: 'Moniepoint POS',
      kind: 'pos',
      campusId: lekki.id,
    });
    const patch = (body: Record<string, unknown>) =>
      api(owner).patch(`/finance/money-accounts/${pos.id}`).send(body);
    await patch({ kind: 'cash' }).expect(400);
    await patch({ campusId: ikeja.id }).expect(400);
    await patch({ campusId: null }).expect(400);
    await patch({ name: '  ' }).expect(400);
    await patch({ last4: 'abcd' }).expect(400);
    const bankName = await patch({ bankName: 'GTBank' }).expect(400);
    expect(bankName.body.message).toBe(MONEY_ACCOUNT_BANK_NAME_MESSAGE);
  });
});

test.describe('listing accounts for recording a payment', () => {
  test('excludes retired and gateway accounts and includes school-wide ones for a campus member', async ({
    app,
    pool,
    schools,
  }) => {
    const { orgA, owner, lekkiOnly, lekki, ikeja } = schools;
    const schoolWide = await createMoneyAccount(app, owner, bank);
    const lekkiPos = await createMoneyAccount(app, owner, {
      name: 'Lekki POS',
      kind: 'pos',
      campusId: lekki.id,
    });
    await createMoneyAccount(app, owner, {
      name: 'Ikeja cash',
      kind: 'cash',
      campusId: ikeja.id,
    });
    const retired = await createMoneyAccount(app, owner, {
      name: 'Old Lekki cash',
      kind: 'cash',
      campusId: lekki.id,
    });
    await pool.query(
      'UPDATE money_account SET retired_at = now() WHERE id = $1',
      [retired.id]
    );
    const ledger = await pool.query<{ id: string }>(
      `INSERT INTO ledger_account (organization_id, code, name, type, parent_id)
       VALUES ($1, 1290, 'Paystack', 'asset', $2) RETURNING id`,
      [orgA.id, await ledgerAccountId(pool, orgA.id, 1200)]
    );
    await pool.query(
      `INSERT INTO money_account (organization_id, ledger_account_id, name, kind)
       VALUES ($1, $2, 'Paystack', 'gateway')`,
      [orgA.id, ledger.rows[0]?.id]
    );

    const service = app.get(MoneyAccountService, { strict: false });
    const options = await service.listForRecording(
      await orgContextFor(app, lekkiOnly)
    );
    expect(options.map((option) => option.id).toSorted(byName)).toEqual(
      [schoolWide.id, lekkiPos.id].toSorted(byName)
    );
    expect(options.find((option) => option.id === schoolWide.id)?.label).toBe(
      'GTBank current · ending 4417'
    );
    const everything = await service.listForRecording(
      await orgContextFor(app, owner)
    );
    expect(everything).toHaveLength(3);
  });
});

test.describe('the dashboard card', () => {
  test('totals the visible accounts and counts the school-wide ones hidden', async ({
    api,
    app,
    schools,
  }) => {
    const { owner, lekkiOnly, lekki } = schools;
    const schoolWide = await createMoneyAccount(app, owner, bank);
    const pos = await createMoneyAccount(app, owner, {
      name: 'Moniepoint POS',
      kind: 'pos',
      campusId: lekki.id,
    });
    const retired = await createMoneyAccount(app, owner, {
      name: 'Old cash',
      kind: 'cash',
      campusId: lekki.id,
    });
    await importOpening(app, owner, {
      moneyAccounts: [
        {
          moneyAccountId: schoolWide.id,
          amountMinor: 9_500_000,
          effectiveOn: '2026-09-01',
        },
        {
          moneyAccountId: pos.id,
          amountMinor: 1_200_000,
          effectiveOn: '2026-09-01',
        },
        {
          moneyAccountId: retired.id,
          amountMinor: 50_000,
          effectiveOn: '2026-09-01',
        },
      ],
    });
    await api(owner)
      .patch(`/finance/money-accounts/${retired.id}`)
      .send({ retired: true })
      .expect(200);

    const everyone = (await api(owner).get('/dashboard/money').expect(200))
      .body as DashboardMoney;
    expect(everyone.currency).toBe('NGN');
    expect(everyone.totalMinor).toBe(10_700_000);
    expect(everyone.hiddenSchoolWide).toBe(0);
    expect(everyone.accounts.map((item) => item.name)).toEqual([
      'Monnify collections',
      'GTBank current',
      'Moniepoint POS',
    ]);

    const campus = (await api(lekkiOnly).get('/dashboard/money').expect(200))
      .body as DashboardMoney;
    expect(campus.totalMinor).toBe(1_200_000);
    expect(campus.hiddenSchoolWide).toBe(2);
    expect(campus.accounts).toEqual([
      {
        id: pos.id,
        name: 'Moniepoint POS',
        kind: 'pos',
        campusName: 'Lekki',
        last4: null,
        balanceMinor: 1_200_000,
      },
    ]);
  });
});

test.describe('the dashboard card across schools', () => {
  test('leaves another school’s accounts out of the totals and the counts', async ({
    api,
    app,
    schools,
  }) => {
    const { owner, ownerB, campusB } = schools;
    const mine = await createMoneyAccount(app, owner, bank);
    const theirs = await createMoneyAccount(app, ownerB, {
      name: 'B account',
      kind: 'bank',
      campusId: campusB.id,
    });
    await importOpening(app, owner, {
      moneyAccounts: [
        {
          moneyAccountId: mine.id,
          amountMinor: 700_000,
          effectiveOn: '2026-09-01',
        },
      ],
    });
    await importOpening(app, ownerB, {
      moneyAccounts: [
        {
          moneyAccountId: theirs.id,
          amountMinor: 3_000_000,
          effectiveOn: '2026-09-01',
        },
      ],
    });
    const theirsSchoolWide = await createMoneyAccount(app, ownerB, {
      name: 'B school-wide',
      kind: 'cash',
      campusId: null,
    });

    const a = (await api(owner).get('/dashboard/money').expect(200))
      .body as DashboardMoney;
    expect(a.totalMinor).toBe(700_000);
    expect(
      a.accounts
        .filter((item) => item.kind !== 'gateway')
        .map((item) => item.id)
    ).toEqual([mine.id]);
    expect(a.hiddenSchoolWide).toBe(0);

    const b = (await api(ownerB).get('/dashboard/money').expect(200))
      .body as DashboardMoney;
    expect(b.totalMinor).toBe(3_000_000);
    expect(
      b.accounts
        .filter((item) => item.kind !== 'gateway')
        .map((item) => item.id)
        .toSorted(byName)
    ).toEqual([theirs.id, theirsSchoolWide.id].toSorted(byName));
  });
});

test.describe('deleting what holds money', () => {
  test('refuses to delete a campus that has a money account, and a school that has one', async ({
    api,
    app,
    createCampus,
    schools,
  }) => {
    const { orgA, owner } = schools;
    const annex = await createCampus(orgA, 'Yaba');
    await createMoneyAccount(app, owner, {
      name: 'Yaba cash',
      kind: 'cash',
      campusId: annex.id,
    });
    await api(owner).delete(`/campuses/${annex.id}`).expect(409);
    const school = await api(owner)
      .delete('/school')
      .send({ confirmName: orgA.name })
      .expect(409);
    expect(school.body.message).toContain('money records');
  });
});

bareSchoolsTest.describe('the school delete check', () => {
  bareSchoolsTest(
    'says a school with a money account cannot be deleted, and one with none can',
    async ({ api, app, schools }) => {
      const { owner, orgA } = schools;
      const before = await api(owner).get('/school/deletable').expect(200);
      expect(before.body).toEqual({ ok: true });
      await createMoneyAccount(app, owner, bank);
      const after = await api(owner).get('/school/deletable').expect(200);
      expect(after.body.ok).toBe(false);
      await api(owner)
        .delete('/school')
        .send({ confirmName: orgA.name })
        .expect(409);
    }
  );

  bareSchoolsTest(
    'says a school with only a journal entry cannot be deleted',
    async ({ api, app, pool, schools }) => {
      const { owner, orgA } = schools;
      await postEntry(app, {
        organizationId: orgA.id,
        reference: 'ONLY-ENTRY',
        kind: 'opening',
        effectiveOn: '2026-09-01',
        postedBy: null,
        lines: [
          {
            ledgerAccountId: await ledgerAccountId(pool, orgA.id, 1200),
            debitMinor: 5,
            creditMinor: 0,
          },
          {
            ledgerAccountId: await ledgerAccountId(pool, orgA.id, 3000),
            debitMinor: 0,
            creditMinor: 5,
          },
        ],
      });
      const res = await api(owner).get('/school/deletable').expect(200);
      expect(res.body.ok).toBe(false);
    }
  );
});

test.describe('isolation', () => {
  test('1: another school answers 404 on every id route and stays out of the lists', async ({
    api,
    app,
    schools,
  }) => {
    const { owner, ownerB, campusB } = schools;
    const mine = await createMoneyAccount(app, owner, bank);
    const theirs = await createMoneyAccount(app, ownerB, {
      name: 'B account',
      kind: 'bank',
      campusId: campusB.id,
    });

    await api(ownerB)
      .get(`/finance/money-accounts/${mine.id}/cash-book`)
      .expect(404);
    await api(ownerB)
      .patch(`/finance/money-accounts/${mine.id}`)
      .send({ name: 'Hijack' })
      .expect(404);
    await api(owner)
      .get(`/finance/money-accounts/${theirs.id}/cash-book`)
      .expect(404);
    await api(owner)
      .patch(`/finance/money-accounts/${theirs.id}`)
      .send({ retired: true })
      .expect(404);

    const items = async (user: typeof owner) =>
      (
        (await api(user).get('/finance/money-accounts').expect(200))
          .body as MoneyAccountList
      ).items;
    const own = (list: Awaited<ReturnType<typeof items>>) =>
      list.filter((item) => item.kind !== 'gateway').map((item) => item.id);
    const gateways = (list: Awaited<ReturnType<typeof items>>) =>
      list.filter((item) => item.kind === 'gateway').map((item) => item.id);
    const [listA, listB] = [await items(owner), await items(ownerB)];
    expect(own(listA)).toEqual([mine.id]);
    expect(own(listB)).toEqual([theirs.id]);
    expect(gateways(listA)).toHaveLength(1);
    expect(gateways(listB)).toHaveLength(1);
    expect(gateways(listA)).not.toEqual(gateways(listB));
  });

  test('2: a campusId naming another school’s campus answers 404 Campus not found', async ({
    api,
    schools,
  }) => {
    const { owner, campusB } = schools;
    const res = await api(owner)
      .post('/finance/money-accounts')
      .send({ name: 'Cross', kind: 'cash', campusId: campusB.id })
      .expect(404);
    expect(res.body.message).toBe(CAMPUS_NOT_FOUND_MESSAGE);
  });

  test('3: a campus member gets 404 for the Ikeja and school-wide accounts on every id route', async ({
    api,
    app,
    schools,
    withPermissions,
  }) => {
    const { orgA, owner, lekki, ikeja } = schools;
    const writer = await withPermissions(orgA, WRITER, { campuses: [lekki] });
    const ikejaCash = await createMoneyAccount(app, owner, {
      name: 'Ikeja cash',
      kind: 'cash',
      campusId: ikeja.id,
    });
    const schoolWide = await createMoneyAccount(app, owner, bank);
    for (const account of [ikejaCash, schoolWide]) {
      await api(writer)
        .get(`/finance/money-accounts/${account.id}/cash-book`)
        .expect(404);
      await api(writer)
        .patch(`/finance/money-accounts/${account.id}`)
        .send({ name: 'Nope' })
        .expect(404);
    }
  });

  test('4: a campus member lists only their campus', async ({
    api,
    app,
    schools,
  }) => {
    const { owner, lekkiOnly, lekki, ikeja } = schools;
    const lekkiAccount = await createMoneyAccount(app, owner, {
      name: 'Lekki cash',
      kind: 'cash',
      campusId: lekki.id,
    });
    await createMoneyAccount(app, owner, {
      name: 'Ikeja cash',
      kind: 'cash',
      campusId: ikeja.id,
    });
    const list = (
      await api(lekkiOnly).get('/finance/money-accounts').expect(200)
    ).body as MoneyAccountList;
    expect(list.items.map((item) => item.id)).toEqual([lekkiAccount.id]);
  });

  test('5: a member with no money permission gets 403 on every route', async ({
    api,
    app,
    schools,
  }) => {
    const { owner, noPermission } = schools;
    const account = await createMoneyAccount(app, owner, bank);
    await api(noPermission).get('/finance/money-accounts').expect(403);
    await api(noPermission)
      .get(`/finance/money-accounts/${account.id}/cash-book`)
      .expect(403);
    await api(noPermission)
      .post('/finance/money-accounts')
      .send(bank)
      .expect(403);
    await api(noPermission)
      .patch(`/finance/money-accounts/${account.id}`)
      .send({ name: 'X' })
      .expect(403);
    await api(noPermission).get('/dashboard/money').expect(403);
  });

  test('5: the bursar reads but cannot add or change an account', async ({
    api,
    app,
    schools,
  }) => {
    const { owner, lekkiOnly, lekki } = schools;
    const account = await createMoneyAccount(app, owner, {
      name: 'Lekki cash',
      kind: 'cash',
      campusId: lekki.id,
    });
    await api(lekkiOnly)
      .post('/finance/money-accounts')
      .send({ name: 'Mine', kind: 'cash', campusId: lekki.id })
      .expect(403);
    await api(lekkiOnly)
      .patch(`/finance/money-accounts/${account.id}`)
      .send({ name: 'Mine' })
      .expect(403);
  });

  test('6: no session answers 401 on every route', async ({
    api,
    app,
    schools,
  }) => {
    const { owner } = schools;
    const account = await createMoneyAccount(app, owner, bank);
    await api().get('/finance/money-accounts').expect(401);
    await api()
      .get(`/finance/money-accounts/${account.id}/cash-book`)
      .expect(401);
    await api().post('/finance/money-accounts').send(bank).expect(401);
    await api()
      .patch(`/finance/money-accounts/${account.id}`)
      .send({})
      .expect(401);
    await api().get('/dashboard/money').expect(401);
  });

  test('7: a create naming another school’s campus answers 404 and the composite foreign keys refuse raw inserts', async ({
    api,
    pool,
    schools,
  }) => {
    const { orgA, owner, campusB } = schools;
    await api(owner)
      .post('/finance/money-accounts')
      .send({ name: 'Cross', kind: 'cash', campusId: campusB.id })
      .expect(404);

    const equity = await ledgerAccountId(pool, orgA.id, 3000);
    await expect(
      pool.query(
        `INSERT INTO money_account (organization_id, ledger_account_id, campus_id, name, kind)
         VALUES ($1, $2, $3, 'Raw', 'cash')`,
        [orgA.id, equity, campusB.id]
      )
    ).rejects.toMatchObject({ code: '23503' });

    const other = await ledgerAccountId(pool, schools.orgB.id, 3000);
    await expect(
      pool.query(
        `INSERT INTO money_account (organization_id, ledger_account_id, name, kind)
         VALUES ($1, $2, 'Raw', 'cash')`,
        [orgA.id, other]
      )
    ).rejects.toMatchObject({ code: '23503' });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const entry = await client.query<{ id: string }>(
        `INSERT INTO journal_entry (organization_id, reference, kind, effective_on)
         VALUES ($1, 'RAW', 'opening', '2026-09-01') RETURNING id`,
        [orgA.id]
      );
      await expect(
        client.query(
          `INSERT INTO journal_line (organization_id, entry_id, ledger_account_id, debit_minor)
           VALUES ($1, $2, $3, 5)`,
          [orgA.id, entry.rows[0]?.id, other]
        )
      ).rejects.toMatchObject({ code: '23503' });
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  });

  test('12: an acting super admin without a reason gets 403 on every write, and with a reason can write', async ({
    api,
    app,
    createUser,
    makeSuperAdmin,
    schools,
  }) => {
    const { orgA, owner } = schools;
    const account = await createMoneyAccount(app, owner, bank);
    const admin = await makeSuperAdmin(await createUser());

    const added = await api(admin)
      .post('/finance/money-accounts')
      .set(acting(orgA.id))
      .send({ name: 'Acting cash', kind: 'cash', campusId: null })
      .expect(403);
    expect(added.body.code).toBe('ActingReadOnly');
    await api(admin)
      .patch(`/finance/money-accounts/${account.id}`)
      .set(acting(orgA.id))
      .send({ name: 'Acting rename' })
      .expect(403);
    await api(admin)
      .get('/finance/money-accounts')
      .set(acting(orgA.id))
      .expect(200);

    await api(admin)
      .post('/finance/money-accounts')
      .set(acting(orgA.id, 'SUP-2207 add the account the school asked for'))
      .send({ name: 'Acting cash', kind: 'cash', campusId: null })
      .expect(201);
  });
});
