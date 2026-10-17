import type {
  BalanceList,
  PortalChild,
  PortalFamilyStatement,
  PortalStatement,
  StudentStatement,
} from '@eduvault/api-contract';
import { parsePermissionMap } from '@eduvault/policy';
import { syncAllStarterRoles } from '../src/app/common/auth/starter-roles';
import { expect, type Fixtures } from './support/base-test';
import { chargeFixture, prepare, sendRun } from './support/factories/billing';
import {
  importOpening,
  ledgerAccountId,
  postEntry,
} from './support/factories/finance';
import { bankAccount, owes, recordCash } from './support/factories/payments';
import { createStudent } from './support/factories/students';
import {
  family,
  guardianOf,
  signInAs,
  studentOf,
  type Signed,
} from './support/portal';
import { schoolsTest as test } from './support/two-schools';

type Api = Fixtures['api'];

const byText = (a: string, b: string) => a.localeCompare(b);

const statementAt = async (
  api: Api,
  user: Signed,
  path: string
): Promise<PortalStatement> =>
  (await api(user).get(path).expect(200)).body as PortalStatement;

const statementOf = (api: Api, user: Signed, studentId: string) =>
  statementAt(api, user, `/portal/students/${studentId}/statement`);

const familyOf = async (
  api: Api,
  user: Signed
): Promise<PortalFamilyStatement> =>
  (await api(user).get('/portal/family-statement').expect(200))
    .body as PortalFamilyStatement;

const childrenOf = async (api: Api, user: Signed): Promise<PortalChild[]> =>
  (await api(user).get('/portal/children').expect(200)).body as PortalChild[];

const staffStatementOf = async (
  api: Api,
  user: Signed,
  studentId: string
): Promise<StudentStatement> =>
  (await api(user).get(`/finance/students/${studentId}/statement`).expect(200))
    .body as StudentStatement;

const balancesOf = async (api: Api, user: Signed): Promise<BalanceList> =>
  (await api(user).get('/finance/balances?filter=all').expect(200))
    .body as BalanceList;

const feeRoutes = (id: string) => [
  `/portal/students/${id}/statement`,
  '/portal/family-statement',
];

const ADA_OPENING = 6_000_000;
const TOBI_OPENING = 4_000_000;

test.describe('GET /portal/students/:studentId/statement', () => {
  test('gives a guardian their child’s statement with the staff totals and no reference, link or entry id', async ({
    api,
    app,
    schools,
  }) => {
    const { ada, guardianLogin } = await family(app, schools);
    const { owner } = schools;
    await owes(app, owner, { studentId: ada.id, amountMinor: ADA_OPENING });
    const account = await bankAccount(app, owner);
    const payment = await recordCash(api, owner, {
      accountId: account.id,
      allocations: [{ studentId: ada.id, amountMinor: 1_000_000 }],
    });
    const guardian = await signInAs(api, guardianLogin);

    const statement = await statementOf(api, guardian, ada.id);

    expect(statement.student).toEqual({
      id: ada.id,
      name: 'Ada Okeke',
      admissionNumber: ada.admissionNumber,
      className: 'JSS 1 Gold',
      campusName: 'Lekki',
      archived: false,
    });
    expect(statement.totals).toEqual({
      balanceMinor: 5_000_000,
      totalMinor: ADA_OPENING,
      paidMinor: 1_000_000,
      reducedMinor: 0,
    });
    expect(statement.rows).toHaveLength(2);
    expect(statement.rows.map((row) => row.description)).toEqual(
      expect.arrayContaining([
        'Opening balance',
        `Payment ${payment.receiptNumber} from Mrs Ojo (Cash)`,
      ])
    );
    for (const row of statement.rows) {
      expect(Object.keys(row).toSorted(byText)).toEqual([
        'amountMinor',
        'description',
        'effectiveOn',
        'status',
      ]);
    }
    expect(statement).toMatchObject({ total: 2, page: 1, pageSize: 10 });
    expect(statement.unpaid).toEqual([
      { number: 'Opening balance', outstandingMinor: 5_000_000 },
    ]);
  });

  test('gives a linked guardian who does not pay the fees the same 200', async ({
    api,
    app,
    schools: { owner, lekki },
  }) => {
    const child = await createStudent(app, owner, {
      campusId: lekki.id,
      guardians: [
        {
          new: {
            fullName: 'Ngozi Okeke',
            phone: '08011112222',
            address: '1 Test Street',
            relationship: 'guardian',
            paysFees: false,
            login: { kind: 'username' },
          },
        },
      ],
    });
    await owes(app, owner, { studentId: child.id, amountMinor: TOBI_OPENING });
    const guardian = await signInAs(api, guardianOf(child.logins));

    const statement = await statementOf(api, guardian, child.id);

    expect(statement.totals.balanceMinor).toBe(TOBI_OPENING);
    expect((await familyOf(api, guardian)).totalOwedMinor).toBe(TOBI_OPENING);
  });

  test('gives a student their own statement and a family statement covering only themselves', async ({
    api,
    app,
    schools,
  }) => {
    const { ada, tobi } = await family(app, schools);
    await owes(app, schools.owner, {
      studentId: ada.id,
      amountMinor: ADA_OPENING,
    });
    await owes(app, schools.owner, {
      studentId: tobi.id,
      amountMinor: TOBI_OPENING,
    });
    const student = await signInAs(api, studentOf(ada.logins));

    expect((await statementOf(api, student, ada.id)).totals.balanceMinor).toBe(
      ADA_OPENING
    );
    const familyStatement = await familyOf(api, student);
    expect(familyStatement.children.map((child) => child.studentId)).toEqual([
      ada.id,
    ]);
    expect(familyStatement.totalOwedMinor).toBe(ADA_OPENING);
  });

  test('carries the five statuses and lists unpaid charges oldest first', async ({
    api,
    app,
    pool,
    clock,
    schools,
  }) => {
    const { ada, guardianLogin } = await family(app, schools);
    const { owner, orgA } = schools;
    await owes(app, owner, { studentId: ada.id, amountMinor: ADA_OPENING });
    const fixture = await chargeFixture(app, api, owner);
    const { runId } = await prepare(api, owner, {
      termId: fixture.secondTermId,
      scope: 'school',
    });
    await sendRun(api, owner, runId ?? '');
    const account = await bankAccount(app, owner);
    const payment = await recordCash(api, owner, {
      accountId: account.id,
      paidOn: clock.today(),
      allocations: [{ studentId: ada.id, amountMinor: 1_000_000 }],
    });
    const receivable = await ledgerAccountId(pool, orgA.id, 1100);
    const clearing = await ledgerAccountId(pool, orgA.id, 1200);
    const tuition = await ledgerAccountId(pool, orgA.id, 4010);
    const paymentEntry = await pool.query<{ journal_entry_id: string }>(
      `SELECT journal_entry_id FROM payment WHERE id = $1`,
      [payment.id]
    );
    await postEntry(app, {
      organizationId: orgA.id,
      reference: `VOID-${payment.reference}`,
      kind: 'payment_void',
      effectiveOn: payment.paidOn,
      postedBy: null,
      memo: `Void of ${payment.receiptNumber}: Keyed the wrong amount`,
      reversesEntryId: paymentEntry.rows[0]?.journal_entry_id,
      lines: [
        {
          ledgerAccountId: receivable,
          studentId: ada.id,
          debitMinor: 1_000_000,
          creditMinor: 0,
        },
        { ledgerAccountId: clearing, debitMinor: 0, creditMinor: 1_000_000 },
      ],
    });
    await postEntry(app, {
      organizationId: orgA.id,
      reference: 'ADJ-REDUCED-1',
      kind: 'adjustment',
      effectiveOn: clock.today(),
      postedBy: null,
      memo: 'Sibling discount',
      lines: [
        {
          ledgerAccountId: receivable,
          studentId: ada.id,
          debitMinor: 0,
          creditMinor: 500_000,
        },
        { ledgerAccountId: tuition, debitMinor: 500_000, creditMinor: 0 },
      ],
    });
    await postEntry(app, {
      organizationId: orgA.id,
      reference: 'ADJ-REFUND-1',
      kind: 'adjustment',
      effectiveOn: clock.today(),
      postedBy: null,
      memo: 'Refund of a fee',
      lines: [
        {
          ledgerAccountId: receivable,
          studentId: ada.id,
          debitMinor: 300_000,
          creditMinor: 0,
        },
        { ledgerAccountId: clearing, debitMinor: 0, creditMinor: 300_000 },
      ],
    });
    const guardian = await signInAs(api, guardianLogin);

    const statement = await statementOf(api, guardian, ada.id);
    const staff = await staffStatementOf(api, owner, ada.id);

    expect(
      [...new Set(statement.rows.map((row) => row.status))].toSorted(byText)
    ).toEqual(['cancelled', 'charged', 'paid', 'reduced', 'refunded']);
    for (const row of statement.rows) {
      expect(row).not.toHaveProperty('reference');
      expect(row).not.toHaveProperty('link');
      expect(row).not.toHaveProperty('entryId');
    }
    expect(statement.rows.map((row) => row.description)).toEqual(
      expect.arrayContaining([
        'Opening balance',
        expect.stringMatching(/^Term fees, Second term, /),
      ])
    );
    const descriptions = statement.rows.map((row) => row.description);
    expect(descriptions).toEqual(
      expect.arrayContaining([
        `Payment ${payment.receiptNumber} cancelled`,
        'Adjustment',
        'Refund',
      ])
    );
    expect(descriptions.join(' ')).not.toMatch(
      /Keyed the wrong amount|Sibling discount|Refund of a fee/
    );
    expect(statement.unpaid[0]).toMatchObject({ number: 'Opening balance' });
    for (const item of statement.unpaid) {
      expect(Object.keys(item).toSorted(byText)).toEqual([
        'number',
        'outstandingMinor',
      ]);
    }
    expect(statement.unpaid).toEqual(
      staff.unpaid.map((item) => ({
        number: item.reference,
        outstandingMinor: item.outstandingMinor,
      }))
    );
  });

  test('has totals equal to the staff statement and balances, and a family total that adds the same students', async ({
    api,
    app,
    clock,
    schools,
  }) => {
    const { ada, tobi, guardianLogin } = await family(app, schools);
    const { owner } = schools;
    await owes(app, owner, { studentId: ada.id, amountMinor: ADA_OPENING });
    await owes(app, owner, { studentId: tobi.id, amountMinor: TOBI_OPENING });
    const account = await bankAccount(app, owner);
    await recordCash(api, owner, {
      accountId: account.id,
      paidOn: clock.today(),
      allocations: [{ studentId: tobi.id, amountMinor: 1_500_000 }],
    });
    const guardian = await signInAs(api, guardianLogin);

    const balances = await balancesOf(api, owner);
    const ofStudent = (id: string) =>
      balances.items.find((row) => row.studentId === id)?.balanceMinor;
    for (const child of [ada, tobi]) {
      const portal = await statementOf(api, guardian, child.id);
      const staff = await staffStatementOf(api, owner, child.id);
      expect(portal.totals).toEqual(staff.totals);
      expect(portal.totals.balanceMinor).toBe(ofStudent(child.id));
      expect(portal.total).toBe(staff.total);
    }
    const familyStatement = await familyOf(api, guardian);
    expect(familyStatement.totalOwedMinor).toBe(
      (ofStudent(ada.id) ?? 0) + (ofStudent(tobi.id) ?? 0)
    );
    expect(familyStatement.totalOwedMinor).toBe(ADA_OPENING + 2_500_000);
    expect(familyStatement.children.map((child) => child.balanceMinor)).toEqual(
      [ADA_OPENING, 2_500_000]
    );
    expect(
      (await childrenOf(api, guardian)).map((child) => child.balanceMinor)
    ).toEqual([ADA_OPENING, 2_500_000]);
  });

  test('opens on the last page and pages back', async ({
    api,
    app,
    schools,
  }) => {
    const { ada, guardianLogin } = await family(app, schools);
    const { owner } = schools;
    await owes(app, owner, { studentId: ada.id, amountMinor: 1_000_000 });
    const account = await bankAccount(app, owner);
    for (let index = 0; index < 11; index += 1) {
      await recordCash(api, owner, {
        accountId: account.id,
        allocations: [{ studentId: ada.id, amountMinor: 1000 }],
      });
    }
    const guardian = await signInAs(api, guardianLogin);

    const last = await statementOf(api, guardian, ada.id);
    const first = await statementAt(
      api,
      guardian,
      `/portal/students/${ada.id}/statement?page=1`
    );

    expect(last).toMatchObject({ total: 12, page: 2, pageSize: 10 });
    expect(last.rows).toHaveLength(2);
    expect(first.rows).toHaveLength(10);
    await api(guardian)
      .get(`/portal/students/${ada.id}/statement?page=0`)
      .expect(400);
  });
});

test.describe('GET /portal/family-statement', () => {
  test('never nets one child’s credit against another child’s debt', async ({
    api,
    app,
    schools,
  }) => {
    const { ada, tobi, guardianLogin } = await family(app, schools);
    await owes(app, schools.owner, {
      studentId: ada.id,
      amountMinor: ADA_OPENING,
    });
    await importOpening(app, schools.owner, {
      items: [
        {
          studentId: tobi.id,
          amountMinor: 500_000,
          direction: 'credit',
          effectiveOn: '2026-09-01',
        },
      ],
    });
    const guardian = await signInAs(api, guardianLogin);

    const familyStatement = await familyOf(api, guardian);

    expect(familyStatement).toMatchObject({
      totalOwedMinor: ADA_OPENING,
      creditMinor: 500_000,
    });
    expect(familyStatement.children.map((child) => child.balanceMinor)).toEqual(
      [ADA_OPENING, -500_000]
    );
    expect(
      (await statementOf(api, guardian, tobi.id)).totals.balanceMinor
    ).toBe(-500_000);
    expect(
      (await childrenOf(api, guardian)).map((child) => child.balanceMinor)
    ).toEqual([ADA_OPENING, -500_000]);
  });

  test('lists a left child with debt as archived with their balance', async ({
    api,
    app,
    schools,
  }) => {
    const { ada, guardianLogin } = await family(app, schools);
    await owes(app, schools.owner, {
      studentId: ada.id,
      amountMinor: ADA_OPENING,
    });
    await api(schools.owner)
      .post(`/students/${ada.id}/leave`)
      .send({ reason: 'relocated', lastDay: ada.admittedOn })
      .expect(201);
    const guardian = await signInAs(api, guardianLogin);

    const familyStatement = await familyOf(api, guardian);

    expect(familyStatement.children[0]).toMatchObject({
      studentId: ada.id,
      archived: true,
      balanceMinor: ADA_OPENING,
    });
    expect(familyStatement.totalOwedMinor).toBe(ADA_OPENING);
    const statement = await statementOf(api, guardian, ada.id);
    expect(statement.student.archived).toBe(true);
    expect(statement.totals.balanceMinor).toBe(ADA_OPENING);
  });
});

test.describe('GET /portal/children balances', () => {
  test('adds balanceMinor only for a caller holding invoice:readOwn, and never on /portal/me', async ({
    api,
    app,
    pool,
    schools,
  }) => {
    const { ada, tobi, guardianLogin } = await family(app, schools);
    await owes(app, schools.owner, {
      studentId: ada.id,
      amountMinor: ADA_OPENING,
    });
    const guardian = await signInAs(api, guardianLogin);

    const children = await childrenOf(api, guardian);
    expect(children.map((child) => [child.id, child.balanceMinor])).toEqual([
      [ada.id, ADA_OPENING],
      [tobi.id, 0],
    ]);
    const me = (await api(guardian).get('/portal/me').expect(200)).body as {
      children: PortalChild[];
    };
    for (const child of me.children) {
      expect(child).not.toHaveProperty('balanceMinor');
    }

    await pool.query(
      `UPDATE "organizationRole" SET permission = '{"student":["readOwn"]}'
       WHERE "organizationId" = $1 AND role = 'guardian'`,
      [schools.orgA.id]
    );
    for (const child of await childrenOf(api, guardian)) {
      expect(child).not.toHaveProperty('balanceMinor');
    }
  });
});

test.describe('isolation', () => {
  test('a student asking for a sibling’s statement gets 404', async ({
    api,
    app,
    schools,
  }) => {
    const { ada, tobi } = await family(app, schools);
    const student = await signInAs(api, studentOf(ada.logins));

    await api(student).get(`/portal/students/${tobi.id}/statement`).expect(404);
    await statementOf(api, student, ada.id);
  });

  test('a guardian asking for another family’s child, another school’s child or an unknown id gets 404', async ({
    api,
    app,
    schools,
  }) => {
    const { guardianLogin } = await family(app, schools);
    const guardian = await signInAs(api, guardianLogin);
    const { studentLekki, studentIkeja, studentB } = schools;

    for (const stranger of [studentLekki, studentIkeja, studentB]) {
      await api(guardian)
        .get(`/portal/students/${stranger.id}/statement`)
        .expect(404);
    }
    await api(guardian)
      .get('/portal/students/0b0c8a8e-8a3e-4c6c-a8c4-0e2f0f6b1f11/statement')
      .expect(404);
    const familyStatement = await familyOf(api, guardian);
    const others = new Set([studentLekki.id, studentIkeja.id, studentB.id]);
    expect(
      familyStatement.children.some((child) => others.has(child.studentId))
    ).toBe(false);
  });

  test('an owner with no student links gets 404 on a statement and an empty family statement', async ({
    api,
    app,
    schools,
  }) => {
    const { ada } = await family(app, schools);
    await owes(app, schools.owner, {
      studentId: ada.id,
      amountMinor: ADA_OPENING,
    });

    await api(schools.owner)
      .get(`/portal/students/${ada.id}/statement`)
      .expect(404);
    expect(await familyOf(api, schools.owner)).toEqual({
      currency: 'NGN',
      totalOwedMinor: 0,
      creditMinor: 0,
      children: [],
    });
    expect(await childrenOf(api, schools.owner)).toEqual([]);
  });

  test('the other school’s owner gets 404 for this school’s child', async ({
    api,
    schools: { ownerB, studentLekki },
  }) => {
    await api(ownerB)
      .get(`/portal/students/${studentLekki.id}/statement`)
      .expect(404);
  });
});

test.describe('permissions', () => {
  test('refuse a visitor with no session with 401', async ({
    api,
    schools: { studentLekki },
  }) => {
    for (const path of feeRoutes(studentLekki.id)) {
      await api().get(path).expect(401);
    }
  });

  test('answer 403 to a bursar who holds invoice:read but not invoice:readOwn', async ({
    api,
    schools: { lekkiOnly, studentLekki },
  }) => {
    for (const path of feeRoutes(studentLekki.id)) {
      await api(lekkiOnly).get(path).expect(403);
    }
  });

  test('answer 403 on both fee routes to a custom guardian role without invoice:readOwn, which also gets no balanceMinor', async ({
    api,
    app,
    pool,
    schools,
  }) => {
    const { ada, guardianLogin } = await family(app, schools);
    const guardian = await signInAs(api, guardianLogin);
    await pool.query(
      `UPDATE "organizationRole" SET permission = '{"student":["readOwn"]}'
       WHERE "organizationId" = $1 AND role = 'guardian'`,
      [schools.orgA.id]
    );

    for (const path of feeRoutes(ada.id)) {
      await api(guardian).get(path).expect(403);
    }
    const children = await childrenOf(api, guardian);
    expect(children).toHaveLength(2);
    for (const child of children) {
      expect(child).not.toHaveProperty('balanceMinor');
    }
  });
});

const roleOf = async (
  pool: { query: Fixtures['pool']['query'] },
  organizationId: string
) => {
  const { rows } = await pool.query<{ permission: string }>(
    `SELECT permission FROM "organizationRole"
     WHERE "organizationId" = $1 AND role = 'guardian'`,
    [organizationId]
  );
  return parsePermissionMap(rows[0]?.permission ?? '');
};

test.describe('starter role backfill', () => {
  test('gives an unedited guardian starter role the new own-record permissions and leaves an edited one alone', async ({
    pool,
    schools: { orgA, orgB },
  }) => {
    const before = '{"student":["readOwn"],"invoice":["readOwn"]}';
    await pool.query(
      `UPDATE "organizationRole" SET permission = $2, "editedAt" = NULL
       WHERE "organizationId" = $1 AND role = 'guardian'`,
      [orgA.id, before]
    );
    await pool.query(
      `UPDATE "organizationRole" SET permission = $2, "editedAt" = now()
       WHERE "organizationId" = $1 AND role = 'guardian'`,
      [orgB.id, before]
    );

    await syncAllStarterRoles(pool);

    expect(await roleOf(pool, orgA.id)).toEqual({
      student: ['readOwn'],
      invoice: ['readOwn'],
      feeLine: ['readOwn'],
      payment: ['readOwn'],
    });
    expect(await roleOf(pool, orgB.id)).toEqual({
      student: ['readOwn'],
      invoice: ['readOwn'],
    });
  });
});
