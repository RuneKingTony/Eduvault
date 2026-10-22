import {
  ALREADY_DECIDED_MESSAGE,
  DECLINE_REASON_MESSAGE,
  PAYMENT_VOID_EXISTS_MESSAGE,
  PAYMENT_VOID_OTHER_CAMPUS_MESSAGE,
  PAYMENT_VOID_REASON_MESSAGE,
  SELF_APPROVAL_MESSAGE,
  type PaymentVoidList,
} from '@eduvault/api-contract';
import { acting, expect } from './support/base-test';
import { entriesFor, receivableBalance } from './support/factories/billing';
import {
  askVoid,
  approveVoid,
  entryCount,
  switchApproval,
} from './support/factories/approvals';
import {
  bankAccount,
  owes,
  receiptOf,
  recordCash,
} from './support/factories/payments';
import { schoolsTest as test } from './support/two-schools';

const FEES = 18_000_000;
const PAID = 6_000_000;

test.describe('cancelling a payment', () => {
  test('a request posts nothing and marks the receipt Cancellation waiting', async ({
    api,
    app,
    pool,
    schools: { owner, orgA, lekkiOnly, studentLekki },
  }) => {
    const account = await bankAccount(app, owner);
    await owes(app, owner, { studentId: studentLekki.id, amountMinor: FEES });
    const receipt = await recordCash(api, owner, {
      accountId: account.id,
      allocations: [{ studentId: studentLekki.id, amountMinor: PAID }],
    });
    const entries = await pool.query(`SELECT 1 FROM journal_entry`);

    const asked = await askVoid(api, lekkiOnly, {
      id: receipt.id,
      reason: ' Wrong child ',
    });

    expect(asked.autoApproved).toBe(false);
    expect(asked.void).toMatchObject({
      status: 'submitted',
      reason: 'Wrong child',
      approvedBy: null,
    });
    expect((await pool.query(`SELECT 1 FROM journal_entry`)).rowCount).toBe(
      entries.rowCount
    );
    const waiting = await receiptOf(api, lekkiOnly, receipt.id);
    expect(waiting).toMatchObject({
      status: 'void_pending',
      void: { status: 'submitted', reason: 'Wrong child' },
      voidEntry: null,
    });
    expect(await receivableBalance(pool, orgA.id, studentLekki.id)).toBe(
      FEES - PAID
    );
  });

  test('approving posts the swapped mirror, keeps the receipt and puts the balance back', async ({
    api,
    app,
    pool,
    schools: { owner, orgA, lekkiOnly, studentLekki },
  }) => {
    const account = await bankAccount(app, owner);
    await owes(app, owner, { studentId: studentLekki.id, amountMinor: FEES });
    const receipt = await recordCash(api, owner, {
      accountId: account.id,
      allocations: [{ studentId: studentLekki.id, amountMinor: PAID }],
    });
    const { void: asked } = await askVoid(api, lekkiOnly, receipt.id);

    const approved = await approveVoid(api, owner, asked.id);

    expect(approved).toMatchObject({ status: 'approved' });
    expect(approved.approvedBy).not.toBeNull();
    const cancelled = await receiptOf(api, owner, receipt.id);
    expect(cancelled.status).toBe('voided');
    expect(cancelled.voidEntry).toMatchObject({
      reference: `VOID-${receipt.reference}`,
      balanced: true,
    });
    const lines = await entriesFor(pool, orgA.id, `VOID-${receipt.reference}`);
    expect(
      lines.map((line) => [
        line.student_id,
        line.debit_minor,
        line.credit_minor,
      ])
    ).toEqual(
      expect.arrayContaining([
        [null, '0', String(PAID)],
        [studentLekki.id, String(PAID), '0'],
      ])
    );
    expect(await receivableBalance(pool, orgA.id, studentLekki.id)).toBe(FEES);
    const { rows } = await pool.query<{
      kind: string;
      reverses: string | null;
    }>(
      `SELECT kind, reverses_entry_id AS reverses FROM journal_entry WHERE reference = $1`,
      [`VOID-${receipt.reference}`]
    );
    expect(rows[0]?.kind).toBe('payment_void');
    expect(rows[0]?.reverses).not.toBeNull();
  });

  test('reverses the original lines even after the student moved campus', async ({
    api,
    app,
    pool,
    schools: { owner, orgA, lekki, ikeja, lekkiOnly, studentLekki },
  }) => {
    const account = await bankAccount(app, owner);
    await owes(app, owner, { studentId: studentLekki.id, amountMinor: FEES });
    const receipt = await recordCash(api, owner, {
      accountId: account.id,
      allocations: [{ studentId: studentLekki.id, amountMinor: PAID }],
    });
    const { void: asked } = await askVoid(api, lekkiOnly, receipt.id);
    await pool.query(
      `UPDATE enrollment_placement SET campus_id = $2
       WHERE enrollment_id IN (SELECT id FROM student_enrollment WHERE student_id = $1)`,
      [studentLekki.id, ikeja.id]
    );

    await approveVoid(api, owner, asked.id);

    const lines = await entriesFor(pool, orgA.id, `VOID-${receipt.reference}`);
    const studentLine = lines.find(
      (line) => line.student_id === studentLekki.id
    );
    expect(studentLine?.campus_id).toBe(lekki.id);
  });

  test('declining returns the receipt to Recorded and a new request is accepted', async ({
    api,
    app,
    pool,
    schools: { owner, orgA, lekkiOnly, studentLekki },
  }) => {
    const account = await bankAccount(app, owner);
    const receipt = await recordCash(api, owner, {
      accountId: account.id,
      allocations: [{ studentId: studentLekki.id, amountMinor: PAID }],
    });
    const { void: asked } = await askVoid(api, lekkiOnly, receipt.id);

    const declined = await api(owner)
      .post(`/finance/payment-voids/${asked.id}/decline`)
      .send({ reason: ' Not agreed ' })
      .expect(200);

    expect(declined.body).toMatchObject({
      status: 'rejected',
      rejectionReason: 'Not agreed',
    });
    expect(await entryCount(pool, orgA.id, `VOID-${receipt.reference}`)).toBe(
      0
    );
    expect((await receiptOf(api, owner, receipt.id)).status).toBe('posted');
    const again = await askVoid(api, lekkiOnly, {
      id: receipt.id,
      reason: 'Really wrong',
    });
    expect(again.void.status).toBe('submitted');
    expect((await receiptOf(api, owner, receipt.id)).status).toBe(
      'void_pending'
    );
  });

  test('a second request while one waits answers 409, and a blank reason 400', async ({
    api,
    app,
    schools: { owner, lekkiOnly, studentLekki },
  }) => {
    const account = await bankAccount(app, owner);
    const receipt = await recordCash(api, owner, {
      accountId: account.id,
      allocations: [{ studentId: studentLekki.id, amountMinor: PAID }],
    });
    const path = `/finance/payments/${receipt.id}/void-requests`;

    const blank = await api(lekkiOnly)
      .post(path)
      .send({ reason: '  ' })
      .expect(400);
    expect(JSON.stringify(blank.body)).toContain(PAYMENT_VOID_REASON_MESSAGE);
    await askVoid(api, lekkiOnly, receipt.id);
    const second = await api(lekkiOnly)
      .post(path)
      .send({ reason: 'again' })
      .expect(409);

    expect(second.body.message).toBe(PAYMENT_VOID_EXISTS_MESSAGE);
  });

  test('nobody approves or declines their own request', async ({
    api,
    app,
    withPermissions,
    schools: { owner, orgA, lekki, studentLekki },
  }) => {
    const chika = await withPermissions(
      orgA,
      ['payment:void', 'adjustment:read', 'adjustment:approve'],
      { campuses: [lekki] }
    );
    const account = await bankAccount(app, owner);
    const receipt = await recordCash(api, owner, {
      accountId: account.id,
      allocations: [{ studentId: studentLekki.id, amountMinor: PAID }],
    });
    const { void: asked } = await askVoid(api, chika, receipt.id);

    const approve = await api(chika)
      .post(`/finance/payment-voids/${asked.id}/approve`)
      .expect(409);
    const decline = await api(chika)
      .post(`/finance/payment-voids/${asked.id}/decline`)
      .send({ reason: 'No' })
      .expect(409);

    expect(approve.body).toMatchObject({
      code: 'SelfApproval',
      message: SELF_APPROVAL_MESSAGE,
    });
    expect(decline.body.code).toBe('SelfApproval');
    expect((await receiptOf(api, owner, receipt.id)).status).toBe(
      'void_pending'
    );
  });

  test('the owner approves their own cancellation and the audit row says so', async ({
    api,
    app,
    pool,
    schools: { owner, studentLekki },
  }) => {
    const account = await bankAccount(app, owner);
    const receipt = await recordCash(api, owner, {
      accountId: account.id,
      allocations: [{ studentId: studentLekki.id, amountMinor: PAID }],
    });
    const { void: asked } = await askVoid(api, owner, receipt.id);

    const approved = await approveVoid(api, owner, asked.id);

    expect(approved.status).toBe('approved');
    expect((await receiptOf(api, owner, receipt.id)).status).toBe('voided');
    const { rows } = await pool.query<{ text: string; data: unknown }>(
      `SELECT text, data FROM activity_event WHERE kind = 'payment.cancelled' AND subject_id = $1`,
      [receipt.id]
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.text).toMatch(/\(their own request\)\.$/);
    expect(rows[0]?.data).toMatchObject({ ownRequest: true });
  });

  test('racing approvers give one 200, one 409 and one journal entry', async ({
    api,
    app,
    pool,
    withPermissions,
    schools: { owner, orgA, lekkiOnly, studentLekki },
  }) => {
    const second = await withPermissions(orgA, [
      'adjustment:read',
      'adjustment:approve',
      'campus:readAll',
    ]);
    const account = await bankAccount(app, owner);
    const receipt = await recordCash(api, owner, {
      accountId: account.id,
      allocations: [{ studentId: studentLekki.id, amountMinor: PAID }],
    });
    const { void: asked } = await askVoid(api, lekkiOnly, receipt.id);

    const results = await Promise.all(
      [owner, second].map((approver) =>
        api(approver).post(`/finance/payment-voids/${asked.id}/approve`)
      )
    );

    expect(results.map((res) => res.status).toSorted((a, b) => a - b)).toEqual([
      200, 409,
    ]);
    const loser = results.find((res) => res.status === 409);
    expect(loser?.body).toMatchObject({
      code: 'AlreadyDecided',
      message: ALREADY_DECIDED_MESSAGE,
    });
    expect(await entryCount(pool, orgA.id, `VOID-${receipt.reference}`)).toBe(
      1
    );
  });

  test('a blank decline reason answers 400 and changes nothing', async ({
    api,
    app,
    schools: { owner, lekkiOnly, studentLekki },
  }) => {
    const account = await bankAccount(app, owner);
    const receipt = await recordCash(api, owner, {
      accountId: account.id,
      allocations: [{ studentId: studentLekki.id, amountMinor: PAID }],
    });
    const { void: asked } = await askVoid(api, lekkiOnly, receipt.id);

    const res = await api(owner)
      .post(`/finance/payment-voids/${asked.id}/decline`)
      .send({ reason: '   ' })
      .expect(400);

    expect(JSON.stringify(res.body)).toContain(DECLINE_REASON_MESSAGE);
    expect((await receiptOf(api, owner, receipt.id)).status).toBe(
      'void_pending'
    );
  });

  test('switched off, the cancellation posts at once with no approver while a waiting one stays waiting', async ({
    api,
    app,
    pool,
    schools: { owner, orgA, lekkiOnly, studentLekki },
  }) => {
    const account = await bankAccount(app, owner);
    const record = (amountMinor: number) =>
      recordCash(api, owner, {
        accountId: account.id,
        allocations: [{ studentId: studentLekki.id, amountMinor }],
      });
    const first = await record(PAID);
    const second = await record(PAID + 100);
    const waiting = await askVoid(api, lekkiOnly, first.id);
    await switchApproval(api, owner, { paymentVoid: false });

    const instant = await askVoid(api, lekkiOnly, second.id);

    expect(instant.autoApproved).toBe(true);
    expect(instant.void).toMatchObject({
      status: 'approved',
      approvedBy: null,
    });
    expect((await receiptOf(api, owner, second.id)).status).toBe('voided');
    expect(await entryCount(pool, orgA.id, `VOID-${second.reference}`)).toBe(1);
    expect((await receiptOf(api, owner, first.id)).status).toBe('void_pending');
    const list = await api(owner).get('/finance/payment-voids').expect(200);
    expect((list.body as PaymentVoidList).waitingCount).toBe(1);
    await approveVoid(api, owner, waiting.void.id);
  });

  test('lists voids newest first with the waiting count and refuses a payment void to a member without the permission', async ({
    api,
    app,
    schools: { owner, noPermission, lekkiOnly, studentLekki },
  }) => {
    const account = await bankAccount(app, owner);
    const receipt = await recordCash(api, owner, {
      accountId: account.id,
      allocations: [{ studentId: studentLekki.id, amountMinor: PAID }],
    });
    await askVoid(api, lekkiOnly, receipt.id);

    const list = await api(lekkiOnly).get('/finance/payment-voids').expect(200);

    expect(list.body).toMatchObject({
      total: 1,
      waitingCount: 1,
      items: [
        {
          status: 'submitted',
          payment: { receiptNumber: receipt.receiptNumber },
        },
      ],
    });
    await api(noPermission).get('/finance/payment-voids').expect(403);
    await api(noPermission)
      .post(`/finance/payments/${receipt.id}/void-requests`)
      .send({ reason: 'x' })
      .expect(403);
    await api(lekkiOnly)
      .post(`/finance/payment-voids/${list.body.items[0].id}/approve`)
      .expect(403);
  });

  test('an acting super admin without a reason gets 403 on approve and decline', async ({
    api,
    app,
    createUser,
    makeSuperAdmin,
    schools: { owner, orgA, lekkiOnly, studentLekki },
  }) => {
    const account = await bankAccount(app, owner);
    const receipt = await recordCash(api, owner, {
      accountId: account.id,
      allocations: [{ studentId: studentLekki.id, amountMinor: PAID }],
    });
    const { void: asked } = await askVoid(api, lekkiOnly, receipt.id);
    const admin = await makeSuperAdmin(await createUser());

    const approve = await api(admin)
      .post(`/finance/payment-voids/${asked.id}/approve`)
      .set(acting(orgA.id))
      .expect(403);
    const decline = await api(admin)
      .post(`/finance/payment-voids/${asked.id}/decline`)
      .set(acting(orgA.id))
      .send({ reason: 'No' })
      .expect(403);

    expect(approve.body.code).toBe('ActingReadOnly');
    expect(decline.body.code).toBe('ActingReadOnly');
    await api(admin)
      .post(`/finance/payment-voids/${asked.id}/approve`)
      .set(acting(orgA.id, 'SUP-2207 approve on behalf'))
      .expect(200);
  });
});

test.describe('isolation of payment_void', () => {
  test('another school’s ids answer 404 on every route', async ({
    api,
    app,
    schools: { owner, ownerB, lekkiOnly, studentLekki },
  }) => {
    const account = await bankAccount(app, owner);
    const receipt = await recordCash(api, owner, {
      accountId: account.id,
      allocations: [{ studentId: studentLekki.id, amountMinor: PAID }],
    });
    const { void: asked } = await askVoid(api, lekkiOnly, receipt.id);

    await api(ownerB)
      .post(`/finance/payments/${receipt.id}/void-requests`)
      .send({ reason: 'x' })
      .expect(404);
    await api(ownerB)
      .post(`/finance/payment-voids/${asked.id}/approve`)
      .expect(404);
    await api(ownerB)
      .post(`/finance/payment-voids/${asked.id}/decline`)
      .send({ reason: 'x' })
      .expect(404);
    const list = await api(ownerB).get('/finance/payment-voids').expect(200);
    expect(list.body).toMatchObject({ items: [], total: 0, waitingCount: 0 });
  });

  test('a campus-scoped approver cannot see or decide a void whose students are on another campus', async ({
    api,
    app,
    withPermissions,
    schools: { owner, orgA, ikeja, lekkiOnly, studentLekki },
  }) => {
    const ikejaApprover = await withPermissions(
      orgA,
      ['adjustment:read', 'adjustment:approve'],
      { campuses: [ikeja] }
    );
    const account = await bankAccount(app, owner);
    const receipt = await recordCash(api, owner, {
      accountId: account.id,
      allocations: [{ studentId: studentLekki.id, amountMinor: PAID }],
    });
    const { void: asked } = await askVoid(api, lekkiOnly, receipt.id);

    await api(ikejaApprover)
      .post(`/finance/payment-voids/${asked.id}/approve`)
      .expect(404);
    const list = await api(ikejaApprover)
      .get('/finance/payment-voids')
      .expect(200);
    expect(list.body.items).toEqual([]);
  });

  test('a campus-scoped member cannot cancel or approve a payment that also pays another campus', async ({
    api,
    app,
    withPermissions,
    schools: { owner, orgA, lekki, lekkiOnly, studentLekki, studentIkeja },
  }) => {
    const account = await bankAccount(app, owner);
    const receipt = await recordCash(api, owner, {
      accountId: account.id,
      allocations: [
        { studentId: studentLekki.id, amountMinor: PAID },
        { studentId: studentIkeja.id, amountMinor: PAID },
      ],
    });

    const refused = await api(lekkiOnly)
      .post(`/finance/payments/${receipt.id}/void-requests`)
      .send({ reason: 'Wrong children' })
      .expect(403);
    expect(refused.body.message).toBe(PAYMENT_VOID_OTHER_CAMPUS_MESSAGE);

    const { void: asked } = await askVoid(api, owner, receipt.id);
    const lekkiApprover = await withPermissions(
      orgA,
      ['adjustment:read', 'adjustment:approve'],
      { campuses: [lekki] }
    );
    const approval = await api(lekkiApprover)
      .post(`/finance/payment-voids/${asked.id}/approve`)
      .expect(403);
    expect(approval.body.message).toBe(PAYMENT_VOID_OTHER_CAMPUS_MESSAGE);
    expect(
      (await api(owner).get(`/finance/payments/${receipt.id}`)).body
    ).toMatchObject({
      status: 'void_pending',
    });
  });

  test('the composite foreign keys refuse another school’s payment on a direct insert', async ({
    api,
    app,
    pool,
    schools: { owner, orgB, studentLekki },
  }) => {
    const account = await bankAccount(app, owner);
    const receipt = await recordCash(api, owner, {
      accountId: account.id,
      allocations: [{ studentId: studentLekki.id, amountMinor: PAID }],
    });

    await expect(
      pool.query(
        `INSERT INTO payment_void (organization_id, payment_id, reason) VALUES ($1, $2, 'x')`,
        [orgB.id, receipt.id]
      )
    ).rejects.toMatchObject({ code: '23503' });
  });

  test('a void can be neither deleted nor changed once decided', async ({
    api,
    app,
    pool,
    schools: { owner, lekkiOnly, studentLekki },
  }) => {
    const account = await bankAccount(app, owner);
    const receipt = await recordCash(api, owner, {
      accountId: account.id,
      allocations: [{ studentId: studentLekki.id, amountMinor: PAID }],
    });
    const { void: asked } = await askVoid(api, lekkiOnly, receipt.id);
    await expect(
      pool.query(`DELETE FROM payment_void WHERE id = $1`, [asked.id])
    ).rejects.toMatchObject({ code: '23514' });
    await approveVoid(api, owner, asked.id);

    await expect(
      pool.query(`UPDATE payment_void SET reason = 'changed' WHERE id = $1`, [
        asked.id,
      ])
    ).rejects.toMatchObject({
      code: '23514',
      constraint: 'payment_void_decided_frozen',
    });
  });

  test('answers 401 without a session', async ({ api }) => {
    await api().get('/finance/payment-voids').expect(401);
    await api()
      .post(
        '/finance/payments/0b0c8a8e-8a3e-4c6c-a8c4-0e2f0f6b1f11/void-requests'
      )
      .send({ reason: 'x' })
      .expect(401);
  });
});
