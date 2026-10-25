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
import { askLeave } from './support/factories/leave';
import { bankAccount, owes, recordCash } from './support/factories/payments';
import {
  approveCount,
  createItem,
  openStock,
  submitCount,
} from './support/factories/store';
import {
  approveCancellationRequest,
  approveRefundRequest,
  cashAccount,
  requestCancellation,
  requestRefund,
  topUpWallet,
  walletIdOf,
} from './support/factories/wallets';
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
      byNav: { approvals: 2, payments: 2, store: 0, wallets: 0 },
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

  test('lists a waiting store write-off for the principal, as their own for its counter, and counts it on Store rather than Payments', async ({
    api,
    withPermissions,
    schools: { owner, orgA, lekki, lekkiOnly },
  }) => {
    const tie = await createItem(api, owner, {
      name: 'Tie',
      variant: null,
      costPriceMinor: 100_000,
      sellPriceMinor: 150_000,
    });
    await openStock(api, owner, {
      campusId: lekki.id,
      lines: [{ itemId: tie.id, quantity: 3, unitCostMinor: 100_000 }],
    });
    const chika = await withPermissions(
      orgA,
      ['store:read', 'store:count', 'adjustment:approve'],
      { campuses: [lekki] }
    );
    const count = await submitCount(api, chika, {
      campusId: lekki.id,
      lines: [{ itemId: tie.id, countedQuantity: 2 }],
    });

    const forOwner = await queue(api, owner);
    const forChika = await queue(api, chika);
    const ownerSummary = await summary(api, owner);
    const chikaSummary = await summary(api, chika);
    const tasks = (await api(owner).get('/dashboard/tasks').expect(200))
      .body as DashboardTask[];

    expect(forOwner.items).toEqual([
      expect.objectContaining({
        kind: 'store_write_off',
        id: count.id,
        label: 'Store write-off',
        details: 'Lekki stock count: Tie: 1 missing',
        amountMinor: 100_000,
        campusId: lekki.id,
        createdBy: { id: chika.id, name: expect.any(String) },
        decide: 'yes',
      }),
    ]);
    expect(forChika.items[0]).toMatchObject({ decide: 'own' });
    expect(ownerSummary).toMatchObject({
      waitingForMe: 1,
      byNav: { approvals: 1, payments: 0, store: 1, wallets: 0 },
    });
    expect(chikaSummary).toMatchObject({
      waitingForMe: 0,
      byNav: { approvals: 0, payments: 0, store: 0, wallets: 0 },
    });
    expect((await summary(api, lekkiOnly)).waitingForMe).toBe(0);
    expect(
      tasks.find((task) => task.kind === 'approvalsWaiting')
    ).toMatchObject({
      count: 1,
      items: [
        {
          label: 'Store write-off',
          details: 'Lekki stock count: Tie: 1 missing',
        },
      ],
    });

    await approveCount(api, owner, count.id);

    expect((await queue(api, owner)).total).toBe(0);
    expect((await summary(api, owner)).byNav).toEqual({
      approvals: 0,
      payments: 0,
      store: 0,
      wallets: 0,
    });
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
        {
          id: account.id,
          kind: 'bank',
          label: expect.stringContaining('GTBank'),
        },
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
      {
        id: accountB.id,
        kind: 'bank',
        label: expect.stringContaining('GTBank'),
      },
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

const queueWith = async (
  api: Parameters<typeof askVoid>[0],
  actor: Parameters<typeof askVoid>[1],
  includeOthers: boolean
): Promise<ApprovalList> =>
  (
    await api(actor)
      .get(`/approvals?includeOthers=${String(includeOthers)}`)
      .expect(200)
  ).body as ApprovalList;

test.describe('leave in the queue', () => {
  const TODAY = '2026-10-12';

  test.beforeEach(({ clock }) => {
    clock.set(TODAY);
  });

  test('lists a leave row with its details and days, and leaves the viewer’s own out of the count', async ({
    api,
    addMember,
    createUser,
    withPermissions,
    schools: { orgA, lekki },
  }) => {
    const grace = await withPermissions(orgA, ['leave:approve'], {
      campuses: [lekki],
    });
    const emeka = await addMember(
      orgA,
      await createUser({ name: 'Emeka Obi' }),
      {
        roles: ['teacher'],
        campuses: [lekki],
      }
    );
    await askLeave(api, emeka, {
      type: 'sick',
      startsOn: '2026-10-12',
      endsOn: '2026-10-13',
      reason: 'Malaria',
    });
    await askLeave(api, grace, { startsOn: '2026-10-22' });

    const list = await queue(api, grace);
    const theirs = list.items.find(
      (item) => item.createdBy.name === 'Emeka Obi'
    );
    const own = list.items.find((item) => item.decide === 'own');

    expect(theirs).toMatchObject({
      kind: 'leave',
      label: 'Leave',
      details: 'Emeka Obi · Sick leave · 12 Oct 2026 – 13 Oct 2026. Malaria',
      amountMinor: null,
      amountText: '2 days',
      decide: 'yes',
    });
    expect(own?.kind).toBe('leave');
    expect(list).toMatchObject({ total: 2, othersCount: 0 });
    expect(await summary(api, grace)).toMatchObject({
      waitingForMe: 1,
      byNav: { approvals: 1, payments: 0 },
    });
  });

  test('counts the pillars and filters the queue to one of them', async ({
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
    const leave = await askLeave(api, lekkiOnly, { startsOn: '2026-10-22' });

    const all = await queue(api, owner);
    const onlyLeave = (
      await api(owner).get('/approvals?pillar=leave').expect(200)
    ).body as ApprovalList;

    expect(all).toMatchObject({ total: 2, pillars: { money: 1, leave: 1 } });
    expect(onlyLeave.items.map((item) => item.id)).toEqual([leave.id]);
    expect(onlyLeave.pillars).toEqual({ money: 1, leave: 1 });
  });

  test('shows a money approver the leave rows only behind the switch, as someone else’s to decide', async ({
    api,
    withPermissions,
    schools: { orgA, lekki, lekkiOnly },
  }) => {
    const boss = await withPermissions(orgA, ['adjustment:approve'], {
      campuses: [lekki],
    });
    const leave = await askLeave(api, lekkiOnly, { startsOn: '2026-10-22' });

    const hidden = await queueWith(api, boss, false);
    const shown = await queueWith(api, boss, true);

    expect(hidden).toMatchObject({ items: [], total: 0, othersCount: 1 });
    expect(shown.items).toHaveLength(1);
    expect(shown.items[0]).toMatchObject({ id: leave.id, decide: 'other' });
    expect(await summary(api, boss)).toMatchObject({ waitingForMe: 0 });
    await api(boss).post(`/leave/${leave.id}/approve`).expect(403);
  });

  test('gives a leave-only approver money rows only with adjustment:read', async ({
    api,
    app,
    withPermissions,
    schools: { owner, orgA, lekki, lekkiOnly, studentLekki },
  }) => {
    await owes(app, owner, { studentId: studentLekki.id, amountMinor: OWED });
    await askAdjustment(api, lekkiOnly, {
      kind: 'write_off',
      studentId: studentLekki.id,
      amountMinor: 100_000,
      reason: 'Left the school',
    });
    const leave = await askLeave(api, lekkiOnly, { startsOn: '2026-10-22' });
    const leaveOnly = await withPermissions(orgA, ['leave:approve'], {
      campuses: [lekki],
    });
    const reader = await withPermissions(
      orgA,
      ['leave:approve', 'adjustment:read'],
      { campuses: [lekki] }
    );

    const blind = await queueWith(api, leaveOnly, true);
    const sighted = await queueWith(api, reader, true);

    expect(blind.items.map((item) => item.id)).toEqual([leave.id]);
    expect(blind.othersCount).toBe(0);
    expect(sighted.items.map((item) => item.decide)).toEqual(['other', 'yes']);
    expect(sighted.othersCount).toBe(1);
    expect(await summary(api, reader)).toMatchObject({
      waitingForMe: 1,
      byNav: { approvals: 1, payments: 0 },
    });
  });

  test('shows a bursar with neither approve permission nothing, leave included', async ({
    api,
    schools: { lekkiOnly, noPermission },
  }) => {
    await askLeave(api, noPermission, { startsOn: '2026-10-22' });

    expect(await queueWith(api, lekkiOnly, true)).toMatchObject({
      items: [],
      total: 0,
      othersCount: 0,
    });
  });

  test('drops a leave row once it is decided or withdrawn', async ({
    api,
    schools: { owner, lekkiOnly, noPermission },
  }) => {
    const decided = await askLeave(api, lekkiOnly, { startsOn: '2026-10-22' });
    const withdrawn = await askLeave(api, noPermission, {
      startsOn: '2026-10-22',
    });
    await api(owner).post(`/leave/${decided.id}/approve`).expect(200);
    await api(noPermission).post(`/leave/${withdrawn.id}/withdraw`).expect(200);

    expect((await queue(api, owner)).total).toBe(0);
  });

  test('keeps a leave request out of another school’s queue', async ({
    api,
    schools: { ownerB, lekkiOnly },
  }) => {
    await askLeave(api, lekkiOnly, { startsOn: '2026-10-22' });

    expect(await queueWith(api, ownerB, true)).toMatchObject({
      items: [],
      othersCount: 0,
    });
  });
});

const submittedStockCount = async (
  api: Parameters<typeof askVoid>[0],
  owner: Parameters<typeof askVoid>[1],
  campusId: string
) => {
  const tie = await createItem(api, owner, {
    name: 'Tie',
    variant: null,
    costPriceMinor: 100_000,
    sellPriceMinor: 150_000,
  });
  await openStock(api, owner, {
    campusId,
    lines: [{ itemId: tie.id, quantity: 3, unitCostMinor: 100_000 }],
  });
  return submitCount(api, owner, {
    campusId,
    lines: [{ itemId: tie.id, countedQuantity: 2 }],
  });
};

const waitWriteOffAndStockCount = async (
  api: Parameters<typeof askVoid>[0],
  app: Parameters<typeof owes>[0],
  lekkiSide: {
    owner: Parameters<typeof askVoid>[1];
    lekki: { id: string };
    lekkiOnly: Parameters<typeof askVoid>[1];
    studentLekki: { id: string };
  }
) => {
  const { owner, lekki, lekkiOnly, studentLekki } = lekkiSide;
  await owes(app, owner, { studentId: studentLekki.id, amountMinor: OWED });
  await askAdjustment(api, lekkiOnly, {
    kind: 'write_off',
    studentId: studentLekki.id,
    amountMinor: 100_000,
    reason: 'Left the school',
  });
  return submittedStockCount(api, owner, lekki.id);
};

const countStatus = async (
  api: Parameters<typeof askVoid>[0],
  owner: Parameters<typeof askVoid>[1],
  id: string
): Promise<string> =>
  (
    (await api(owner).get(`/store/counts/${id}`).expect(200)).body as {
      status: string;
    }
  ).status;

test.describe('someone else’s rows for a viewer without adjustment:approve', () => {
  test('keeps a store write-off from a leave approver who reads adjustments but not the store', async ({
    api,
    app,
    withPermissions,
    schools: { owner, orgA, lekki, lekkiOnly, studentLekki },
  }) => {
    const count = await waitWriteOffAndStockCount(api, app, {
      owner,
      lekki,
      lekkiOnly,
      studentLekki,
    });
    const reader = await withPermissions(
      orgA,
      ['leave:approve', 'adjustment:read'],
      { campuses: [lekki] }
    );

    const shown = await queueWith(api, reader, true);

    expect(shown.items.map((item) => [item.kind, item.decide])).toEqual([
      ['write_off', 'other'],
    ]);
    expect(shown.othersCount).toBe(1);
    await api(reader).post(`/store/counts/${count.id}/approve`).expect(403);
    expect(await countStatus(api, owner, count.id)).toBe('submitted');
  });

  test('shows the store write-off but not the write-off as someone else’s to a reader of the store alone, who still cannot decide it', async ({
    api,
    app,
    withPermissions,
    schools: { owner, orgA, lekki, lekkiOnly, studentLekki },
  }) => {
    const count = await waitWriteOffAndStockCount(api, app, {
      owner,
      lekki,
      lekkiOnly,
      studentLekki,
    });
    const reader = await withPermissions(
      orgA,
      ['leave:approve', 'store:read'],
      { campuses: [lekki] }
    );

    const hidden = await queueWith(api, reader, false);
    const shown = await queueWith(api, reader, true);

    expect(hidden).toMatchObject({ items: [], total: 0, othersCount: 1 });
    expect(shown.items).toEqual([
      expect.objectContaining({
        kind: 'store_write_off',
        id: count.id,
        decide: 'other',
      }),
    ]);
    await api(reader).post(`/store/counts/${count.id}/approve`).expect(403);
    await api(reader)
      .post(`/store/counts/${count.id}/decline`)
      .send({ reason: 'Recount the shelf first' })
      .expect(403);
    expect(await countStatus(api, owner, count.id)).toBe('submitted');
  });

  test('shows both the write-off and the store write-off as someone else’s to a reader of adjustments and the store', async ({
    api,
    app,
    withPermissions,
    schools: { owner, orgA, lekki, lekkiOnly, studentLekki },
  }) => {
    const count = await waitWriteOffAndStockCount(api, app, {
      owner,
      lekki,
      lekkiOnly,
      studentLekki,
    });
    const reader = await withPermissions(
      orgA,
      ['leave:approve', 'adjustment:read', 'store:read'],
      { campuses: [lekki] }
    );

    const shown = await queueWith(api, reader, true);

    expect(shown.items.map((item) => [item.kind, item.decide])).toEqual([
      ['write_off', 'other'],
      ['store_write_off', 'other'],
    ]);
    expect(shown.othersCount).toBe(2);
    await api(reader).post(`/store/counts/${count.id}/approve`).expect(403);
    expect(await countStatus(api, owner, count.id)).toBe('submitted');
  });

  test('gives a reader of adjustments and the store with neither approve permission an empty queue', async ({
    api,
    app,
    withPermissions,
    schools: { owner, orgA, lekki, lekkiOnly, studentLekki },
  }) => {
    await waitWriteOffAndStockCount(api, app, {
      owner,
      lekki,
      lekkiOnly,
      studentLekki,
    });
    const reader = await withPermissions(
      orgA,
      ['adjustment:read', 'store:read'],
      { campuses: [lekki] }
    );

    expect(await queueWith(api, reader, true)).toMatchObject({
      items: [],
      total: 0,
      othersCount: 0,
    });
  });

  test('never shows another campus’s store write-off or write-off to a reader on one campus', async ({
    api,
    app,
    withPermissions,
    schools: { owner, orgA, lekki, ikeja, lekkiOnly, studentLekki },
  }) => {
    await waitWriteOffAndStockCount(api, app, {
      owner,
      lekki,
      lekkiOnly,
      studentLekki,
    });
    const reader = await withPermissions(
      orgA,
      ['leave:approve', 'adjustment:read', 'store:read'],
      { campuses: [ikeja] }
    );

    expect(await queueWith(api, reader, true)).toMatchObject({
      items: [],
      total: 0,
      othersCount: 0,
    });
  });
});

const queueFor = async (
  api: Parameters<typeof askVoid>[0],
  actor: Parameters<typeof askVoid>[1],
  campusId: string
): Promise<ApprovalList> =>
  (await api(actor).get(`/approvals?campusId=${campusId}`).expect(200))
    .body as ApprovalList;

test.describe('the campus picker', () => {
  test('narrows an owner’s queue to the picked campus, and the summary stays school-wide', async ({
    api,
    app,
    withPermissions,
    schools: {
      owner,
      orgA,
      lekki,
      ikeja,
      lekkiOnly,
      studentLekki,
      studentIkeja,
    },
  }) => {
    await owes(app, owner, { studentId: studentLekki.id, amountMinor: OWED });
    await owes(app, owner, { studentId: studentIkeja.id, amountMinor: OWED });
    const ikejaAsker = await withPermissions(
      orgA,
      ['adjustment:create', 'adjustment:read'],
      { campuses: [ikeja] }
    );
    const atLekki = await askAdjustment(api, lekkiOnly, {
      kind: 'credit_note',
      studentId: studentLekki.id,
      amountMinor: 100_000,
      reason: 'Lekki one',
    });
    const atIkeja = await askAdjustment(api, ikejaAsker, {
      kind: 'credit_note',
      studentId: studentIkeja.id,
      amountMinor: 100_000,
      reason: 'Ikeja one',
    });

    const both = await queue(api, owner);
    const onLekki = await queueFor(api, owner, lekki.id);
    const onIkeja = await queueFor(api, owner, ikeja.id);

    expect(both.items.map((item) => item.id)).toEqual(
      expect.arrayContaining([atLekki.adjustment.id, atIkeja.adjustment.id])
    );
    expect(both.total).toBe(2);
    expect(onLekki.items.map((item) => item.id)).toEqual([
      atLekki.adjustment.id,
    ]);
    expect(onLekki).toMatchObject({ total: 1, othersCount: 0 });
    expect(onIkeja.items.map((item) => item.id)).toEqual([
      atIkeja.adjustment.id,
    ]);
    expect(await summary(api, owner)).toMatchObject({
      waitingForMe: 2,
      byNav: { approvals: 2, payments: 2, store: 0, wallets: 0 },
    });
  });

  test('shows a payment void allocated to students on both campuses under either campus', async ({
    api,
    app,
    schools: { owner, lekki, ikeja, studentLekki, studentIkeja },
  }) => {
    const account = await bankAccount(app, owner);
    const receipt = await recordCash(api, owner, {
      accountId: account.id,
      allocations: [
        { studentId: studentLekki.id, amountMinor: 100_000 },
        { studentId: studentIkeja.id, amountMinor: 100_000 },
      ],
    });
    const { void: asked } = await askVoid(api, owner, receipt.id);

    for (const campus of [lekki, ikeja]) {
      const list = await queueFor(api, owner, campus.id);
      expect(list.items.map((item) => item.id)).toEqual([asked.id]);
    }
  });

  test('lists leave under the requester’s campus only, and not a requester on no campus', async ({
    api,
    clock,
    addMember,
    createUser,
    schools: { owner, orgA, lekki, ikeja, lekkiOnly },
  }) => {
    clock.set('2026-10-12');
    const drifter = await addMember(orgA, await createUser(), {
      roles: ['teacher'],
      campuses: [],
    });
    const atLekki = await askLeave(api, lekkiOnly, { startsOn: '2026-10-22' });
    const noCampus = await askLeave(api, drifter, { startsOn: '2026-10-23' });

    const all = await queue(api, owner);
    const onLekki = await queueFor(api, owner, lekki.id);
    const onIkeja = await queueFor(api, owner, ikeja.id);

    expect(all.total).toBe(2);
    expect(all.items.map((item) => item.id)).toEqual(
      expect.arrayContaining([atLekki.id, noCampus.id])
    );
    expect(onLekki.items.map((item) => item.id)).toEqual([atLekki.id]);
    expect(onIkeja.items).toEqual([]);
  });

  test('answers 404 for a campus outside the viewer’s scope or another school’s', async ({
    api,
    withPermissions,
    schools: { owner, orgA, lekki, ikeja, campusB },
  }) => {
    const ikejaApprover = await withPermissions(
      orgA,
      ['adjustment:read', 'adjustment:approve'],
      { campuses: [ikeja] }
    );

    await api(ikejaApprover).get(`/approvals?campusId=${lekki.id}`).expect(404);
    await api(owner).get(`/approvals?campusId=${campusB.id}`).expect(404);
    expect(await queueFor(api, ikejaApprover, ikeja.id)).toMatchObject({
      items: [],
      total: 0,
    });
  });
});

test.describe('wallet requests in the queue', () => {
  test('wait for the wallet approver on every campus the family has a child on, count on Wallets and leave the payment approvers alone', async ({
    api,
    app,
    pool,
    withPermissions,
    schools: { owner, orgA, studentLekki, studentIkeja, lekkiOnly },
  }) => {
    const guardian = (student: typeof studentLekki) =>
      student.logins.find((login) => login.who === 'guardian')?.guardianId ??
      '';
    const lekkiWallet = await walletIdOf(pool, guardian(studentLekki));
    const ikejaWallet = await walletIdOf(pool, guardian(studentIkeja));
    const cash = await cashAccount(app, owner);
    const bank = await bankAccount(app, owner);
    const topUp = await topUpWallet(api, owner, {
      walletId: lekkiWallet,
      accountId: cash.id,
    });
    await topUpWallet(api, owner, {
      walletId: ikejaWallet,
      accountId: cash.id,
    });
    const wallets = await withPermissions(orgA, [
      'wallet:read',
      'wallet:approveRefund',
      'campus:readAll',
    ]);
    const paymentApprover = await withPermissions(orgA, [
      'adjustment:read',
      'adjustment:approve',
      'campus:readAll',
    ]);
    await requestCancellation(api, owner, {
      walletId: lekkiWallet,
      topUpId: topUp.id,
    });
    const refund = await requestRefund(api, owner, {
      walletId: ikejaWallet,
      accountId: bank.id,
      amountMinor: 1_000_000,
    });

    const asWallets = await queue(api, wallets);
    expect(
      asWallets.items.map((item) => [item.kind, item.label, item.decide])
    ).toEqual([
      ['wallet_topup_cancellation', 'Cancel a top-up', 'yes'],
      ['wallet_refund', 'Wallet refund', 'yes'],
    ]);
    expect(asWallets.items[1]).toMatchObject({
      id: refund.request.id,
      amountMinor: 1_000_000,
      details: expect.stringContaining('Refund to') as string,
      campusId: expect.any(String) as string,
    });
    expect((await summary(api, wallets)).byNav).toEqual({
      approvals: 2,
      payments: 0,
      store: 0,
      wallets: 2,
    });
    expect((await queue(api, paymentApprover)).total).toBe(0);
    expect((await summary(api, paymentApprover)).waitingForMe).toBe(0);
    const onLekki = (await queue(api, lekkiOnly)).items;
    expect(onLekki).toEqual([]);

    await approveRefundRequest(api, wallets, { id: refund.request.id });
    expect((await queue(api, wallets)).total).toBe(1);
    expect((await summary(api, wallets)).byNav.wallets).toBe(1);
  });

  test('show the others’ requests to a reader of wallets who cannot decide them, and their own as theirs', async ({
    api,
    app,
    pool,
    withPermissions,
    schools: { owner, orgA, studentLekki },
  }) => {
    const walletId = await walletIdOf(
      pool,
      studentLekki.logins.find((login) => login.who === 'guardian')
        ?.guardianId ?? ''
    );
    const cash = await cashAccount(app, owner);
    const topUp = await topUpWallet(api, owner, {
      walletId,
      accountId: cash.id,
    });
    const reader = await withPermissions(orgA, [
      'wallet:read',
      'leave:approve',
      'campus:readAll',
    ]);
    const approver = await withPermissions(orgA, [
      'wallet:read',
      'wallet:requestRefund',
      'wallet:approveRefund',
      'campus:readAll',
    ]);
    await requestCancellation(api, approver, { walletId, topUpId: topUp.id });

    const others = await api(reader)
      .get('/approvals?includeOthers=true')
      .expect(200);
    expect(
      (others.body as ApprovalList).items.map((item) => [
        item.kind,
        item.decide,
      ])
    ).toEqual([['wallet_topup_cancellation', 'other']]);
    expect((await queue(api, reader)).total).toBe(0);
    const own = await queue(api, approver);
    expect(own.items.map((item) => [item.kind, item.decide])).toEqual([
      ['wallet_topup_cancellation', 'own'],
    ]);
    expect(own.othersCount).toBe(0);

    await approveCancellationRequest(api, owner, own.items[0]?.id ?? '');
    expect((await queue(api, approver)).total).toBe(0);
    expect((await queue(api, reader)).total).toBe(0);
  });
});
