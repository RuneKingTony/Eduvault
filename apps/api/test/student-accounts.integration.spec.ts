import type {
  BalanceList,
  GuardianStatement,
  StudentStatement,
} from '@eduvault/api-contract';
import { LedgerService } from '../src/app/modules/ledger/ledger.service';
import { expect, type Fixtures } from './support/base-test';
import {
  TUITION_MINOR,
  addDiscount,
  chargeFixture,
  prepare,
  receivableBalance,
  sendRun,
} from './support/factories/billing';
import { ledgerAccountId, postEntry } from './support/factories/finance';
import { orgContextFor } from './support/factories/org-context';
import { bankAccount, owes, recordCash } from './support/factories/payments';
import { createStudent } from './support/factories/students';
import { schoolsTest as test } from './support/two-schools';

const OPENING = 4_000_000;
const PAID = 10_000_000;
const DISCOUNT = TUITION_MINOR * 0.05;
const CHARGE = 22_000_000;

const byText = (a: string, b: string) => a.localeCompare(b);

const statementAt = async (
  api: Fixtures['api'],
  actor: { cookie: string },
  path: string
) => (await api(actor).get(path).expect(200)).body as StudentStatement;

const statementOf = (
  api: Fixtures['api'],
  actor: { cookie: string },
  studentId: string
) => statementAt(api, actor, `/finance/students/${studentId}/statement`);

const balancesOf = async (
  api: Fixtures['api'],
  actor: { cookie: string },
  query = ''
) =>
  (await api(actor).get(`/finance/balances${query}`).expect(200))
    .body as BalanceList;

const names = (list: BalanceList) => list.items.map((row) => row.studentId);

test.describe('balances and statements over the books', () => {
  test('the balance equals Total - Reduced - Paid and the ledger over charge, discount, payment and opening history', async ({
    api,
    app,
    pool,
    clock,
    schools: { owner, orgA, studentLekki },
  }) => {
    const fixture = await chargeFixture(app, api, owner);
    const tuition = await ledgerAccountId(pool, orgA.id, 4010);
    await addDiscount(pool, {
      organizationId: orgA.id,
      studentId: studentLekki.id,
      fromTermId: fixture.firstTermId,
      feeTypeId: tuition,
    });
    await owes(app, owner, {
      studentId: studentLekki.id,
      amountMinor: OPENING,
    });
    const { runId } = await prepare(api, owner, {
      termId: fixture.secondTermId,
      scope: 'school',
    });
    await sendRun(api, owner, runId ?? '');
    const account = await bankAccount(app, owner);
    const payment = await recordCash(api, owner, {
      accountId: account.id,
      paidOn: clock.today(),
      allocations: [{ studentId: studentLekki.id, amountMinor: PAID }],
    });

    const statement = await statementOf(api, owner, studentLekki.id);
    const ledger = await receivableBalance(pool, orgA.id, studentLekki.id);

    expect(statement.totals).toEqual({
      totalMinor: OPENING + CHARGE,
      reducedMinor: DISCOUNT,
      paidMinor: PAID,
      balanceMinor: OPENING + CHARGE - DISCOUNT - PAID,
    });
    expect(statement.totals.balanceMinor).toBe(ledger);
    expect(
      statement.totals.totalMinor -
        statement.totals.reducedMinor -
        statement.totals.paidMinor
    ).toBe(ledger);
    expect(
      statement.rows
        .map((row) => `${row.status}:${row.amountMinor}`)
        .toSorted(byText)
    ).toEqual(
      [
        `charged:${OPENING}`,
        `charged:${CHARGE}`,
        `reduced:${DISCOUNT}`,
        `paid:${PAID}`,
      ].toSorted(byText)
    );
    const descriptions = statement.rows.map((row) => row.description);
    expect(descriptions).toEqual(
      expect.arrayContaining([
        'Opening balance',
        expect.stringMatching(/^Term fees, Second term, /),
        expect.stringMatching(/^Discount on Term fees, /),
        `Payment ${payment.receiptNumber} from Mrs Ojo (Cash)`,
      ])
    );
    expect(statement.rows.find((row) => row.status === 'paid')?.link).toEqual({
      type: 'payment',
      id: payment.id,
    });
    expect(
      statement.rows.find((row) => row.description.startsWith('Term fees'))
        ?.link?.type
    ).toBe('invoice');
    expect(statement.unpaid).toHaveLength(1);
    expect(statement.unpaid[0]).toMatchObject({
      outstandingMinor: ledger,
      link: { type: 'invoice' },
    });
    expect(statement.student.id).toBe(studentLekki.id);
    expect(statement.page).toBe(1);

    const list = await balancesOf(api, owner);
    const row = list.items.find((item) => item.studentId === studentLekki.id);
    expect(row).toMatchObject({
      balanceMinor: ledger,
      paidMinor: PAID,
      totalMinor: OPENING + CHARGE,
    });
  });

  test('credit shows as a negative balance in Paid up and is never netted into the family total', async ({
    api,
    app,
    schools: { owner, lekki, studentLekki },
  }) => {
    const [guardian] = studentLekki.guardians ?? [];
    const sibling = await createStudent(app, owner, {
      campusId: lekki.id,
      guardians: [
        {
          existingGuardianId: guardian?.guardianId ?? '',
          relationship: 'mother',
          paysFees: true,
        },
      ],
    });
    await owes(app, owner, {
      studentId: studentLekki.id,
      amountMinor: 6_000_000,
    });
    await app
      .get(LedgerService, { strict: false })
      .postOpening(await orgContextFor(app, owner), {
        items: [
          {
            studentId: sibling.id,
            amountMinor: 500_000,
            direction: 'credit',
            effectiveOn: '2026-09-01',
          },
        ],
        moneyAccounts: [],
      });

    const paidUp = await balancesOf(api, owner, '?filter=paid');
    const credit = paidUp.items.find((row) => row.studentId === sibling.id);
    expect(credit?.balanceMinor).toBe(-500_000);

    const family = (
      await api(owner)
        .get(`/finance/guardians/${guardian?.guardianId}/statement`)
        .expect(200)
    ).body as GuardianStatement;
    expect(family.familyTotalMinor).toBe(6_000_000);
    expect(family.creditMinor).toBe(500_000);
    expect(
      family.children.map((child) => child.student.id).toSorted(byText)
    ).toEqual([studentLekki.id, sibling.id].toSorted(byText));
    expect(
      (await statementOf(api, owner, studentLekki.id)).family
    ).toMatchObject({ guardianId: guardian?.guardianId, childCount: 2 });
  });

  test('filters Owing, current, left or graduated and Paid up, and a leaver keeps their debt', async ({
    api,
    app,
    schools: { owner, studentLekki, studentIkeja },
  }) => {
    await owes(app, owner, {
      studentId: studentLekki.id,
      amountMinor: 3_000_000,
    });
    await owes(app, owner, {
      studentId: studentIkeja.id,
      amountMinor: 9_000_000,
    });
    await api(owner)
      .post(`/students/${studentIkeja.id}/leave`)
      .send({ reason: 'relocated', lastDay: studentIkeja.admittedOn })
      .expect(201);

    const owing = await balancesOf(api, owner);
    expect(names(owing)).toEqual([studentIkeja.id, studentLekki.id]);
    expect(owing.items[0]).toMatchObject({
      lifecycle: 'left',
      balanceMinor: 9_000_000,
    });

    expect(names(await balancesOf(api, owner, '?filter=owing_gone'))).toEqual([
      studentIkeja.id,
    ]);
    expect(
      names(await balancesOf(api, owner, '?filter=owing_current'))
    ).toEqual([studentLekki.id]);
    expect(names(await balancesOf(api, owner, '?filter=paid'))).toEqual([]);
    expect(names(await balancesOf(api, owner, '?filter=all'))).toHaveLength(2);

    const tiles = owing.summary;
    expect(tiles).toMatchObject({
      totalOwedMinor: 12_000_000,
      studentsOwing: 2,
      studentsInScope: 2,
      scopeNote: 'All campuses',
    });
  });

  test('searches by name or admission number before paging, sorted by balance then name', async ({
    api,
    app,
    schools: { owner, studentLekki, studentIkeja },
  }) => {
    await owes(app, owner, {
      studentId: studentLekki.id,
      amountMinor: 1_000_000,
    });
    await owes(app, owner, {
      studentId: studentIkeja.id,
      amountMinor: 2_000_000,
    });

    const byName = await balancesOf(
      api,
      owner,
      `?q=${encodeURIComponent(studentLekki.firstName.toLowerCase())}`
    );
    expect(byName.items.map((row) => row.studentId)).toEqual([studentLekki.id]);
    const byNumber = await balancesOf(
      api,
      owner,
      `?q=${encodeURIComponent(studentIkeja.admissionNumber)}`
    );
    expect(byNumber.items.map((row) => row.studentId)).toEqual([
      studentIkeja.id,
    ]);
    const paged = await balancesOf(api, owner, '?pageSize=1&page=2');
    expect(paged.total).toBe(2);
    expect(paged.items.map((row) => row.studentId)).toEqual([studentLekki.id]);
    expect(paged.items[0]?.guardian?.name).toBeDefined();
  });

  test('received this term counts only the in-scope allocations of a split payment', async ({
    api,
    app,
    clock,
    schools: { owner, lekkiOnly, studentLekki, studentIkeja },
  }) => {
    const account = await bankAccount(app, owner);
    await recordCash(api, owner, {
      accountId: account.id,
      paidOn: clock.today(),
      allocations: [
        { studentId: studentLekki.id, amountMinor: 6_000_000 },
        { studentId: studentIkeja.id, amountMinor: 4_000_000 },
      ],
    });

    const asOwner = await balancesOf(api, owner, '?filter=all');
    const asLekki = await balancesOf(api, lekkiOnly, '?filter=all');

    expect(asOwner.summary).toMatchObject({
      receivedThisTermMinor: 10_000_000,
      paymentsThisTerm: 1,
      studentsInScope: 2,
    });
    expect(asLekki.summary).toMatchObject({
      receivedThisTermMinor: 6_000_000,
      paymentsThisTerm: 1,
      studentsInScope: 1,
      scopeNote: 'Lekki campus',
    });
    expect(asLekki.items.map((row) => row.studentId)).toEqual([
      studentLekki.id,
    ]);
  });

  test('a cancelled-looking history keeps the identity: a payment entry reversed by hand leaves Paid at zero', async ({
    api,
    app,
    pool,
    schools: { owner, orgA, studentLekki },
  }) => {
    await owes(app, owner, {
      studentId: studentLekki.id,
      amountMinor: 5_000_000,
    });
    const account = await bankAccount(app, owner);
    const payment = await recordCash(api, owner, {
      accountId: account.id,
      allocations: [{ studentId: studentLekki.id, amountMinor: 5_000_000 }],
    });
    await postEntry(app, {
      organizationId: orgA.id,
      reference: `VOID-${payment.reference}`,
      kind: 'payment_void',
      effectiveOn: payment.paidOn,
      postedBy: null,
      memo: `Void of ${payment.receiptNumber}: Keyed the wrong amount`,
      reversesEntryId: (
        await pool.query<{ journal_entry_id: string }>(
          `SELECT journal_entry_id FROM payment WHERE id = $1`,
          [payment.id]
        )
      ).rows[0]?.journal_entry_id,
      lines: [
        {
          ledgerAccountId: await ledgerAccountId(pool, orgA.id, 1100),
          studentId: studentLekki.id,
          debitMinor: 5_000_000,
          creditMinor: 0,
        },
        {
          ledgerAccountId: await ledgerAccountId(pool, orgA.id, 1200),
          debitMinor: 0,
          creditMinor: 5_000_000,
        },
      ],
    });

    const statement = await statementOf(api, owner, studentLekki.id);

    expect(statement.totals).toEqual({
      totalMinor: 5_000_000,
      reducedMinor: 0,
      paidMinor: 0,
      balanceMinor: 5_000_000,
    });
    expect(statement.rows.map((row) => row.status).toSorted(byText)).toEqual([
      'cancelled',
      'charged',
      'paid',
    ]);
    expect(
      statement.rows.find((row) => row.status === 'cancelled')?.description
    ).toBe(`Cancelled: ${payment.receiptNumber}, Keyed the wrong amount`);
  });

  test('opens a long statement on its last page and pages back', async ({
    api,
    app,
    schools: { owner, studentLekki },
  }) => {
    const account = await bankAccount(app, owner);
    await owes(app, owner, {
      studentId: studentLekki.id,
      amountMinor: 1_000_000,
    });
    for (let index = 0; index < 11; index += 1) {
      await recordCash(api, owner, {
        accountId: account.id,
        allocations: [{ studentId: studentLekki.id, amountMinor: 1000 }],
      });
    }

    const last = await statementOf(api, owner, studentLekki.id);
    const first = await statementAt(
      api,
      owner,
      `/finance/students/${studentLekki.id}/statement?page=1`
    );

    expect(last).toMatchObject({ total: 12, page: 2, pageSize: 10 });
    expect(last.rows).toHaveLength(2);
    expect(first.page).toBe(1);
    expect(first.rows).toHaveLength(10);
  });
});

test.describe('isolation', () => {
  test('a statement for a student in another campus or another school answers 404', async ({
    api,
    schools: { owner, ownerB, lekkiOnly, studentLekki, studentIkeja, studentB },
  }) => {
    await api(lekkiOnly)
      .get(`/finance/students/${studentIkeja.id}/statement`)
      .expect(404);
    await api(ownerB)
      .get(`/finance/students/${studentLekki.id}/statement`)
      .expect(404);
    await api(owner)
      .get(`/finance/students/${studentB.id}/statement`)
      .expect(404);
    await api(lekkiOnly)
      .get(`/finance/students/${studentLekki.id}/statement`)
      .expect(200);
  });

  test('a family view lists only in-scope children and answers 404 when none are in reach', async ({
    api,
    app,
    schools: {
      owner,
      ownerB,
      lekkiOnly,
      lekki,
      ikeja,
      studentLekki,
      studentIkeja,
    },
  }) => {
    const [ikejaGuardian] = studentIkeja.guardians ?? [];
    const [lekkiGuardian] = studentLekki.guardians ?? [];
    await api(lekkiOnly)
      .get(`/finance/guardians/${ikejaGuardian?.guardianId}/statement`)
      .expect(404);
    await api(ownerB)
      .get(`/finance/guardians/${lekkiGuardian?.guardianId}/statement`)
      .expect(404);

    const mixed = await createStudent(app, owner, {
      campusId: ikeja.id,
      guardians: [
        {
          existingGuardianId: lekkiGuardian?.guardianId ?? '',
          relationship: 'mother',
          paysFees: true,
        },
      ],
    });
    const family = (
      await api(lekkiOnly)
        .get(`/finance/guardians/${lekkiGuardian?.guardianId}/statement`)
        .expect(200)
    ).body as GuardianStatement;

    expect(family.children.map((child) => child.student.id)).toEqual([
      studentLekki.id,
    ]);
    expect(lekki.id).toBeDefined();
    const wide = (
      await api(owner)
        .get(`/finance/guardians/${lekkiGuardian?.guardianId}/statement`)
        .expect(200)
    ).body as GuardianStatement;
    expect(
      wide.children.map((child) => child.student.id).toSorted(byText)
    ).toEqual([studentLekki.id, mixed.id].toSorted(byText));
    await api(ownerB)
      .get(`/finance/guardians/${crypto.randomUUID()}/statement`)
      .expect(404);
  });

  test('another school’s rows never reach the lists', async ({
    api,
    app,
    schools: { owner, ownerB, studentLekki, studentB },
  }) => {
    await owes(app, owner, {
      studentId: studentLekki.id,
      amountMinor: 1_000_000,
    });

    const forB = await balancesOf(api, ownerB, '?filter=all');

    expect(forB.items.map((row) => row.studentId)).toEqual([studentB.id]);
    expect(forB.summary).toMatchObject({
      studentsOwing: 0,
      totalOwedMinor: 0,
      studentsInScope: 1,
    });
  });

  test('either read permission opens it, neither answers 403, and no session answers 401', async ({
    api,
    withPermissions,
    schools: { orgA, lekki, noPermission, studentLekki },
  }) => {
    const viaInvoice = await withPermissions(orgA, ['invoice:read'], {
      campuses: [lekki],
    });
    const viaPayment = await withPermissions(orgA, ['payment:read'], {
      campuses: [lekki],
    });
    const neither = await withPermissions(orgA, ['student:read'], {
      campuses: [lekki],
    });

    for (const user of [viaInvoice, viaPayment]) {
      await api(user).get('/finance/balances').expect(200);
      await api(user)
        .get(`/finance/students/${studentLekki.id}/statement`)
        .expect(200);
      await api(user)
        .get(
          `/finance/guardians/${studentLekki.guardians?.[0]?.guardianId}/statement`
        )
        .expect(200);
    }
    for (const user of [neither, noPermission]) {
      await api(user).get('/finance/balances').expect(403);
      await api(user)
        .get(`/finance/students/${studentLekki.id}/statement`)
        .expect(403);
      await api(user)
        .get(
          `/finance/guardians/${studentLekki.guardians?.[0]?.guardianId}/statement`
        )
        .expect(403);
    }
    await api().get('/finance/balances').expect(401);
  });

  test('the administrator and the principal read it and cannot record', async ({
    api,
    addMember,
    createUser,
    schools: { orgA, studentLekki },
  }) => {
    for (const role of ['administrator', 'principal']) {
      const user = await addMember(orgA, await createUser(), { roles: [role] });
      await api(user).get('/finance/balances').expect(200);
      await api(user)
        .get(`/finance/students/${studentLekki.id}/statement`)
        .expect(200);
      await api(user).get('/finance/payments').expect(200);
      await api(user).post('/finance/payments').send({}).expect(403);
    }
  });

  test('refuses an unknown filter with 400', async ({
    api,
    schools: { owner },
  }) => {
    await api(owner).get('/finance/balances?filter=rich').expect(400);
  });
});
