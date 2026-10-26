import type { INestApplication } from '@nestjs/common';
import {
  CREDIT_MIGRATION_CHANGED_MESSAGE,
  CREDIT_MIGRATION_EVERY_CAMPUS_MESSAGE,
  type CreditMigrationReport,
  type CreditMigrationResult,
  type StudentStatement,
  type WalletMovementList,
} from '@eduvault/api-contract';
import type { Pool } from 'pg';
import { acting, expect, type Fixtures } from './support/base-test';
import {
  financeActivityRows,
  importOpening,
  ledgerAccountId,
  postEntry,
  postEntryWhileOpen,
} from './support/factories/finance';
import { owes } from './support/factories/payments';
import { receivableBalance } from './support/factories/billing';
import { walletIdOf } from './support/factories/wallets';
import { createStudent } from './support/factories/students';
import { family, signInAs, studentOf } from './support/portal';
import { schoolsTest as test } from './support/two-schools';

type Api = Fixtures['api'];
type Schools = Parameters<typeof family>[1];

const PATH = '/finance/wallets/credit-migration';
const ADA_CREDIT = 500_000;
const TOBI_CREDIT = 300_000;
const TOTAL = ADA_CREDIT + TOBI_CREDIT;

test.beforeEach(({ clock }) => {
  clock.set('2026-10-07');
});

const credit = (studentId: string, amountMinor: number) => ({
  studentId,
  amountMinor,
  direction: 'credit' as const,
  effectiveOn: '2026-09-01',
});

const reportOf = async (api: Api, actor: { cookie: string }) =>
  (await api(actor).get(PATH).expect(200)).body as CreditMigrationReport;

const reviewed = (report: CreditMigrationReport) => ({
  expectedFamilies: report.totals.familyCount,
  expectedTotalMinor: report.totals.movableMinor,
});

const migrate = (api: Api, actor: { cookie: string }, report: object) =>
  api(actor).post(PATH).send(report);

interface Books {
  owed: number;
  studentCredit: number;
  walletMinor: number;
}

async function booksOf(pool: Pool, organizationId: string): Promise<Books> {
  const { rows } = await pool.query<Record<keyof Books, string>>(
    `SELECT
       COALESCE(sum(GREATEST(b.balance, 0)), 0)::text AS owed,
       COALESCE(sum(GREATEST(-b.balance, 0)), 0)::text AS "studentCredit",
       (SELECT COALESCE(sum(jl.credit_minor - jl.debit_minor), 0)
        FROM journal_line jl
        JOIN ledger_account la ON la.id = jl.ledger_account_id
        WHERE jl.organization_id = $1 AND la.system_key = 'student_wallets')::text AS "walletMinor"
     FROM (
       SELECT jl.student_id, sum(jl.debit_minor - jl.credit_minor) AS balance
       FROM journal_line jl
       JOIN ledger_account la ON la.id = jl.ledger_account_id
       WHERE jl.organization_id = $1 AND la.system_key = 'fees_receivable'
         AND jl.student_id IS NOT NULL
       GROUP BY jl.student_id
     ) b`,
    [organizationId]
  );
  const [row] = rows;
  return {
    owed: Number(row?.owed),
    studentCredit: Number(row?.studentCredit),
    walletMinor: Number(row?.walletMinor),
  };
}

const migrationEntries = async (pool: Pool, organizationId: string) =>
  (
    await pool.query<{
      reference: string;
      posted_by: string;
      memo: string;
      effective_on: string;
    }>(
      `SELECT reference, posted_by, memo, to_char(effective_on, 'YYYY-MM-DD') AS effective_on
       FROM journal_entry
       WHERE organization_id = $1 AND kind = 'wallet_credit_migration'`,
      [organizationId]
    )
  ).rows;

async function overpay(
  app: INestApplication,
  pool: Pool,
  payment: { organizationId: string; studentId: string; amountMinor: number }
): Promise<void> {
  const { organizationId, studentId, amountMinor } = payment;
  const [till, receivable] = await Promise.all([
    ledgerAccountId(pool, organizationId, 1200),
    ledgerAccountId(pool, organizationId, 1100),
  ]);
  await postEntry(app, {
    organizationId,
    reference: `LATE-${studentId}`,
    kind: 'adhoc',
    effectiveOn: '2026-10-06',
    postedBy: null,
    lines: [
      { ledgerAccountId: till, debitMinor: amountMinor, creditMinor: 0 },
      {
        ledgerAccountId: receivable,
        studentId,
        debitMinor: 0,
        creditMinor: amountMinor,
      },
    ],
  });
}

async function creditedFamily(world: {
  app: INestApplication;
  api: Api;
  pool: Pool;
  schools: Schools;
}) {
  const { app, api, pool, schools } = world;
  const { owner } = schools;
  const { ada, tobi, guardianLogin } = await family(app, schools);
  const guardianId = guardianLogin?.guardianId ?? '';
  await pool.query(
    'UPDATE guardian_student SET pays_fees = TRUE WHERE student_id = $1 AND guardian_id = $2',
    [tobi.id, guardianId]
  );
  await importOpening(app, owner, {
    items: [credit(ada.id, ADA_CREDIT), credit(tobi.id, TOBI_CREDIT)],
  });
  await api(owner)
    .post(`/students/${tobi.id}/leave`)
    .send({ reason: 'relocated', lastDay: tobi.admittedOn })
    .expect(201);
  return { ada, tobi, guardianLogin, guardianId };
}

test.describe('the credit migration report', () => {
  test('lists each family once with its children, their status and campus, and the totals', async ({
    api,
    app,
    pool,
    schools,
  }) => {
    const { owner } = schools;
    const { ada, tobi } = await creditedFamily({ app, api, pool, schools });

    const report = await reportOf(api, owner);

    expect(report.currency).toBe('NGN');
    expect(report.totals).toEqual({
      familyCount: 1,
      childCount: 2,
      movableMinor: TOTAL,
      notMovedMinor: 0,
    });
    expect(report.notMoved).toEqual([]);
    expect(report.families).toHaveLength(1);
    expect(report.families[0]).toMatchObject({
      totalMinor: TOTAL,
      children: [
        {
          studentId: ada.id,
          amountMinor: ADA_CREDIT,
          status: 'active',
          campusName: 'Lekki',
        },
        {
          studentId: tobi.id,
          amountMinor: TOBI_CREDIT,
          status: 'left',
          campusName: 'Ikeja',
        },
      ],
    });
  });

  test('sends credit to the guardian whose link to the child is oldest', async ({
    api,
    app,
    pool,
    schools: { owner, lekki, orgA },
  }) => {
    const student = await createStudent(app, owner, {
      campusId: lekki.id,
      guardians: ['Mrs Newer', 'Mr Older'].map((fullName, index) => ({
        new: {
          fullName,
          phone: `0802222111${index}`,
          address: '1 Test Street',
          relationship: 'mother' as const,
          paysFees: true,
          login: { kind: 'username' as const },
        },
      })),
    });
    const [newer, older] = student.logins.filter(
      (login) => login.who === 'guardian'
    );
    await pool.query(
      'UPDATE guardian_student SET created_at = $3 WHERE student_id = $1 AND guardian_id = $2',
      [student.id, newer?.guardianId, '2026-03-01T09:00:00Z']
    );
    await pool.query(
      'UPDATE guardian_student SET created_at = $3 WHERE student_id = $1 AND guardian_id = $2',
      [student.id, older?.guardianId, '2026-01-01T09:00:00Z']
    );
    await importOpening(app, owner, { items: [credit(student.id, 90_000)] });

    const report = await reportOf(api, owner);
    await migrate(api, owner, reviewed(report)).expect(201);

    expect(report.families.map((row) => row.guardianName)).toEqual([
      'Mr Older',
    ]);
    expect(
      (await migrationEntries(pool, orgA.id)).map((row) => row.reference)
    ).toEqual([`WMIG-${older?.guardianId}`]);
  });

  test('lists a student nobody pays for, keeps their credit and does not move it', async ({
    api,
    app,
    pool,
    schools: { owner, orgA, studentLekki },
  }) => {
    await pool.query(
      'UPDATE guardian_student SET pays_fees = FALSE WHERE student_id = $1',
      [studentLekki.id]
    );
    await importOpening(app, owner, {
      items: [credit(studentLekki.id, 120_000)],
    });

    const report = await reportOf(api, owner);

    expect(report.families).toEqual([]);
    expect(report.notMoved).toEqual([
      expect.objectContaining({
        studentId: studentLekki.id,
        amountMinor: 120_000,
        reason: 'no_paying_guardian',
      }),
    ]);
    expect(report.totals).toMatchObject({
      familyCount: 0,
      movableMinor: 0,
      notMovedMinor: 120_000,
    });
    const result = (await migrate(api, owner, reviewed(report)).expect(200))
      .body as CreditMigrationResult;
    expect(result).toMatchObject({ replayed: true, movedMinor: 0 });
    expect(await receivableBalance(pool, orgA.id, studentLekki.id)).toBe(
      -120_000
    );
    expect(await migrationEntries(pool, orgA.id)).toEqual([]);
  });

  test('leaves a debt alone and lists no student who owes', async ({
    api,
    app,
    schools: { owner, studentLekki },
  }) => {
    await owes(app, owner, {
      studentId: studentLekki.id,
      amountMinor: 700_000,
    });

    expect(await reportOf(api, owner)).toMatchObject({
      families: [],
      notMoved: [],
    });
  });
});

test.describe('moving the credit', () => {
  test('posts one entry for the family and leaves what is owed and the credit held unchanged', async ({
    api,
    app,
    pool,
    schools,
  }) => {
    const { owner, orgA, studentIkeja } = schools;
    const { ada, tobi, guardianId } = await creditedFamily({
      app,
      api,
      pool,
      schools,
    });
    await owes(app, owner, {
      studentId: studentIkeja.id,
      amountMinor: 700_000,
    });
    const before = await booksOf(pool, orgA.id);
    const report = await reportOf(api, owner);

    const result = (await migrate(api, owner, reviewed(report)).expect(201))
      .body as CreditMigrationResult;

    expect(result).toEqual({
      currency: 'NGN',
      replayed: false,
      familyCount: 1,
      childCount: 2,
      movedMinor: TOTAL,
    });
    const after = await booksOf(pool, orgA.id);
    expect(after.owed).toBe(before.owed);
    expect(after.studentCredit + after.walletMinor).toBe(
      before.studentCredit + before.walletMinor
    );
    expect(after).toEqual({
      owed: 700_000,
      studentCredit: 0,
      walletMinor: TOTAL,
    });
    expect(await receivableBalance(pool, orgA.id, ada.id)).toBe(0);
    expect(await receivableBalance(pool, orgA.id, tobi.id)).toBe(0);
    expect(await migrationEntries(pool, orgA.id)).toEqual([
      {
        reference: `WMIG-${guardianId}`,
        posted_by: owner.id,
        memo: 'Credit moved to family wallet',
        effective_on: '2026-10-07',
      },
    ]);
  });

  test('answers a second run 200 replayed with zeros and posts nothing new', async ({
    api,
    app,
    pool,
    schools,
  }) => {
    const { owner, orgA } = schools;
    await creditedFamily({ app, api, pool, schools });
    const body = reviewed(await reportOf(api, owner));
    await migrate(api, owner, body).expect(201);
    const books = await booksOf(pool, orgA.id);

    const again = await migrate(api, owner, body).expect(200);

    expect(again.body).toEqual({
      currency: 'NGN',
      replayed: true,
      familyCount: 0,
      childCount: 0,
      movedMinor: 0,
    });
    expect(await booksOf(pool, orgA.id)).toEqual(books);
    expect(await migrationEntries(pool, orgA.id)).toHaveLength(1);
    expect(await reportOf(api, owner)).toMatchObject({
      families: [],
      notMoved: [],
    });
  });

  test('posts once when two requests arrive together', async ({
    api,
    app,
    pool,
    schools,
  }) => {
    const { owner, orgA } = schools;
    await creditedFamily({ app, api, pool, schools });
    const body = reviewed(await reportOf(api, owner));

    const attempts = await Promise.all([
      migrate(api, owner, body),
      migrate(api, owner, body),
    ]);

    expect(attempts.map((res) => res.status).toSorted((a, b) => a - b)).toEqual(
      [200, 201]
    );
    expect(await migrationEntries(pool, orgA.id)).toHaveLength(1);
    expect((await booksOf(pool, orgA.id)).walletMinor).toBe(TOTAL);
  });

  test('refuses figures the person did not read with 409 and posts nothing', async ({
    api,
    app,
    pool,
    schools,
  }) => {
    const { owner, orgA } = schools;
    await creditedFamily({ app, api, pool, schools });
    const report = await reportOf(api, owner);
    const books = await booksOf(pool, orgA.id);

    for (const stale of [
      { ...reviewed(report), expectedTotalMinor: TOTAL - 1 },
      { ...reviewed(report), expectedFamilies: 2 },
    ]) {
      const refused = await migrate(api, owner, stale).expect(409);
      expect(refused.body).toEqual({
        code: 'CreditMigrationChanged',
        message: CREDIT_MIGRATION_CHANGED_MESSAGE,
        report,
      });
    }

    expect(await booksOf(pool, orgA.id)).toEqual(books);
    expect(await migrationEntries(pool, orgA.id)).toEqual([]);
  });

  test('waits for an open change to a child’s account, then answers 409 instead of moving credit that is gone', async ({
    api,
    app,
    pool,
    schools,
  }) => {
    const { owner, orgA } = schools;
    const { ada } = await creditedFamily({ app, api, pool, schools });
    const body = reviewed(await reportOf(api, owner));
    const [till, receivable] = await Promise.all([
      ledgerAccountId(pool, orgA.id, 1200),
      ledgerAccountId(pool, orgA.id, 1100),
    ]);
    const spent = 200_000;
    let moving: Promise<{ status: number }> | undefined;

    await postEntryWhileOpen(
      app,
      {
        organizationId: orgA.id,
        reference: 'LATE-DEBIT',
        kind: 'adhoc',
        effectiveOn: '2026-10-06',
        postedBy: null,
        lines: [
          { ledgerAccountId: till, debitMinor: 0, creditMinor: spent },
          {
            ledgerAccountId: receivable,
            studentId: ada.id,
            debitMinor: spent,
            creditMinor: 0,
          },
        ],
      },
      async () => {
        moving = migrate(api, owner, body).then((res) => res);
        const deadline = Date.now() + 5000;
        for (;;) {
          const { rows } = await pool.query<{ count: string }>(
            `SELECT count(*) FROM pg_stat_activity
             WHERE wait_event_type = 'Lock' AND state = 'active'`
          );
          if (Number(rows[0]?.count) >= 1 || Date.now() > deadline) {
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, 25));
        }
      }
    );

    expect((await moving)?.status).toBe(409);
    expect(await migrationEntries(pool, orgA.id)).toEqual([]);
  });

  test('refuses a body with a negative or missing figure', async ({
    api,
    schools: { owner },
  }) => {
    for (const bad of [
      { expectedFamilies: -1, expectedTotalMinor: 0 },
      { expectedFamilies: 1 },
      {},
    ]) {
      await migrate(api, owner, bad).expect(400);
    }
  });

  test('shows the move on each child’s statement and as one movement on the wallet that sums to its balance', async ({
    api,
    app,
    pool,
    schools,
  }) => {
    const { owner } = schools;
    const { ada, tobi, guardianLogin, guardianId } = await creditedFamily({
      app,
      api,
      pool,
      schools,
    });
    await migrate(api, owner, reviewed(await reportOf(api, owner))).expect(201);
    const { rows: ownerRows } = await pool.query<{ name: string }>(
      'SELECT name FROM "user" WHERE id = $1',
      [owner.id]
    );

    const statement = (
      await api(owner).get(`/finance/students/${ada.id}/statement`).expect(200)
    ).body as StudentStatement;
    expect(statement.rows.find((row) => row.status === 'moved')).toMatchObject({
      description: 'Moved to family wallet',
      amountMinor: ADA_CREDIT,
      link: null,
    });
    expect(statement.totals.balanceMinor).toBe(0);
    const tobiStatement = (
      await api(owner).get(`/finance/students/${tobi.id}/statement`).expect(200)
    ).body as StudentStatement;
    expect(tobiStatement.totals.balanceMinor).toBe(0);

    const walletId = await walletIdOf(pool, guardianId);
    const movements = (
      await api(owner)
        .get(`/finance/wallets/${walletId}/movements?pageSize=50`)
        .expect(200)
    ).body as WalletMovementList;
    expect(movements.items).toEqual([
      expect.objectContaining({
        kind: 'wallet_credit_migration',
        amountMinor: TOTAL,
        studentId: null,
        reference: `WMIG-${guardianId}`,
        source: { type: 'credit_migration', childCount: 2 },
        madeBy: ownerRows[0]?.name ?? 'no such user',
      }),
    ]);
    const wallet = (
      await api(owner).get(`/finance/wallets/${walletId}`).expect(200)
    ).body as { balanceMinor: number };
    expect(movements.items.reduce((sum, row) => sum + row.amountMinor, 0)).toBe(
      wallet.balanceMinor
    );

    const guardian = await signInAs(api, guardianLogin);
    const portal = (
      await api(guardian).get('/portal/wallet/movements').expect(200)
    ).body as { items: { source: unknown; amountMinor: number }[] };
    expect(portal.items).toEqual([
      expect.objectContaining({
        amountMinor: TOTAL,
        source: { type: 'credit_migration', childCount: 2 },
      }),
    ]);
  });

  test('writes one activity row per campus the moved children are on', async ({
    api,
    app,
    pool,
    schools,
  }) => {
    const { owner, orgA, lekki, ikeja } = schools;
    await creditedFamily({ app, api, pool, schools });
    await migrate(api, owner, reviewed(await reportOf(api, owner))).expect(201);

    const rows = (await financeActivityRows(pool, orgA.id)).filter(
      (row) => row.kind === 'wallet.credit_migrated'
    );

    expect(
      rows
        .map((row) => [row.campus_id, row.data['amountMinor']])
        .toSorted((a, b) => Number(a[1]) - Number(b[1]))
    ).toEqual([
      [ikeja.id, TOBI_CREDIT],
      [lekki.id, ADA_CREDIT],
    ]);
    expect(rows[0]?.subject_type).toBe('wallet_credit_migration');
  });

  test('lists credit that appears after the move as already moved and never sweeps the family twice', async ({
    api,
    app,
    pool,
    schools,
  }) => {
    const { owner, orgA } = schools;
    const { ada } = await creditedFamily({ app, api, pool, schools });
    await migrate(api, owner, reviewed(await reportOf(api, owner))).expect(201);
    await overpay(app, pool, {
      organizationId: orgA.id,
      studentId: ada.id,
      amountMinor: 100_000,
    });

    const report = await reportOf(api, owner);
    expect(report.families).toEqual([]);
    expect(report.notMoved).toEqual([
      expect.objectContaining({
        studentId: ada.id,
        amountMinor: 100_000,
        reason: 'family_already_migrated',
      }),
    ]);
    await migrate(api, owner, reviewed(report)).expect(200);
    expect(await receivableBalance(pool, orgA.id, ada.id)).toBe(-100_000);
    expect(await migrationEntries(pool, orgA.id)).toHaveLength(1);
  });
});

test.describe('isolation', () => {
  test('1: another school’s owner sees and moves only their own school', async ({
    api,
    app,
    pool,
    schools,
  }) => {
    const { owner, ownerB, orgA, orgB, studentB } = schools;
    await creditedFamily({ app, api, pool, schools });
    await importOpening(app, ownerB, { items: [credit(studentB.id, 60_000)] });
    const reportA = await reportOf(api, owner);
    const reportB = await reportOf(api, ownerB);

    expect(reportA.totals.movableMinor).toBe(TOTAL);
    expect(reportB.totals).toMatchObject({
      familyCount: 1,
      childCount: 1,
      movableMinor: 60_000,
    });
    expect(
      reportB.families[0]?.children.map((child) => child.studentId)
    ).toEqual([studentB.id]);

    await migrate(api, ownerB, reviewed(reportB)).expect(201);

    expect(await migrationEntries(pool, orgA.id)).toEqual([]);
    expect(await migrationEntries(pool, orgB.id)).toHaveLength(1);
    expect((await booksOf(pool, orgA.id)).studentCredit).toBe(TOTAL);
    expect((await reportOf(api, owner)).totals.movableMinor).toBe(TOTAL);
  });

  test('5: everyone but the owner is refused with 403', async ({
    addMember,
    api,
    app,
    createUser,
    pool,
    schools,
  }) => {
    const { owner, orgA, lekki, lekkiOnly, noPermission, studentLekki } =
      schools;
    const { guardianLogin } = await creditedFamily({ app, api, pool, schools });
    const principal = await addMember(orgA, await createUser(), {
      roles: ['principal'],
      campuses: [lekki],
    });
    const administrator = await addMember(orgA, await createUser(), {
      roles: ['administrator'],
      campuses: [lekki],
    });
    const body = reviewed(await reportOf(api, owner));
    const student = await signInAs(api, studentOf(studentLekki.logins));
    const guardian = await signInAs(api, guardianLogin);

    for (const actor of [
      lekkiOnly,
      principal,
      administrator,
      noPermission,
      student,
      guardian,
    ]) {
      await api(actor).get(PATH).expect(403);
      await migrate(api, actor, body).expect(403);
    }

    expect(await migrationEntries(pool, orgA.id)).toEqual([]);
  });

  test('5b: a member holding the permission on some campuses only is refused, and one on every campus is let in', async ({
    api,
    app,
    pool,
    schools,
    withPermissions,
  }) => {
    const { orgA, lekki } = schools;
    await creditedFamily({ app, api, pool, schools });
    const body = reviewed(await reportOf(api, schools.owner));
    const lekkiMember = await withPermissions(orgA, ['wallet:migrateCredit'], {
      campuses: [lekki],
    });

    const refused = await api(lekkiMember).get(PATH).expect(403);
    expect(refused.body.message).toBe(CREDIT_MIGRATION_EVERY_CAMPUS_MESSAGE);
    await migrate(api, lekkiMember, body).expect(403);
    expect(await migrationEntries(pool, orgA.id)).toEqual([]);

    const everyCampus = await withPermissions(orgA, [
      'wallet:migrateCredit',
      'campus:readAll',
    ]);
    await api(everyCampus).get(PATH).expect(200);
    await migrate(api, everyCampus, body).expect(201);
  });

  test('6: no session answers 401', async ({ api }) => {
    await api({ cookie: '' }).get(PATH).expect(401);
    await api({ cookie: '' })
      .post(PATH)
      .send({ expectedFamilies: 0, expectedTotalMinor: 0 })
      .expect(401);
  });

  test('12: an acting super admin without a reason gets 403 on the move, and with a reason can write', async ({
    api,
    app,
    createUser,
    makeSuperAdmin,
    pool,
    schools,
  }) => {
    const { owner, orgA } = schools;
    await creditedFamily({ app, api, pool, schools });
    const admin = await makeSuperAdmin(await createUser());
    const body = reviewed(await reportOf(api, owner));

    const refused = await api(admin)
      .post(PATH)
      .set(acting(orgA.id))
      .send(body)
      .expect(403);
    expect(refused.body.code).toBe('ActingReadOnly');
    expect(await migrationEntries(pool, orgA.id)).toEqual([]);

    const reason = 'SUP-2310 move the credit the school reviewed';
    await api(admin).get(PATH).set(acting(orgA.id, reason)).expect(200);
    await api(admin)
      .post(PATH)
      .set(acting(orgA.id, reason))
      .send(body)
      .expect(201);
    expect(await migrationEntries(pool, orgA.id)).toHaveLength(1);
  });
});
