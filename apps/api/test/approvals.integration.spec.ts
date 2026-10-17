import type {
  ApprovalList,
  ApprovalSummary,
  DashboardTask,
  SchoolSettings,
} from '@eduvault/api-contract';
import { expect } from './support/base-test';
import {
  approveAdjustment,
  askAdjustment,
  askDiscount,
  askVoid,
  approveVoid,
} from './support/factories/approvals';
import { chargeFixture } from './support/factories/billing';
import { bankAccount, owes, recordCash } from './support/factories/payments';
import { schoolsTest as test } from './support/two-schools';

const OWED = 1_200_000;

const queue = async (
  api: Parameters<typeof askVoid>[0],
  actor: Parameters<typeof askVoid>[1]
): Promise<ApprovalList> =>
  (await api(actor).get('/approvals').expect(200)).body as ApprovalList;

const summary = async (
  api: Parameters<typeof askVoid>[0],
  actor: Parameters<typeof askVoid>[1]
): Promise<ApprovalSummary> =>
  (await api(actor).get('/approvals/summary').expect(200))
    .body as ApprovalSummary;

test.describe('the approvals queue', () => {
  test('lists every waiting kind oldest first with its label, details and amount', async ({
    api,
    app,
    schools: { owner, lekkiOnly, studentLekki },
  }) => {
    const fixture = await chargeFixture(app, api, owner);
    await owes(app, owner, { studentId: studentLekki.id, amountMinor: OWED });
    const account = await bankAccount(app, owner);
    const receipt = await recordCash(api, owner, {
      accountId: account.id,
      payerName: 'Mrs Danjuma',
      allocations: [{ studentId: studentLekki.id, amountMinor: 200_000 }],
    });
    await askVoid(api, lekkiOnly, {
      id: receipt.id,
      reason: 'Wrong child',
    });
    await askAdjustment(api, lekkiOnly, {
      kind: 'write_off',
      studentId: studentLekki.id,
      amountMinor: 500_000,
      reason: 'Left the school',
    });
    await askDiscount(api, lekkiOnly, {
      studentId: studentLekki.id,
      kind: 'percent',
      value: 5,
      ledgerAccountId: null,
      fromTermId: fixture.firstTermId,
      reason: 'Sibling discount',
    });

    const list = await queue(api, owner);

    expect(list.total).toBe(3);
    expect(list.items.map((item) => item.label)).toEqual([
      'Cancel a payment',
      'Cancel a balance',
      'Discount',
    ]);
    expect(list.items[0]).toMatchObject({
      kind: 'payment_void',
      details: `${receipt.receiptNumber} from Mrs Danjuma: Wrong child`,
      amountMinor: 200_000,
      decide: 'yes',
    });
    expect(list.items[1]).toMatchObject({
      details: `${studentLekki.firstName} ${studentLekki.lastName}: Left the school`,
      amountMinor: 500_000,
    });
    expect(list.items[2]).toMatchObject({
      amountMinor: null,
      amountText: '5% off',
    });
    expect(list.items.every((item) => item.createdBy.name !== '')).toBe(true);
  });

  test('counts what the viewer can decide, drops it after a decision and leaves their own out', async ({
    api,
    app,
    withPermissions,
    schools: { owner, orgA, lekki, lekkiOnly, studentLekki },
  }) => {
    await owes(app, owner, { studentId: studentLekki.id, amountMinor: OWED });
    const chika = await withPermissions(
      orgA,
      ['adjustment:create', 'adjustment:read', 'adjustment:approve'],
      { campuses: [lekki] }
    );
    const first = await askAdjustment(api, lekkiOnly, {
      kind: 'write_off',
      studentId: studentLekki.id,
      amountMinor: 100_000,
      reason: 'One',
    });
    await askAdjustment(api, lekkiOnly, {
      kind: 'credit_note',
      studentId: studentLekki.id,
      amountMinor: 100_000,
      reason: 'Two',
    });
    const mine = await askAdjustment(api, chika, {
      kind: 'credit_note',
      studentId: studentLekki.id,
      amountMinor: 100_000,
      reason: 'Mine',
    });

    const asApprover = await summary(api, chika);
    const asOwner = await summary(api, owner);
    const list = await queue(api, chika);

    expect(asApprover).toMatchObject({
      waitingForMe: 2,
      byNav: { approvals: 2, payments: 2 },
    });
    expect(asApprover.preview).toHaveLength(2);
    expect(asOwner.waitingForMe).toBe(3);
    expect(list.total).toBe(3);
    expect(
      list.items.find((item) => item.id === mine.adjustment.id)
    ).toMatchObject({
      decide: 'own',
    });
    expect(list.items.filter((item) => item.decide === 'yes')).toHaveLength(2);

    await approveAdjustment(api, owner, first.adjustment.id);

    expect((await summary(api, chika)).waitingForMe).toBe(1);
    expect((await summary(api, owner)).waitingForMe).toBe(2);
  });

  test('shows another school’s and another campus’s items to nobody outside their scope', async ({
    api,
    app,
    withPermissions,
    schools: { owner, ownerB, orgA, ikeja, lekkiOnly, studentLekki },
  }) => {
    await owes(app, owner, { studentId: studentLekki.id, amountMinor: OWED });
    const ikejaApprover = await withPermissions(
      orgA,
      ['adjustment:read', 'adjustment:approve'],
      { campuses: [ikeja] }
    );
    await askAdjustment(api, lekkiOnly, {
      kind: 'credit_note',
      studentId: studentLekki.id,
      amountMinor: 100_000,
      reason: 'Lekki only',
    });

    expect((await queue(api, owner)).total).toBe(1);
    for (const outsider of [ownerB, ikejaApprover]) {
      expect(await queue(api, outsider)).toMatchObject({ items: [], total: 0 });
      expect(await summary(api, outsider)).toMatchObject({
        waitingForMe: 0,
        preview: [],
      });
    }
  });

  test('a void whose students are all on another campus is hidden, and deciding it by id answers 404', async ({
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
      allocations: [{ studentId: studentLekki.id, amountMinor: 100_000 }],
    });
    const { void: asked } = await askVoid(api, lekkiOnly, receipt.id);

    expect((await queue(api, ikejaApprover)).total).toBe(0);
    await api(ikejaApprover)
      .post(`/finance/payment-voids/${asked.id}/approve`)
      .expect(404);
    await approveVoid(api, owner, asked.id);
    expect((await queue(api, owner)).total).toBe(0);
  });

  test('shows nothing to a member who cannot approve, and a signed-in member needs no permission', async ({
    api,
    app,
    schools: { owner, noPermission, lekkiOnly, studentLekki },
  }) => {
    await owes(app, owner, { studentId: studentLekki.id, amountMinor: OWED });
    await askAdjustment(api, lekkiOnly, {
      kind: 'credit_note',
      studentId: studentLekki.id,
      amountMinor: 100_000,
      reason: 'Hidden',
    });

    expect(await queue(api, noPermission)).toMatchObject({
      items: [],
      total: 0,
    });
    expect(await queue(api, lekkiOnly)).toMatchObject({ items: [], total: 0 });
    expect((await summary(api, noPermission)).waitingForMe).toBe(0);
    await api().get('/approvals').expect(401);
    await api().get('/approvals/summary').expect(401);
  });

  test('adds an approvalsWaiting task to the dashboard for an approver', async ({
    api,
    app,
    schools: { owner, lekkiOnly, studentLekki },
  }) => {
    await owes(app, owner, { studentId: studentLekki.id, amountMinor: OWED });
    await askAdjustment(api, lekkiOnly, {
      kind: 'write_off',
      studentId: studentLekki.id,
      amountMinor: 100_000,
      reason: 'Left the school',
    });

    const tasks = (await api(owner).get('/dashboard/tasks').expect(200))
      .body as DashboardTask[];
    const lekkiTasks = (
      await api(lekkiOnly).get('/dashboard/tasks').expect(200)
    ).body as DashboardTask[];

    expect(
      tasks.find((task) => task.kind === 'approvalsWaiting')
    ).toMatchObject({
      count: 1,
      items: [
        {
          label: 'Cancel a balance',
          details: `${studentLekki.firstName} ${studentLekki.lastName}: Left the school`,
        },
      ],
    });
    expect(lekkiTasks.some((task) => task.kind === 'approvalsWaiting')).toBe(
      false
    );
  });
});

test.describe('approval rules', () => {
  test('are on by default and list who can approve', async ({
    api,
    schools: { owner },
  }) => {
    const settings = (await api(owner).get('/school-settings').expect(200))
      .body as SchoolSettings;

    expect(settings.approvalRules).toEqual({
      refund: true,
      writeOff: true,
      creditNote: true,
      discount: true,
      paymentVoid: true,
    });
    expect(settings.approvers).toEqual(['Owner', 'Principal']);
  });

  test('change through PATCH with schoolAccount:update, and only the named switches', async ({
    api,
    schools: { owner },
  }) => {
    const res = await api(owner)
      .patch('/school-settings/approval-rules')
      .send({ refund: false })
      .expect(200);

    expect(res.body).toEqual({
      refund: false,
      writeOff: true,
      creditNote: true,
      discount: true,
      paymentVoid: true,
    });
    const settings = (await api(owner).get('/school-settings').expect(200))
      .body as SchoolSettings;
    expect(settings.approvalRules.refund).toBe(false);
    await api(owner)
      .patch('/school-settings/approval-rules')
      .send({ leave: false })
      .expect(400);
  });

  test('need schoolAccount:update: 403 without it, 401 without a session', async ({
    api,
    schools: { noPermission, lekkiOnly },
  }) => {
    for (const user of [noPermission, lekkiOnly]) {
      await api(user)
        .patch('/school-settings/approval-rules')
        .send({ refund: false })
        .expect(403);
    }
    await api()
      .patch('/school-settings/approval-rules')
      .send({ refund: false })
      .expect(401);
  });

  test('are per school: switching one off leaves the other school alone', async ({
    api,
    schools: { owner, ownerB },
  }) => {
    await api(owner)
      .patch('/school-settings/approval-rules')
      .send({ paymentVoid: false })
      .expect(200);

    const other = (await api(ownerB).get('/school-settings').expect(200))
      .body as SchoolSettings;
    expect(other.approvalRules.paymentVoid).toBe(true);
  });
});

test.describe('accounts for recording', () => {
  test('are offered to a member who can ask for corrections, even without payment:record', async ({
    api,
    app,
    withPermissions,
    schools: { owner, orgA, lekki, noPermission },
  }) => {
    const account = await bankAccount(app, owner);
    const asker = await withPermissions(orgA, ['adjustment:create'], {
      campuses: [lekki],
    });
    const recorder = await withPermissions(orgA, ['payment:record'], {
      campuses: [lekki],
    });

    for (const user of [asker, recorder]) {
      const res = await api(user)
        .get('/finance/money-accounts/for-recording')
        .expect(200);
      expect(res.body).toEqual([
        { id: account.id, label: expect.stringContaining('GTBank') },
      ]);
    }
    await api(noPermission)
      .get('/finance/money-accounts/for-recording')
      .expect(403);
    await api().get('/finance/money-accounts/for-recording').expect(401);
  });

  test('never list another school’s accounts', async ({
    api,
    app,
    schools: { owner, ownerB },
  }) => {
    const accountA = await bankAccount(app, owner);
    const accountB = await bankAccount(app, ownerB);

    const res = await api(ownerB)
      .get('/finance/money-accounts/for-recording')
      .expect(200);

    expect(res.body).toEqual([
      { id: accountB.id, label: expect.stringContaining('GTBank') },
    ]);
    expect(JSON.stringify(res.body)).not.toContain(accountA.id);
  });

  test('still serves the payment sheet its own options route', async ({
    api,
    schools: { lekkiOnly },
  }) => {
    await api(lekkiOnly).get('/finance/payments/recording-options').expect(200);
  });
});
