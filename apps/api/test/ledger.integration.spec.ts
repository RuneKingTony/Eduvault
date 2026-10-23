import {
  LEDGER_ACCOUNT_PARENT_MESSAGE,
  MONEY_ACCOUNT_NOT_FOUND_MESSAGE,
  JOURNAL_RANGE_MESSAGE,
  type JournalList,
  type LedgerAccount,
  type LedgerAccountList,
  type OpeningBalancesResult,
} from '@eduvault/api-contract';
import type { Permission } from '@eduvault/policy';
import type { PoolClient } from 'pg';
import {
  acting,
  expect,
  type Fixtures,
  type TestUser,
} from './support/base-test';
import {
  createMoneyAccount,
  financeActivityRows,
  financeTexts,
  importOpening,
  ledgerAccountId,
  postEntry,
} from './support/factories/finance';
import { schoolsTest as test, twoSchools } from './support/two-schools';

type Api = Fixtures['api'];
type Schools = Awaited<ReturnType<typeof twoSchools>>;

const MANAGER: Permission[] = ['ledger:read', 'ledger:manageAccounts'];

const byName = (a: string, b: string) => a.localeCompare(b);

const chartOf = async (api: Api, user: TestUser): Promise<LedgerAccountList> =>
  (await api(user).get('/finance/ledger-accounts').expect(200))
    .body as LedgerAccountList;

const under = async (api: Api, user: TestUser, code = 4000) =>
  (await chartOf(api, user)).items.find((item) => item.code === code)?.id;

const childNames = (chart: LedgerAccountList) =>
  chart.items.filter((item) => item.parentId !== null).map((item) => item.name);

const balances = (chart: LedgerAccountList) =>
  Object.fromEntries(chart.items.map((item) => [item.code, item.balanceMinor]));

const journalOf = async (
  api: Api,
  user: TestUser,
  query = ''
): Promise<JournalList> =>
  (await api(user).get(`/finance/journal${query}`).expect(200))
    .body as JournalList;

const debt = (studentId: string, amountMinor: number, effectiveOn: string) => ({
  studentId,
  amountMinor,
  direction: 'debt' as const,
  effectiveOn,
});

async function seedBooks(
  app: Parameters<typeof importOpening>[0],
  pool: Parameters<typeof ledgerAccountId>[0],
  schools: Schools
) {
  const { orgA, owner, studentLekki, studentIkeja, lekki } = schools;
  const gtbank = await createMoneyAccount(app, owner, {
    name: 'GTBank current',
    kind: 'bank',
    bankName: 'GTBank',
    campusId: null,
  });
  const result = await importOpening(app, owner, {
    items: [
      debt(studentLekki.id, 1_200_000, '2026-09-01'),
      {
        ...debt(studentIkeja.id, 500_000, '2026-09-02'),
        direction: 'credit',
      },
    ],
    moneyAccounts: [
      {
        moneyAccountId: gtbank.id,
        amountMinor: 9_500_000,
        effectiveOn: '2026-09-01',
      },
    ],
  });
  await postEntry(app, {
    organizationId: orgA.id,
    reference: 'CHG-2026-00001',
    kind: 'invoice',
    effectiveOn: '2026-09-15',
    memo: 'Term 1 tuition',
    postedBy: null,
    lines: [
      {
        ledgerAccountId: await ledgerAccountId(pool, orgA.id, 1100),
        studentId: studentLekki.id,
        campusId: lekki.id,
        debitMinor: 2_000_000,
        creditMinor: 0,
      },
      {
        ledgerAccountId: await ledgerAccountId(pool, orgA.id, 4010),
        campusId: lekki.id,
        debitMinor: 0,
        creditMinor: 2_000_000,
      },
    ],
  });
  return { gtbank, result };
}

test.describe('the money categories', () => {
  test('lists the chart in code order with 2100 and 4060 hidden, the fee income rolled up and natural signs', async ({
    api,
    app,
    pool,
    schools,
  }) => {
    await seedBooks(app, pool, schools);
    const chart = await chartOf(api, schools.owner);
    expect(chart.scoped).toBe(false);
    expect(chart.currency).toBe('NGN');
    expect(chart.items.map((item) => item.code)).toEqual([
      1100, 1200, 1210, 1300, 3000, 4000, 4010, 4020, 4030, 4040, 4050, 4070,
      4080, 4500, 5000, 5100, 5200, 5300,
    ]);
    expect(balances(chart)).toMatchObject({
      1100: 2_700_000,
      1200: 9_500_000,
      1210: 9_500_000,
      3000: 10_200_000,
      4000: 2_000_000,
      4010: 2_000_000,
      4020: 0,
    });
    const fees = chart.items.find((item) => item.code === 4000);
    const tuition = chart.items.find((item) => item.code === 4010);
    expect(fees).toMatchObject({
      type: 'income',
      systemKey: 'fee_income',
      parentId: null,
    });
    expect(tuition).toMatchObject({
      name: 'Tuition',
      systemKey: null,
      parentId: fees?.id,
    });
  });

  test('gives a campus member only their campus’s lines and leaves school-wide lines out', async ({
    api,
    app,
    pool,
    schools,
  }) => {
    await seedBooks(app, pool, schools);
    const chart = await chartOf(api, schools.lekkiOnly);
    expect(chart.scoped).toBe(true);
    expect(balances(chart)).toMatchObject({
      1100: 3_200_000,
      1200: 0,
      3000: 1_200_000,
      4000: 2_000_000,
    });
  });

  test('leaves other campuses’ and school-wide money accounts out of a campus member’s chart', async ({
    api,
    app,
    schools,
  }) => {
    const { owner, lekkiOnly, lekki, ikeja } = schools;
    await createMoneyAccount(app, owner, {
      name: 'GTBank current',
      kind: 'bank',
      campusId: null,
    });
    await createMoneyAccount(app, owner, {
      name: 'Lekki POS',
      kind: 'pos',
      campusId: lekki.id,
    });
    await createMoneyAccount(app, owner, {
      name: 'Ikeja cash',
      kind: 'cash',
      campusId: ikeja.id,
    });

    expect(childNames(await chartOf(api, owner))).toEqual(
      expect.arrayContaining(['GTBank current', 'Lekki POS', 'Ikeja cash'])
    );
    const scoped = await chartOf(api, lekkiOnly);
    expect(childNames(scoped)).toContain('Lekki POS');
    expect(childNames(scoped)).not.toContain('GTBank current');
    expect(childNames(scoped)).not.toContain('Ikeja cash');
    expect(scoped.items.map((item) => item.code)).toContain(1200);
  });
});

test.describe('adding a fee category', () => {
  test('adds Sports as 4090, then Library as 4100, both income under Fee income', async ({
    api,
    schools,
  }) => {
    const { owner } = schools;
    const parentId = await under(api, owner);
    const sports = await api(owner)
      .post('/finance/ledger-accounts')
      .send({ parentId, name: '  Sports  ' })
      .expect(201);
    expect(sports.body).toMatchObject({
      code: 4090,
      name: 'Sports',
      type: 'income',
      parentId,
      systemKey: null,
      balanceMinor: 0,
    });
    const library = await api(owner)
      .post('/finance/ledger-accounts')
      .send({ parentId, name: 'Library' })
      .expect(201);
    expect((library.body as LedgerAccount).code).toBe(4100);
    const codes = (await chartOf(api, owner)).items.map((item) => item.code);
    expect(codes.slice(codes.indexOf(4000), codes.indexOf(4000) + 12)).toEqual([
      4000, 4010, 4020, 4030, 4040, 4050, 4070, 4080, 4090, 4100, 4500, 5000,
    ]);
  });

  test('writes one school-wide fee_type.created row, shown with the fee types, and none for a duplicate', async ({
    api,
    pool,
    schools,
  }) => {
    const { owner, ownerB, orgA, orgB } = schools;
    const parentId = await under(api, owner);
    const created = await api(owner)
      .post('/finance/ledger-accounts')
      .send({ parentId, name: 'Sports' })
      .expect(201);
    await api(owner)
      .post('/finance/ledger-accounts')
      .send({ parentId, name: ' SPORTS ' })
      .expect(409);

    const rows = (await financeActivityRows(pool, orgA.id)).filter(
      (row) => row.kind === 'fee_type.created'
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      campus_id: null,
      subject_type: 'fee_type',
      subject_id: created.body.id,
      data: { feeTypeId: created.body.id, code: 4090, name: 'Sports' },
    });
    expect(await financeTexts(api, owner)).toContainEqual(
      expect.stringMatching(/^.+ added the fee type Sports \(4090\)\.$/)
    );
    expect(await financeActivityRows(pool, orgB.id)).toEqual([]);
    expect(await financeTexts(api, ownerB)).toEqual([]);
    const feeTypes = (await api(owner).get('/fee-types').expect(200)).body as {
      id: string;
    }[];
    expect(feeTypes.map((feeType) => feeType.id)).toContain(created.body.id);
  });

  test('writes no row for a parent in another school or a refused parent', async ({
    api,
    pool,
    schools,
  }) => {
    const { owner, ownerB, orgA, orgB } = schools;
    const parentA = await under(api, owner);
    await api(ownerB)
      .post('/finance/ledger-accounts')
      .send({ parentId: parentA, name: 'Sports' })
      .expect(404);
    const refusedParent = await under(api, owner, 4010);
    await api(owner)
      .post('/finance/ledger-accounts')
      .send({ parentId: refusedParent, name: 'Sports' })
      .expect(400);
    expect(await financeActivityRows(pool, orgA.id)).toEqual([]);
    expect(await financeActivityRows(pool, orgB.id)).toEqual([]);
  });

  test('answers 409 for a duplicate name, ignoring case and spaces', async ({
    api,
    schools,
  }) => {
    const { owner } = schools;
    const parentId = await under(api, owner);
    const res = await api(owner)
      .post('/finance/ledger-accounts')
      .send({ parentId, name: ' tuition ' })
      .expect(409);
    expect(res.body.message).toBe(
      'A category called tuition already exists here.'
    );
    await api(owner)
      .post('/finance/ledger-accounts')
      .send({ parentId, name: 'Other charges' })
      .expect(409);
  });

  test('answers 400 for a blank name, and for any parent other than Fee income', async ({
    api,
    schools,
  }) => {
    const { owner } = schools;
    const parentId = await under(api, owner);
    await api(owner)
      .post('/finance/ledger-accounts')
      .send({ parentId, name: '   ' })
      .expect(400);
    for (const code of [1200, 4010, 3000]) {
      const refusedParent = await under(api, owner, code);
      const res = await api(owner)
        .post('/finance/ledger-accounts')
        .send({ parentId: refusedParent, name: 'Sports' })
        .expect(400);
      expect(res.body.message).toBe(LEDGER_ACCOUNT_PARENT_MESSAGE);
    }
  });

  test('gives one 201 and one 409 when two adds race for the same code', async ({
    api,
    pool,
    schools,
  }) => {
    const { orgA, owner } = schools;
    const parentId = await ledgerAccountId(pool, orgA.id, 4000);
    const blocker = await pool.connect();
    try {
      await blocker.query('BEGIN');
      await blocker.query(
        `INSERT INTO ledger_account (organization_id, code, name, type, parent_id)
         VALUES ($1, 4090, 'Blocker', 'income', $2)`,
        [orgA.id, parentId]
      );
      const add = (name: string) =>
        api(owner)
          .post('/finance/ledger-accounts')
          .send({ parentId, name })
          .then((res) => res);
      const racing = Promise.all([add('Race A'), add('Race B')]);
      const deadline = Date.now() + 10_000;
      for (;;) {
        const { rows } = await pool.query<{ count: string }>(
          `SELECT count(*) FROM pg_stat_activity
           WHERE wait_event_type = 'Lock' AND state = 'active'`
        );
        if (Number(rows[0]?.count) >= 2 || Date.now() > deadline) {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      await blocker.query('ROLLBACK');
      const statuses = (await racing)
        .map((res) => res.status)
        .toSorted((a, b) => a - b);
      expect(statuses).toEqual([201, 409]);
    } finally {
      blocker.release();
    }
  });

  test('answers 404 for a parent in another school, 403 without the permission and lets a bursar with feeLine:create add one', async ({
    api,
    schools,
  }) => {
    const { owner, ownerB, lekkiOnly, noPermission } = schools;
    const parentA = await under(api, owner);
    await api(ownerB)
      .post('/finance/ledger-accounts')
      .send({ parentId: parentA, name: 'Sports' })
      .expect(404);
    await api(noPermission)
      .post('/finance/ledger-accounts')
      .send({ parentId: parentA, name: 'Sports' })
      .expect(403);
    await api(lekkiOnly)
      .post('/finance/ledger-accounts')
      .send({ parentId: parentA, name: 'Sports' })
      .expect(201);
  });
});

test.describe('the journal', () => {
  test('lists entries newest first with their lines, and filters by date and kind', async ({
    api,
    app,
    pool,
    schools,
  }) => {
    const { owner, studentLekki, lekki } = schools;
    await seedBooks(app, pool, schools);
    const all = await journalOf(api, owner);
    expect(all.total).toBe(4);
    expect(all.currency).toBe('NGN');
    expect(all.items.map((item) => item.reference)).toEqual([
      'CHG-2026-00001',
      `OPEN-${schools.studentIkeja.id}`,
      expect.stringMatching(/^OPEN-MA-/),
      `OPEN-${studentLekki.id}`,
    ]);

    const invoice = all.items[0];
    expect(invoice).toMatchObject({
      effectiveOn: '2026-09-15',
      kind: 'invoice',
      memo: 'Term 1 tuition',
      totalMinor: 2_000_000,
      link: null,
    });
    expect(invoice?.lines).toEqual([
      {
        accountCode: 1100,
        accountName: 'Fees owed to the school',
        studentName: `${studentLekki.firstName} ${studentLekki.lastName}`,
        campusName: lekki.name,
        debitMinor: 2_000_000,
        creditMinor: 0,
      },
      {
        accountCode: 4010,
        accountName: 'Tuition',
        studentName: null,
        campusName: lekki.name,
        debitMinor: 0,
        creditMinor: 2_000_000,
      },
    ]);
    const goLive = all.items[2];
    expect(goLive?.lines.map((line) => line.campusName)).toEqual([null, null]);

    expect(
      (await journalOf(api, owner, '?kind=invoice')).items.map(
        (item) => item.kind
      )
    ).toEqual(['invoice']);
    const range = await journalOf(api, owner, '?from=2026-09-02&to=2026-09-30');
    expect(range.items.map((item) => item.effectiveOn)).toEqual([
      '2026-09-15',
      '2026-09-02',
    ]);
    expect(range.total).toBe(2);
    const early = await journalOf(api, owner, '?to=2026-09-01');
    expect(early.items).toHaveLength(2);
    const paged = await journalOf(api, owner, '?page=2&pageSize=3');
    expect(paged.total).toBe(4);
    expect(paged.items).toHaveLength(1);
  });

  test('answers 400 for a bad date, an unknown kind and a From after the To', async ({
    api,
    schools,
  }) => {
    const { owner } = schools;
    await api(owner).get('/finance/journal?from=01-09-2026').expect(400);
    await api(owner).get('/finance/journal?kind=gift').expect(400);
    await api(owner).get('/finance/journal?pageSize=51').expect(400);
    const reversed = await api(owner)
      .get('/finance/journal?from=2026-10-02&to=2026-10-01')
      .expect(400);
    expect(JSON.stringify(reversed.body)).toContain(JOURNAL_RANGE_MESSAGE);
  });

  test('lists only in-scope lines and leaves out an entry with none', async ({
    api,
    app,
    pool,
    schools,
  }) => {
    const { lekkiOnly, studentLekki } = schools;
    await seedBooks(app, pool, schools);
    const list = await journalOf(api, lekkiOnly);
    expect(list.total).toBe(2);
    expect(list.items.map((item) => item.reference).toSorted(byName)).toEqual(
      ['CHG-2026-00001', `OPEN-${studentLekki.id}`].toSorted(byName)
    );
    for (const item of list.items) {
      expect(item.lines.every((line) => line.campusName === 'Lekki')).toBe(
        true
      );
    }
    expect(list.items.find((item) => item.kind === 'opening')?.totalMinor).toBe(
      1_200_000
    );
  });
});

test.describe('opening balances', () => {
  test('posts a debt, a credit and a go-live balance once, and a repeat reports already_posted', async ({
    api,
    app,
    pool,
    schools,
  }) => {
    const { orgA, owner, studentLekki, studentIkeja } = schools;
    const { gtbank, result } = await seedBooks(app, pool, schools);
    expect(result).toEqual({ posted: 3, skipped: [] });

    const repeat = await api(owner)
      .post('/finance/opening-balances')
      .send({
        items: [
          debt(studentLekki.id, 1_200_000, '2026-09-01'),
          {
            ...debt(studentIkeja.id, 500_000, '2026-09-02'),
            direction: 'credit',
          },
        ],
        moneyAccounts: [
          {
            moneyAccountId: gtbank.id,
            amountMinor: 9_500_000,
            effectiveOn: '2026-09-01',
          },
        ],
      })
      .expect(201);
    const body = repeat.body as OpeningBalancesResult;
    expect(body.posted).toBe(0);
    expect(body.skipped).toEqual([
      { studentId: studentLekki.id, reason: 'already_posted' },
      { studentId: studentIkeja.id, reason: 'already_posted' },
      { moneyAccountId: gtbank.id, reason: 'already_posted' },
    ]);

    const { rows } = await pool.query<{ count: string }>(
      `SELECT count(*) FROM journal_entry WHERE organization_id = $1 AND kind = 'opening'`,
      [orgA.id]
    );
    expect(Number(rows[0]?.count)).toBe(3);
    const lines = await pool.query<{
      debit_minor: string;
      credit_minor: string;
      campus_id: string | null;
    }>(
      `SELECT l.debit_minor, l.credit_minor, l.campus_id
       FROM journal_line l JOIN journal_entry e ON e.id = l.entry_id
       WHERE e.reference = $1 ORDER BY l.credit_minor`,
      [`OPEN-${studentIkeja.id}`]
    );
    expect(
      lines.rows.map((row) => [row.debit_minor, row.credit_minor])
    ).toEqual([
      ['500000', '0'],
      ['0', '500000'],
    ]);
    expect(lines.rows.map((row) => row.campus_id)).toEqual([
      schools.ikeja.id,
      schools.ikeja.id,
    ]);
  });

  test('answers 400 for a zero, negative or fractional amount and for nothing to post', async ({
    api,
    schools,
  }) => {
    const { owner, studentLekki } = schools;
    for (const amountMinor of [0, -5, 10.5]) {
      await api(owner)
        .post('/finance/opening-balances')
        .send({ items: [debt(studentLekki.id, amountMinor, '2026-09-01')] })
        .expect(400);
    }
    await api(owner).post('/finance/opening-balances').send({}).expect(400);
  });

  test('answers 404 for a student out of scope and posts nothing, not even the valid ones', async ({
    api,
    pool,
    schools,
    withPermissions,
  }) => {
    const { orgA, studentLekki, studentIkeja, studentB, lekki, ikeja, owner } =
      schools;
    const manager = await withPermissions(orgA, MANAGER, { campuses: [lekki] });
    const send = (items: ReturnType<typeof debt>[]) =>
      api(manager).post('/finance/opening-balances').send({ items });
    await send([
      debt(studentLekki.id, 100, '2026-09-01'),
      debt(studentIkeja.id, 100, '2026-09-01'),
    ]).expect(404);
    await send([debt(studentB.id, 100, '2026-09-01')]).expect(404);
    const money = await api(owner)
      .post('/finance/money-accounts')
      .send({ name: 'Ikeja cash', kind: 'cash', campusId: ikeja.id })
      .expect(201);
    await api(manager)
      .post('/finance/opening-balances')
      .send({
        moneyAccounts: [
          {
            moneyAccountId: money.body.id,
            amountMinor: 100,
            effectiveOn: '2026-09-01',
          },
        ],
      })
      .expect(404);
    const { rows } = await pool.query<{ count: string }>(
      'SELECT count(*) FROM journal_entry'
    );
    expect(Number(rows[0]?.count)).toBe(0);

    const ok = await send([debt(studentLekki.id, 100, '2026-09-01')]).expect(
      201
    );
    expect(ok.body).toEqual({ posted: 1, skipped: [] });
  });

  test('posts the same student once even when sent twice in one request', async ({
    api,
    pool,
    schools,
  }) => {
    const { owner, studentLekki } = schools;
    const res = await api(owner)
      .post('/finance/opening-balances')
      .send({
        items: [
          debt(studentLekki.id, 100, '2026-09-01'),
          debt(studentLekki.id, 100, '2026-09-01'),
        ],
      })
      .expect(201);
    expect(res.body).toEqual({
      posted: 1,
      skipped: [{ studentId: studentLekki.id, reason: 'already_posted' }],
    });
    const { rows } = await pool.query<{ count: string }>(
      'SELECT count(*) FROM journal_entry'
    );
    expect(Number(rows[0]?.count)).toBe(1);
  });
});

test.describe('an acting super admin', () => {
  test('gets 403 on every write without a reason, and can import with one', async ({
    api,
    createUser,
    makeSuperAdmin,
    schools,
  }) => {
    const { orgA, owner, studentLekki } = schools;
    const admin = await makeSuperAdmin(await createUser());
    const parentId = (await chartOf(api, owner)).items.find(
      (item) => item.code === 4000
    )?.id;
    const body = { items: [debt(studentLekki.id, 100, '2026-09-01')] };

    const writes = [
      () =>
        api(admin)
          .post('/finance/ledger-accounts')
          .set(acting(orgA.id))
          .send({ parentId, name: 'Sports' }),
      () =>
        api(admin)
          .post('/finance/opening-balances')
          .set(acting(orgA.id))
          .send(body),
    ];
    for (const write of writes) {
      const res = await write().expect(403);
      expect(res.body.code).toBe('ActingReadOnly');
    }
    await api(admin)
      .get('/finance/ledger-accounts')
      .set(acting(orgA.id))
      .expect(200);

    const reason = 'SUP-2207 load balances the school sent over';
    const first = await api(admin)
      .post('/finance/opening-balances')
      .set(acting(orgA.id, reason))
      .send(body)
      .expect(201);
    expect(first.body.posted).toBe(1);
    const again = await api(admin)
      .post('/finance/opening-balances')
      .set(acting(orgA.id, reason))
      .send(body)
      .expect(201);
    expect(again.body).toEqual({
      posted: 0,
      skipped: [{ studentId: studentLekki.id, reason: 'already_posted' }],
    });
  });
});

test.describe('isolation', () => {
  test('1: another school answers 404 on the routes that take an id and stays out of the lists', async ({
    api,
    app,
    pool,
    schools,
  }) => {
    const { owner, ownerB, studentB, studentLekki } = schools;
    await seedBooks(app, pool, schools);
    await importOpening(app, ownerB, {
      items: [debt(studentB.id, 700, '2026-09-01')],
    });
    const parentA = (await chartOf(api, owner)).items.find(
      (item) => item.code === 4000
    );
    await api(ownerB)
      .post('/finance/ledger-accounts')
      .send({ parentId: parentA?.id, name: 'Hijack' })
      .expect(404);
    await api(ownerB)
      .post('/finance/opening-balances')
      .send({ items: [debt(studentLekki.id, 100, '2026-09-01')] })
      .expect(404);
    await api(owner)
      .post('/finance/opening-balances')
      .send({ items: [debt(studentB.id, 100, '2026-09-01')] })
      .expect(404);

    const idsA = (await chartOf(api, owner)).items.map((item) => item.id);
    const idsB = new Set(
      (await chartOf(api, ownerB)).items.map((item) => item.id)
    );
    expect(idsA.filter((id) => idsB.has(id))).toEqual([]);
    expect(
      (await journalOf(api, owner)).items.map((item) => item.reference)
    ).not.toContain(`OPEN-${studentB.id}`);
    expect(
      (await journalOf(api, ownerB)).items.map((item) => item.reference)
    ).toEqual([`OPEN-${studentB.id}`]);
  });

  test('2: the lists of A hold no row of B', async ({
    api,
    app,
    pool,
    schools,
  }) => {
    await seedBooks(app, pool, schools);
    const chartB = await chartOf(api, schools.ownerB);
    expect(balances(chartB)).toMatchObject({ 1100: 0, 3000: 0, 4000: 0 });
    expect((await journalOf(api, schools.ownerB)).total).toBe(0);
  });

  test('3: a campus manager gets 404 writing for the Ikeja student, and never reads Ikeja lines', async ({
    api,
    app,
    pool,
    schools,
    withPermissions,
  }) => {
    const { orgA, lekki, studentIkeja } = schools;
    await seedBooks(app, pool, schools);
    const manager = await withPermissions(orgA, MANAGER, { campuses: [lekki] });
    await api(manager)
      .post('/finance/opening-balances')
      .send({ items: [debt(studentIkeja.id, 100, '2026-09-01')] })
      .expect(404);
    const list = await journalOf(api, manager);
    expect(list.items.map((item) => item.reference)).not.toContain(
      `OPEN-${studentIkeja.id}`
    );
  });

  test('4: a campus member lists only their campus’s entries and balances', async ({
    api,
    app,
    pool,
    schools,
  }) => {
    await seedBooks(app, pool, schools);
    const list = await journalOf(api, schools.lekkiOnly);
    expect(list.items.map((item) => item.effectiveOn).toSorted(byName)).toEqual(
      ['2026-09-01', '2026-09-15']
    );
    expect((await chartOf(api, schools.lekkiOnly)).scoped).toBe(true);
  });

  test('5: a member without the permission gets 403 on every route', async ({
    api,
    schools,
  }) => {
    const { noPermission, lekkiOnly, studentLekki } = schools;
    await api(noPermission).get('/finance/ledger-accounts').expect(403);
    await api(noPermission).get('/finance/journal').expect(403);
    await api(noPermission)
      .post('/finance/opening-balances')
      .send({ items: [debt(studentLekki.id, 100, '2026-09-01')] })
      .expect(403);
    await api(lekkiOnly)
      .post('/finance/opening-balances')
      .send({ items: [debt(studentLekki.id, 100, '2026-09-01')] })
      .expect(403);
  });

  test('6: no session answers 401 on every route', async ({ api }) => {
    await api().get('/finance/ledger-accounts').expect(401);
    await api().get('/finance/journal').expect(401);
    await api().post('/finance/ledger-accounts').send({}).expect(401);
    await api().post('/finance/opening-balances').send({}).expect(401);
  });

  test('7: a reference to another school is refused with 404, and the composite foreign keys refuse raw inserts', async ({
    api,
    pool,
    schools,
  }) => {
    const { orgA, orgB, owner, studentB } = schools;
    await api(owner)
      .post('/finance/opening-balances')
      .send({ items: [debt(studentB.id, 100, '2026-09-01')] })
      .expect(404);

    await expect(
      pool.query(
        `INSERT INTO ledger_account (organization_id, code, name, type, parent_id)
         VALUES ($1, 4090, 'Cross', 'income', $2)`,
        [orgA.id, await ledgerAccountId(pool, orgB.id, 4000)]
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
          `INSERT INTO journal_line
             (organization_id, entry_id, ledger_account_id, student_id, debit_minor)
           VALUES ($1, $2, $3, $4, 5)`,
          [
            orgA.id,
            entry.rows[0]?.id,
            await ledgerAccountId(pool, orgA.id, 1100),
            studentB.id,
          ]
        )
      ).rejects.toMatchObject({ code: '23503' });
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  });

  test('7b: the composite foreign keys refuse a raw reversal, entry and campus from another school', async ({
    app,
    pool,
    schools,
  }) => {
    const { orgA, orgB, campusB } = schools;
    const { entry: theirs } = await postEntry(app, {
      organizationId: orgB.id,
      reference: 'B-OPEN',
      kind: 'opening',
      effectiveOn: '2026-09-01',
      postedBy: null,
      lines: [
        {
          ledgerAccountId: await ledgerAccountId(pool, orgB.id, 4010),
          debitMinor: 100,
          creditMinor: 0,
        },
        {
          ledgerAccountId: await ledgerAccountId(pool, orgB.id, 3000),
          debitMinor: 0,
          creditMinor: 100,
        },
      ],
    });
    const mine = await ledgerAccountId(pool, orgA.id, 3000);

    const refused = async (
      work: (client: PoolClient) => Promise<unknown>
    ): Promise<void> => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await expect(work(client)).rejects.toMatchObject({ code: '23503' });
      } finally {
        await client.query('ROLLBACK');
        client.release();
      }
    };
    const ownEntry = async (client: PoolClient): Promise<string | undefined> =>
      (
        await client.query<{ id: string }>(
          `INSERT INTO journal_entry (organization_id, reference, kind, effective_on)
           VALUES ($1, 'RAW', 'opening', '2026-09-01') RETURNING id`,
          [orgA.id]
        )
      ).rows[0]?.id;

    await refused((client) =>
      client.query(
        `INSERT INTO journal_entry (organization_id, reference, kind, effective_on, reverses_entry_id)
         VALUES ($1, 'RAW', 'payment_void', '2026-09-01', $2)`,
        [orgA.id, theirs.id]
      )
    );
    await refused((client) =>
      client.query(
        `INSERT INTO journal_line (organization_id, entry_id, ledger_account_id, debit_minor)
         VALUES ($1, $2, $3, 5)`,
        [orgA.id, theirs.id, mine]
      )
    );
    await refused(async (client) =>
      client.query(
        `INSERT INTO journal_line (organization_id, entry_id, ledger_account_id, campus_id, debit_minor)
         VALUES ($1, $2, $3, $4, 5)`,
        [orgA.id, await ownEntry(client), mine, campusB.id]
      )
    );
  });

  test('7c: a money account of another school answers 404 on opening balances and posts nothing', async ({
    api,
    app,
    schools,
  }) => {
    const { owner, ownerB, campusB, studentLekki } = schools;
    const theirs = await createMoneyAccount(app, ownerB, {
      name: 'B account',
      kind: 'bank',
      campusId: campusB.id,
    });
    const res = await api(owner)
      .post('/finance/opening-balances')
      .send({
        items: [debt(studentLekki.id, 100, '2026-09-01')],
        moneyAccounts: [
          {
            moneyAccountId: theirs.id,
            amountMinor: 500,
            effectiveOn: '2026-09-01',
          },
        ],
      })
      .expect(404);
    expect(res.body.message).toBe(MONEY_ACCOUNT_NOT_FOUND_MESSAGE);
    expect((await journalOf(api, owner)).items).toEqual([]);
    expect((await journalOf(api, ownerB)).items).toEqual([]);
  });

  test('10: an opening balance sent twice leaves one entry and the second answer says already_posted', async ({
    api,
    pool,
    schools,
  }) => {
    const { owner, studentLekki } = schools;
    const send = () =>
      api(owner)
        .post('/finance/opening-balances')
        .send({ items: [debt(studentLekki.id, 100, '2026-09-01')] })
        .expect(201);
    expect((await send()).body.posted).toBe(1);
    expect((await send()).body).toEqual({
      posted: 0,
      skipped: [{ studentId: studentLekki.id, reason: 'already_posted' }],
    });
    const { rows } = await pool.query<{ count: string }>(
      'SELECT count(*) FROM journal_entry'
    );
    expect(Number(rows[0]?.count)).toBe(1);
  });
});
