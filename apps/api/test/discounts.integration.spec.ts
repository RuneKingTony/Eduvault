import {
  DISCOUNT_END_AFTER_UNTIL_MESSAGE,
  DISCOUNT_END_PAST_MESSAGE,
  DISCOUNT_FEE_TYPE_MESSAGE,
  DISCOUNT_NOT_APPROVED_MESSAGE,
  DISCOUNT_PAST_TERM_MESSAGE,
  DISCOUNT_PERCENT_MESSAGE,
  DISCOUNT_UNTIL_MESSAGE,
  SELF_APPROVAL_MESSAGE,
  type StudentDiscount,
  type StudentDiscountList,
} from '@eduvault/api-contract';
import { expect } from './support/base-test';
import {
  approveDiscount,
  askDiscount,
  switchApproval,
} from './support/factories/approvals';
import {
  TUITION_MINOR,
  chargeFixture,
  prepare,
  runOf,
} from './support/factories/billing';
import { ledgerAccountId } from './support/factories/finance';
import { makeCurrent } from './support/factories/terms';
import { schoolsTest as test } from './support/two-schools';

const SECOND_TERM_TOTAL = TUITION_MINOR + 4_000_000;
const ID = '0b0c8a8e-8a3e-4c6c-a8c4-0e2f0f6b1f11';

const discountOf = async (
  api: Parameters<typeof askDiscount>[0],
  actor: Parameters<typeof askDiscount>[1],
  id: string
): Promise<StudentDiscount | undefined> => {
  const list = (await api(actor).get('/finance/discounts').expect(200))
    .body as StudentDiscountList;
  return list.items.find((item) => item.id === id);
};

test.describe('asking for a discount', () => {
  test('saves a waiting discount with its terms and fee type, and changes no charge', async ({
    api,
    app,
    pool,
    schools: { owner, orgA, lekkiOnly, studentLekki },
  }) => {
    const fixture = await chargeFixture(app, api, owner);
    const tuition = await ledgerAccountId(pool, orgA.id, 4010);

    const { discount, autoApproved } = await askDiscount(api, lekkiOnly, {
      studentId: studentLekki.id,
      kind: 'percent',
      value: 50,
      ledgerAccountId: tuition,
      fromTermId: fixture.secondTermId,
      toTermId: fixture.thirdTermId,
      reason: 'Academic scholarship, top of JSS 1',
    });

    expect(autoApproved).toBe(false);
    expect(discount).toMatchObject({
      status: 'submitted',
      kind: 'percent',
      value: 50,
      feeType: { id: tuition, name: 'Tuition' },
      fromTerm: { id: fixture.secondTermId },
      toTerm: { id: fixture.thirdTermId },
      endedAt: null,
      approvedBy: null,
    });
    const { runId } = await prepare(api, owner, {
      termId: fixture.secondTermId,
      scope: 'school',
    });
    const run = await runOf(api, owner, runId ?? '');
    expect(
      run.charges.every((charge) => charge.totalMinor === SECOND_TERM_TOTAL)
    ).toBe(true);
    const list = (await api(lekkiOnly).get('/finance/discounts').expect(200))
      .body as StudentDiscountList;
    expect(list.waitingCount).toBe(1);
  });

  test('answers 400 for a percentage above 100, a past From, an Until before From and a fee type outside fee income', async ({
    api,
    app,
    pool,
    schools: { owner, orgA, lekkiOnly, studentLekki },
  }) => {
    const fixture = await chargeFixture(app, api, owner);
    await makeCurrent(api, owner, { year: '2026/2027', sequence: 2 });
    const tuition = await ledgerAccountId(pool, orgA.id, 4010);
    const receivable = await ledgerAccountId(pool, orgA.id, 1100);
    const base = {
      studentId: studentLekki.id,
      kind: 'percent',
      value: 10,
      ledgerAccountId: tuition,
      fromTermId: fixture.secondTermId,
      reason: 'Staff child',
    };
    const refused = async (change: Record<string, unknown>) =>
      (
        await api(lekkiOnly)
          .post('/finance/discounts')
          .send({ ...base, ...change })
          .expect(400)
      ).body as { message: string; issues?: { message: string }[] };

    const percent = await refused({ value: 120 });
    expect(JSON.stringify(percent)).toContain(DISCOUNT_PERCENT_MESSAGE);
    expect((await refused({ fromTermId: fixture.firstTermId })).message).toBe(
      DISCOUNT_PAST_TERM_MESSAGE
    );
    expect(
      (
        await refused({
          fromTermId: fixture.thirdTermId,
          toTermId: fixture.secondTermId,
        })
      ).message
    ).toBe(DISCOUNT_UNTIL_MESSAGE);
    expect((await refused({ ledgerAccountId: receivable })).message).toBe(
      DISCOUNT_FEE_TYPE_MESSAGE
    );
    await api(lekkiOnly)
      .post('/finance/discounts')
      .send({ ...base, ledgerAccountId: ID })
      .expect(404);
    await refused({ value: 0 });
  });

  test('takes a fixed amount on the whole charge starting in the current term', async ({
    api,
    app,
    schools: { owner, lekkiOnly, studentLekki },
  }) => {
    const fixture = await chargeFixture(app, api, owner);

    const { discount } = await askDiscount(api, lekkiOnly, {
      studentId: studentLekki.id,
      kind: 'fixed',
      value: 30_000_000,
      ledgerAccountId: null,
      fromTermId: fixture.firstTermId,
      reason: 'Bursary',
    });

    expect(discount).toMatchObject({
      kind: 'fixed',
      value: 30_000_000,
      feeType: null,
    });
  });

  test('approving names the approver, declining keeps the reason, and neither changes sent charges', async ({
    api,
    app,
    schools: { owner, lekkiOnly, studentLekki },
  }) => {
    const fixture = await chargeFixture(app, api, owner);
    const ask = () =>
      askDiscount(api, lekkiOnly, {
        studentId: studentLekki.id,
        kind: 'percent',
        value: 10,
        ledgerAccountId: null,
        fromTermId: fixture.secondTermId,
        reason: 'Staff child',
      });
    const first = await ask();
    const second = await ask();

    const approved = await approveDiscount(api, owner, first.discount.id);
    const declined = await api(owner)
      .post(`/finance/discounts/${second.discount.id}/decline`)
      .send({ reason: 'Not agreed with the owner' })
      .expect(200);

    expect(approved.status).toBe('approved');
    expect(approved.approvedBy).not.toBeNull();
    expect(declined.body).toMatchObject({
      status: 'rejected',
      rejectionReason: 'Not agreed with the owner',
    });
    await api(owner)
      .post(`/finance/discounts/${first.discount.id}/approve`)
      .expect(409);
    const blank = await api(owner)
      .post(`/finance/discounts/${first.discount.id}/decline`)
      .send({ reason: ' ' })
      .expect(400);
    expect(blank.body.code).toBe('ValidationError');
  });

  test('nobody approves or declines their own discount, in the service or the database', async ({
    api,
    app,
    pool,
    withPermissions,
    schools: { owner, orgA, lekki, studentLekki },
  }) => {
    const fixture = await chargeFixture(app, api, owner);
    const chika = await withPermissions(
      orgA,
      ['adjustment:create', 'adjustment:read', 'adjustment:approve'],
      { campuses: [lekki] }
    );
    const { discount } = await askDiscount(api, chika, {
      studentId: studentLekki.id,
      kind: 'percent',
      value: 10,
      ledgerAccountId: null,
      fromTermId: fixture.secondTermId,
      reason: 'Staff child',
    });

    const approve = await api(chika)
      .post(`/finance/discounts/${discount.id}/approve`)
      .expect(409);
    const decline = await api(chika)
      .post(`/finance/discounts/${discount.id}/decline`)
      .send({ reason: 'No' })
      .expect(409);

    expect(approve.body).toMatchObject({
      code: 'SelfApproval',
      message: SELF_APPROVAL_MESSAGE,
    });
    expect(decline.body.code).toBe('SelfApproval');
    await expect(
      pool.query(
        `UPDATE student_discount SET status = 'approved', approved_by = created_by, approved_at = now() WHERE id = $1`,
        [discount.id]
      )
    ).rejects.toMatchObject({
      code: '23514',
      constraint: 'student_discount_approved_not_self',
    });
    await expect(
      pool.query(
        `UPDATE student_discount SET status = 'rejected', rejected_by = created_by,
           rejected_at = now(), rejection_reason = 'No' WHERE id = $1`,
        [discount.id]
      )
    ).rejects.toMatchObject({
      code: '23514',
      constraint: 'student_discount_rejected_not_self',
    });
  });

  test('switched off, a discount is approved on creation with no approver', async ({
    api,
    app,
    schools: { owner, lekkiOnly, studentLekki },
  }) => {
    const fixture = await chargeFixture(app, api, owner);
    await switchApproval(api, owner, { discount: false });

    const { discount, autoApproved } = await askDiscount(api, lekkiOnly, {
      studentId: studentLekki.id,
      kind: 'percent',
      value: 10,
      ledgerAccountId: null,
      fromTermId: fixture.secondTermId,
      reason: 'Staff child',
    });

    expect(autoApproved).toBe(true);
    expect(discount).toMatchObject({ status: 'approved', approvedBy: null });
  });
});

test.describe('the terms a discount can start in', () => {
  test('are readable by a bursar without session:read, in order, with the current one marked', async ({
    api,
    app,
    schools: { owner, ownerB, noPermission, lekkiOnly },
  }) => {
    const fixture = await chargeFixture(app, api, owner);
    await makeCurrent(api, owner, { year: '2026/2027', sequence: 2 });

    const res = await api(lekkiOnly)
      .get('/finance/discounts/terms')
      .expect(200);

    expect(res.body.map((term: { id: string }) => term.id)).toEqual([
      fixture.firstTermId,
      fixture.secondTermId,
      fixture.thirdTermId,
    ]);
    expect(
      res.body.find((term: { isCurrent: boolean }) => term.isCurrent)
    ).toMatchObject({ id: fixture.secondTermId });
    expect(res.body[0]).toMatchObject({
      label: expect.stringContaining('2026/2027'),
      startsOn: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    });
    const other = await api(ownerB).get('/finance/discounts/terms').expect(200);
    const mine = new Set(res.body.map((term: { id: string }) => term.id));
    expect(other.body.some((term: { id: string }) => mine.has(term.id))).toBe(
      false
    );
    await api(noPermission).get('/finance/discounts/terms').expect(403);
    await api().get('/finance/discounts/terms').expect(401);
  });
});

test.describe('ending a discount', () => {
  test('stops later charges only: the term it ends in keeps its discount, the next one has none', async ({
    api,
    app,
    pool,
    schools: { owner, orgA, lekkiOnly, studentLekki },
  }) => {
    const fixture = await chargeFixture(app, api, owner);
    const tuition = await ledgerAccountId(pool, orgA.id, 4010);
    const { discount } = await askDiscount(api, lekkiOnly, {
      studentId: studentLekki.id,
      kind: 'percent',
      value: 5,
      ledgerAccountId: tuition,
      fromTermId: fixture.firstTermId,
      reason: 'Sibling discount (3 children)',
    });
    await approveDiscount(api, owner, discount.id);
    const first = await prepare(api, owner, {
      termId: fixture.firstTermId,
      scope: 'school',
    });
    const firstRun = await runOf(api, owner, first.runId ?? '');
    const before = firstRun.charges.find(
      (charge) => charge.studentId === studentLekki.id
    );
    expect(before?.totalMinor).toBe(TUITION_MINOR - 900_000);

    const ended = await api(lekkiOnly)
      .post(`/finance/discounts/${discount.id}/end`)
      .send({ lastTermId: fixture.firstTermId })
      .expect(200);

    expect(ended.body).toMatchObject({
      status: 'approved',
      toTerm: { id: fixture.firstTermId },
      endedAt: expect.any(String),
    });
    const second = await prepare(api, owner, {
      termId: fixture.secondTermId,
      scope: 'school',
    });
    const secondRun = await runOf(api, owner, second.runId ?? '');
    expect(
      secondRun.charges.find((charge) => charge.studentId === studentLekki.id)
        ?.totalMinor
    ).toBe(SECOND_TERM_TOTAL);
    const unchanged = await runOf(api, owner, first.runId ?? '');
    expect(
      unchanged.charges.find((charge) => charge.studentId === studentLekki.id)
        ?.totalMinor
    ).toBe(TUITION_MINOR - 900_000);
  });

  test('answers 409 unless the discount is approved', async ({
    api,
    app,
    schools: { owner, lekkiOnly, studentLekki },
  }) => {
    const fixture = await chargeFixture(app, api, owner);
    const { discount } = await askDiscount(api, lekkiOnly, {
      studentId: studentLekki.id,
      kind: 'percent',
      value: 10,
      ledgerAccountId: null,
      fromTermId: fixture.firstTermId,
      reason: 'Staff child',
    });

    const res = await api(lekkiOnly)
      .post(`/finance/discounts/${discount.id}/end`)
      .send({ lastTermId: fixture.firstTermId })
      .expect(409);

    expect(res.body.message).toBe(DISCOUNT_NOT_APPROVED_MESSAGE);
  });

  test('answers 400 for a last term before the current term or after the existing Until', async ({
    api,
    app,
    schools: { owner, lekkiOnly, studentLekki },
  }) => {
    const fixture = await chargeFixture(app, api, owner);
    const { discount } = await askDiscount(api, lekkiOnly, {
      studentId: studentLekki.id,
      kind: 'percent',
      value: 10,
      ledgerAccountId: null,
      fromTermId: fixture.firstTermId,
      toTermId: fixture.secondTermId,
      reason: 'Staff child',
    });
    await approveDiscount(api, owner, discount.id);
    const end = (lastTermId: string) =>
      api(lekkiOnly)
        .post(`/finance/discounts/${discount.id}/end`)
        .send({ lastTermId });

    const after = await end(fixture.thirdTermId).expect(400);
    expect(after.body.message).toBe(DISCOUNT_END_AFTER_UNTIL_MESSAGE);
    await makeCurrent(api, owner, { year: '2026/2027', sequence: 2 });
    const past = await end(fixture.firstTermId).expect(400);
    expect(past.body.message).toBe(DISCOUNT_END_PAST_MESSAGE);
    await end(fixture.secondTermId).expect(200);
  });

  test('is open only to a member who can create, and the list needs adjustment:read', async ({
    api,
    app,
    schools: { owner, noPermission, lekkiOnly, studentLekki },
  }) => {
    const fixture = await chargeFixture(app, api, owner);
    const { discount } = await askDiscount(api, lekkiOnly, {
      studentId: studentLekki.id,
      kind: 'percent',
      value: 10,
      ledgerAccountId: null,
      fromTermId: fixture.firstTermId,
      reason: 'Staff child',
    });
    await approveDiscount(api, owner, discount.id);

    await api(noPermission)
      .post(`/finance/discounts/${discount.id}/end`)
      .send({ lastTermId: fixture.firstTermId })
      .expect(403);
    await api(noPermission).get('/finance/discounts').expect(403);
    await api().get('/finance/discounts').expect(401);
    expect(await discountOf(api, lekkiOnly, discount.id)).toMatchObject({
      status: 'approved',
    });
  });
});

test.describe('isolation of student_discount routes', () => {
  test('another school’s ids answer 404 on every route and its students are refused', async ({
    api,
    app,
    schools: { owner, ownerB, lekkiOnly, studentLekki },
  }) => {
    const fixture = await chargeFixture(app, api, owner);
    const { discount } = await askDiscount(api, lekkiOnly, {
      studentId: studentLekki.id,
      kind: 'percent',
      value: 10,
      ledgerAccountId: null,
      fromTermId: fixture.firstTermId,
      reason: 'Staff child',
    });
    const path = `/finance/discounts/${discount.id}`;

    await api(ownerB).post(`${path}/approve`).expect(404);
    await api(ownerB).post(`${path}/decline`).send({ reason: 'x' }).expect(404);
    await api(ownerB)
      .post(`${path}/end`)
      .send({ lastTermId: fixture.firstTermId })
      .expect(404);
    await api(ownerB)
      .post('/finance/discounts')
      .send({
        studentId: studentLekki.id,
        kind: 'percent',
        value: 10,
        ledgerAccountId: null,
        fromTermId: fixture.firstTermId,
        reason: 'x',
      })
      .expect(404);
    const list = await api(ownerB).get('/finance/discounts').expect(200);
    expect(list.body).toMatchObject({ items: [], total: 0, waitingCount: 0 });
  });

  test('a campus-scoped member cannot ask for, read or decide another campus’s student', async ({
    api,
    app,
    withPermissions,
    schools: { owner, orgA, ikeja, lekkiOnly, studentLekki, studentIkeja },
  }) => {
    const fixture = await chargeFixture(app, api, owner);
    const ikejaApprover = await withPermissions(
      orgA,
      ['adjustment:read', 'adjustment:approve'],
      { campuses: [ikeja] }
    );
    const { discount } = await askDiscount(api, lekkiOnly, {
      studentId: studentLekki.id,
      kind: 'percent',
      value: 10,
      ledgerAccountId: null,
      fromTermId: fixture.firstTermId,
      reason: 'Staff child',
    });

    await api(lekkiOnly)
      .post('/finance/discounts')
      .send({
        studentId: studentIkeja.id,
        kind: 'percent',
        value: 10,
        ledgerAccountId: null,
        fromTermId: fixture.firstTermId,
        reason: 'x',
      })
      .expect(404);
    await api(ikejaApprover)
      .post(`/finance/discounts/${discount.id}/approve`)
      .expect(404);
    const list = await api(ikejaApprover).get('/finance/discounts').expect(200);
    expect(list.body.items).toEqual([]);
  });
});
