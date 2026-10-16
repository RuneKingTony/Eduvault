import {
  INVOICE_NOT_FOUND_MESSAGE,
  INVOICE_STUDENT_NOT_FOUND_MESSAGE,
  type InvoiceList,
  type JournalList,
} from '@eduvault/api-contract';
import { expect } from './support/base-test';
import {
  BUS_MINOR,
  TUITION_MINOR,
  addDiscount,
  chargeFixture,
  firstIdIn,
  invoiceOf,
  invoicesOf,
  issueStoreChargeBetween,
  prepare,
  runOf,
  sendRun,
} from './support/factories/billing';
import {
  createMoneyAccount,
  importOpening,
  ledgerAccountId,
  postEntry,
} from './support/factories/finance';
import { schoolsTest as test } from './support/two-schools';

const SECOND_TERM_TOTAL = TUITION_MINOR + BUS_MINOR;

test.describe('charges list', () => {
  test('lists prepared and sent charges with kind and status filters, counts and a summary', async ({
    api,
    app,
    schools: { owner, studentLekki },
  }) => {
    const fixture = await chargeFixture(app, api, owner);
    const sentRun = await prepare(api, owner, {
      termId: fixture.firstTermId,
      scope: 'school',
    });
    await sendRun(api, owner, sentRun.runId ?? '');
    await prepare(api, owner, {
      termId: fixture.secondTermId,
      scope: 'school',
    });

    const all = await invoicesOf(api, owner);

    expect(all.total).toBe(4);
    expect(all.counts).toEqual({ term: 4, adhoc: 0, store: 0 });
    expect(all.summary).toEqual({
      sentCount: 2,
      sentTotalMinor: 2 * TUITION_MINOR,
      draftCount: 2,
    });
    expect(all.items.every((item) => item.kind === 'term')).toBe(true);
    const drafts = await invoicesOf(api, owner, '?status=draft');
    expect(drafts.items).toHaveLength(2);
    expect(drafts.items.every((item) => item.number === null)).toBe(true);
    expect(drafts.items[0]).toMatchObject({
      forText: 'Second term, 2026/2027',
      feeCount: 2,
      totalMinor: SECOND_TERM_TOTAL,
    });
    const sent = await invoicesOf(api, owner, '?status=issued&kind=term');
    expect(sent.items).toHaveLength(2);
    expect((await invoicesOf(api, owner, '?kind=store')).items).toEqual([]);
    expect(
      (await invoicesOf(api, owner, `?studentId=${studentLekki.id}`)).total
    ).toBe(2);
    expect(
      (await invoicesOf(api, owner, `?termId=${fixture.secondTermId}`)).total
    ).toBe(2);
  });

  test('lists newest first and searches by student, number and admission number', async ({
    api,
    app,
    schools: { owner, studentLekki },
  }) => {
    const fixture = await chargeFixture(app, api, owner);
    const { runId } = await prepare(api, owner, {
      termId: fixture.firstTermId,
      scope: 'school',
    });
    const sent = await sendRun(api, owner, runId ?? '');
    const number = sent.charges[0]?.number ?? '';

    expect(
      (await invoicesOf(api, owner, `?q=${number.toLowerCase()}`)).total
    ).toBe(1);
    expect(
      (await invoicesOf(api, owner, `?q=${studentLekki.lastName}`)).total
    ).toBe(2);
    expect(
      (
        await invoicesOf(
          api,
          owner,
          `?q=${encodeURIComponent(studentLekki.admissionNumber)}`
        )
      ).items.map((item) => item.studentId)
    ).toEqual([studentLekki.id]);
    expect((await invoicesOf(api, owner, '?q=nobody-here')).total).toBe(0);
    const numbers = (await invoicesOf(api, owner)).items.map(
      (item) => item.number ?? ''
    );
    expect(numbers).toEqual(
      numbers.toSorted((a, b) => a.localeCompare(b)).toReversed()
    );
  });

  test('pages ten at a time', async ({ api, app, schools: { owner } }) => {
    const fixture = await chargeFixture(app, api, owner);
    await prepare(api, owner, { termId: fixture.firstTermId, scope: 'school' });
    const page = (
      await api(owner).get('/invoices?pageSize=1&page=2').expect(200)
    ).body as InvoiceList;
    expect(page.items).toHaveLength(1);
    expect(page.total).toBe(2);
  });

  test('refuses an unknown filter value', async ({
    api,
    schools: { owner },
  }) => {
    await api(owner).get('/invoices?kind=refund').expect(400);
    await api(owner).get('/invoices?status=sent').expect(400);
  });
});

test.describe('charge detail', () => {
  test('shows the lines, the round, who is charged and the journal card of a sent charge', async ({
    api,
    app,
    schools: { owner, studentLekki },
  }) => {
    const fixture = await chargeFixture(app, api, owner);
    const { runId, number } = await prepare(api, owner, {
      termId: fixture.secondTermId,
      scope: 'school',
    });
    const sent = await sendRun(api, owner, runId ?? '');
    const row = sent.charges.find((c) => c.studentId === studentLekki.id);

    const invoice = await invoiceOf(api, owner, row?.id ?? '');

    expect(invoice).toMatchObject({
      number: row?.number,
      kind: 'term',
      status: 'issued',
      termName: 'Second term, 2026/2027',
      campusName: 'Lekki',
      totalMinor: SECOND_TERM_TOTAL,
      billingRun: { id: runId, number },
      chargedTo: { relationship: 'mother' },
    });
    expect(invoice.lines.map((line) => line.amountMinor)).toEqual([
      TUITION_MINOR,
      BUS_MINOR,
    ]);
    expect(invoice.issuedBy).not.toBeNull();
    expect(invoice.journal).toMatchObject({
      reference: row?.number,
      balanced: true,
    });
    expect(
      invoice.journal?.lines.map((line) => [
        line.accountCode,
        line.debitMinor,
        line.creditMinor,
        line.campusName,
      ])
    ).toEqual([
      [1100, TUITION_MINOR, 0, 'Lekki'],
      [1100, BUS_MINOR, 0, 'Lekki'],
      [4010, 0, TUITION_MINOR, 'Lekki'],
      [4030, 0, BUS_MINOR, 'Lekki'],
    ]);
    expect(invoice.dueAtIssueMinor).toBe(SECOND_TERM_TOTAL);
    expect(invoice.balanceTodayMinor).toBe(SECOND_TERM_TOTAL);
    expect(invoice.broughtForwardMinor).toBe(0);
  });

  test('shows a prepared charge with no number, no journal and the balance today as brought forward', async ({
    api,
    app,
    schools: { owner, studentLekki },
  }) => {
    const fixture = await chargeFixture(app, api, owner);
    await importOpening(app, owner, {
      items: [
        {
          studentId: studentLekki.id,
          amountMinor: 1_200_000,
          direction: 'debt',
          effectiveOn: '2026-09-01',
        },
      ],
    });
    const { runId } = await prepare(api, owner, {
      termId: fixture.secondTermId,
      scope: 'school',
    });
    const draft = (await runOf(api, owner, runId ?? '')).charges.find(
      (charge) => charge.studentId === studentLekki.id
    );

    const invoice = await invoiceOf(api, owner, draft?.id ?? '');

    expect(invoice).toMatchObject({
      number: null,
      status: 'draft',
      issuedAt: null,
      issuedBy: null,
      journal: null,
      broughtForwardMinor: 1_200_000,
      dueAtIssueMinor: 1_200_000 + SECOND_TERM_TOTAL,
      balanceTodayMinor: 1_200_000,
    });
  });

  test('works out brought forward from what was posted before the charge, not after', async ({
    api,
    app,
    pool,
    schools: { owner, orgA, lekki, studentLekki },
  }) => {
    const fixture = await chargeFixture(app, api, owner);
    await importOpening(app, owner, {
      items: [
        {
          studentId: studentLekki.id,
          amountMinor: 1_200_000,
          direction: 'debt',
          effectiveOn: '2026-09-01',
        },
      ],
    });
    const { runId } = await prepare(api, owner, {
      termId: fixture.secondTermId,
      scope: 'school',
    });
    const sent = await sendRun(api, owner, runId ?? '');
    const bank = await createMoneyAccount(app, owner, { name: 'GTBank' });
    await postEntry(app, {
      organizationId: orgA.id,
      reference: 'RCT-TEST-1',
      kind: 'payment',
      effectiveOn: '2026-10-20',
      postedBy: null,
      lines: [
        {
          ledgerAccountId: bank.ledgerAccountId,
          campusId: lekki.id,
          debitMinor: TUITION_MINOR,
          creditMinor: 0,
        },
        {
          ledgerAccountId: await ledgerAccountId(pool, orgA.id, 1100),
          studentId: studentLekki.id,
          campusId: lekki.id,
          debitMinor: 0,
          creditMinor: TUITION_MINOR,
        },
      ],
    });
    const row = sent.charges.find((c) => c.studentId === studentLekki.id);

    const invoice = await invoiceOf(api, owner, row?.id ?? '');

    expect(invoice.broughtForwardMinor).toBe(1_200_000);
    expect(invoice.dueAtIssueMinor).toBe(1_200_000 + SECOND_TERM_TOTAL);
    expect(invoice.balanceTodayMinor).toBe(
      1_200_000 + SECOND_TERM_TOTAL - TUITION_MINOR
    );
  });

  test('links the journal entry of a sent charge back to the charge', async ({
    api,
    app,
    schools: { owner },
  }) => {
    const fixture = await chargeFixture(app, api, owner);
    const { runId } = await prepare(api, owner, {
      termId: fixture.secondTermId,
      scope: 'school',
    });
    const sent = await sendRun(api, owner, runId ?? '');

    const journal = (
      await api(owner).get('/finance/journal?kind=invoice').expect(200)
    ).body as JournalList;

    expect(
      journal.items
        .map((entry) => entry.link)
        .toSorted((a, b) => (a?.id ?? '').localeCompare(b?.id ?? ''))
    ).toEqual(
      sent.charges
        .map((charge) => ({ type: 'invoice', id: charge.id }))
        .toSorted((a, b) => a.id.localeCompare(b.id))
    );
  });

  test('counts an entry posted earlier in the same transaction as brought forward, and a later one not', async ({
    api,
    app,
    pool,
    schools: { owner, orgA, lekki, studentLekki },
  }) => {
    const fixture = await chargeFixture(app, api, owner);
    const bank = await createMoneyAccount(app, owner, { name: 'GTBank' });
    const receivable = await ledgerAccountId(pool, orgA.id, 1100);
    const tuition = await ledgerAccountId(pool, orgA.id, 4010);
    const entry = (
      reference: string,
      kind: 'payment' | 'invoice',
      lines: [account: string, debit: number, credit: number][]
    ) => ({
      organizationId: orgA.id,
      reference,
      kind,
      effectiveOn: '2026-10-20',
      postedBy: null,
      lines: lines.map(([account, debitMinor, creditMinor]) => ({
        ledgerAccountId: account,
        campusId: lekki.id,
        studentId: account === receivable ? studentLekki.id : null,
        debitMinor,
        creditMinor,
      })),
    });

    const id = await issueStoreChargeBetween(app, {
      organizationId: orgA.id,
      studentId: studentLekki.id,
      termId: fixture.firstTermId,
      campusId: lekki.id,
      number: 'CHG-SAME-TX',
      lineAccountId: tuition,
      lineMinor: 700_000,
      before: entry('RCT-BEFORE', 'payment', [
        [bank.ledgerAccountId, 300_000, 0],
        [receivable, 0, 300_000],
      ]),
      charge: entry('CHG-SAME-TX', 'invoice', [
        [receivable, 700_000, 0],
        [tuition, 0, 700_000],
      ]),
      after: entry('RCT-AFTER', 'payment', [
        [bank.ledgerAccountId, 200_000, 0],
        [receivable, 0, 200_000],
      ]),
    });

    const invoice = await invoiceOf(api, owner, id);

    expect(invoice.broughtForwardMinor).toBe(-300_000);
    expect(invoice.dueAtIssueMinor).toBe(400_000);
    expect(invoice.balanceTodayMinor).toBe(200_000);
  });

  test('carries the first charge into the second charge’s brought forward', async ({
    api,
    app,
    schools: { owner, studentLekki },
  }) => {
    const fixture = await chargeFixture(app, api, owner);
    const first = await prepare(api, owner, {
      termId: fixture.firstTermId,
      scope: 'school',
    });
    await sendRun(api, owner, first.runId ?? '');
    const second = await prepare(api, owner, {
      termId: fixture.secondTermId,
      scope: 'school',
    });
    const sent = await sendRun(api, owner, second.runId ?? '');
    const row = sent.charges.find((c) => c.studentId === studentLekki.id);

    const invoice = await invoiceOf(api, owner, row?.id ?? '');

    expect(invoice.broughtForwardMinor).toBe(TUITION_MINOR);
    expect(invoice.dueAtIssueMinor).toBe(TUITION_MINOR + SECOND_TERM_TOTAL);
  });

  test('shows the discount line negative and posts it to Discounts given', async ({
    api,
    app,
    pool,
    schools: { owner, orgA, studentLekki },
  }) => {
    const fixture = await chargeFixture(app, api, owner);
    await addDiscount(pool, {
      organizationId: orgA.id,
      studentId: studentLekki.id,
      fromTermId: fixture.firstTermId,
      feeTypeId: await ledgerAccountId(pool, orgA.id, 4010),
    });
    const { runId } = await prepare(api, owner, {
      termId: fixture.secondTermId,
      scope: 'school',
    });
    const sent = await sendRun(api, owner, runId ?? '');
    const row = sent.charges.find((c) => c.studentId === studentLekki.id);

    const invoice = await invoiceOf(api, owner, row?.id ?? '');

    expect(invoice.lines.at(-1)).toMatchObject({
      description: 'Sibling discount (3 children) (5% of tuition)',
      amountMinor: -900_000,
      feeLineId: null,
    });
    expect(invoice.lines.at(-1)?.studentDiscountId).not.toBeNull();
    expect(invoice.totalMinor).toBe(SECOND_TERM_TOTAL - 900_000);
    expect(invoice.journal?.balanced).toBe(true);
    const discountLine = invoice.journal?.lines.find(
      (line) => line.accountCode === 5000
    );
    expect(discountLine).toMatchObject({ debitMinor: 900_000, creditMinor: 0 });
  });

  test('answers 404 for an unknown id', async ({ api, schools: { owner } }) => {
    const res = await api(owner)
      .get('/invoices/0b0c8a8e-8a3e-4c6c-a8c4-0e2f0f6b1f11')
      .expect(404);
    expect(res.body.message).toBe(INVOICE_NOT_FOUND_MESSAGE);
    await api(owner).get('/invoices/not-an-id').expect(400);
  });
});

test.describe('isolation', () => {
  test('1: another school’s owner reads its charge and round by id as 404', async ({
    api,
    app,
    schools: { owner, ownerB },
  }) => {
    const fixture = await chargeFixture(app, api, owner);
    const { runId } = await prepare(api, owner, {
      termId: fixture.secondTermId,
      scope: 'school',
    });
    const run = await runOf(api, owner, runId ?? '');

    await api(ownerB).get(`/invoices/${run.charges[0]?.id}`).expect(404);
    await api(ownerB).get(`/billing-runs/${runId}`).expect(404);
    await api(ownerB).post(`/billing-runs/${runId}/issue`).expect(404);
    await api(ownerB).post(`/billing-runs/${runId}/cancel`).expect(404);
    expect((await runOf(api, owner, runId ?? '')).status).toBe('draft');
  });

  test('2: another school’s lists hold none of its rows, and a foreign student, campus, term or level is 404', async ({
    api,
    app,
    pool,
    schools: { owner, ownerB, orgB, campusB, studentLekki },
  }) => {
    const fixture = await chargeFixture(app, api, owner);
    await prepare(api, owner, {
      termId: fixture.secondTermId,
      scope: 'school',
    });

    expect((await invoicesOf(api, ownerB)).total).toBe(0);
    expect(
      (await api(ownerB).get('/billing-runs').expect(200)).body.items
    ).toEqual([]);
    const foreignStudent = await api(ownerB)
      .get(`/invoices?studentId=${studentLekki.id}`)
      .expect(404);
    expect(foreignStudent.body.message).toBe(INVOICE_STUDENT_NOT_FOUND_MESSAGE);
    await api(owner).get(`/invoices?studentId=${studentLekki.id}`).expect(200);
    await api(ownerB)
      .post('/billing-runs')
      .send({ termId: fixture.secondTermId, scope: 'school' })
      .expect(404);

    const termBId = await firstIdIn(pool, 'term', orgB.id);
    const levelBId = await firstIdIn(pool, 'class_level', orgB.id);
    const foreign = [
      { termId: termBId, scope: 'school' },
      { termId: fixture.secondTermId, scope: 'campus', scopeId: campusB.id },
      { termId: fixture.secondTermId, scope: 'level', scopeId: levelBId },
    ];
    for (const body of foreign) {
      await api(owner).post('/billing-runs').send(body).expect(404);
    }
    expect((await invoicesOf(api, owner)).total).toBe(2);
  });

  test('3 and 4: a Lekki bursar sees and opens only Lekki charges', async ({
    api,
    app,
    schools: { owner, lekkiOnly, studentLekki, studentIkeja },
  }) => {
    const fixture = await chargeFixture(app, api, owner);
    const { runId } = await prepare(api, owner, {
      termId: fixture.secondTermId,
      scope: 'school',
    });
    const run = await runOf(api, owner, runId ?? '');
    const ikejaCharge = run.charges.find(
      (c) => c.studentId === studentIkeja.id
    );
    const lekkiCharge = run.charges.find(
      (c) => c.studentId === studentLekki.id
    );

    const list = await invoicesOf(api, lekkiOnly);

    expect(list.items.map((item) => item.id)).toEqual([lekkiCharge?.id]);
    expect(list.counts.term).toBe(1);
    expect(list.summary).toEqual({
      sentCount: 0,
      sentTotalMinor: 0,
      draftCount: 1,
    });
    const hidden = await api(lekkiOnly)
      .get(`/invoices/${ikejaCharge?.id}`)
      .expect(404);
    expect(hidden.body.message).toBe(INVOICE_NOT_FOUND_MESSAGE);
    await api(lekkiOnly).get(`/invoices/${lekkiCharge?.id}`).expect(200);
    await api(lekkiOnly)
      .get(`/invoices?studentId=${studentIkeja.id}`)
      .expect(404);
    const lekkiRun = await runOf(api, lekkiOnly, runId ?? '');
    expect(lekkiRun.charges).toHaveLength(1);
    expect(lekkiRun.chargeCount).toBe(1);
    expect(lekkiRun.totalMinor).toBe(SECOND_TERM_TOTAL);
  });

  test('keeps a charge visible to the campus the student is on now', async ({
    api,
    app,
    pool,
    schools: { owner, lekkiOnly, studentLekki },
  }) => {
    const fixture = await chargeFixture(app, api, owner);
    const { runId } = await prepare(api, owner, {
      termId: fixture.secondTermId,
      scope: 'school',
    });
    const run = await runOf(api, owner, runId ?? '');
    const charge = run.charges.find((c) => c.studentId === studentLekki.id);
    await pool.query(
      `UPDATE enrollment_placement SET campus_id = (SELECT campus_id FROM invoice WHERE id <> $2 AND billing_run_id = $3 LIMIT 1)
       WHERE enrollment_id IN (SELECT id FROM student_enrollment WHERE student_id = $1)`,
      [studentLekki.id, charge?.id, runId]
    );

    await api(lekkiOnly).get(`/invoices/${charge?.id}`).expect(404);
    expect((await invoicesOf(api, owner)).total).toBe(2);
  });

  test('5 and 6: no permission is 403 and no session is 401 on every route', async ({
    api,
    app,
    schools: { owner, noPermission },
  }) => {
    const fixture = await chargeFixture(app, api, owner);
    const { runId } = await prepare(api, owner, {
      termId: fixture.secondTermId,
      scope: 'school',
    });
    const invoiceId = (await runOf(api, owner, runId ?? '')).charges[0]?.id;
    const reads = [
      '/invoices',
      `/invoices/${invoiceId}`,
      '/billing-runs',
      '/billing-runs/terms',
      `/billing-runs/${runId}`,
    ];
    for (const path of reads) {
      await api(noPermission).get(path).expect(403);
      await api().get(path).expect(401);
    }
    for (const path of [
      '/billing-runs',
      `/billing-runs/${runId}/issue`,
      `/billing-runs/${runId}/cancel`,
    ]) {
      await api(noPermission)
        .post(path)
        .send({ termId: fixture.secondTermId, scope: 'school' })
        .expect(403);
      await api().post(path).send({}).expect(401);
    }
  });
});

test.describe('read-only holders', () => {
  test('a holder of invoice:read sees rounds and charges but cannot prepare, send or cancel', async ({
    api,
    app,
    withPermissions,
    schools: { owner, orgA },
  }) => {
    const fixture = await chargeFixture(app, api, owner);
    const { runId } = await prepare(api, owner, {
      termId: fixture.secondTermId,
      scope: 'school',
    });
    const reader = await withPermissions(orgA, [
      'invoice:read',
      'campus:readAll',
    ]);

    await api(reader).get('/billing-runs').expect(200);
    await api(reader).get('/billing-runs/terms').expect(200);
    await api(reader).get(`/billing-runs/${runId}`).expect(200);
    expect((await invoicesOf(api, reader)).total).toBe(2);
    await api(reader)
      .post('/billing-runs')
      .send({ termId: fixture.secondTermId, scope: 'school' })
      .expect(403);
    await api(reader).post(`/billing-runs/${runId}/issue`).expect(403);
    await api(reader).post(`/billing-runs/${runId}/cancel`).expect(403);
    expect((await runOf(api, owner, runId ?? '')).status).toBe('draft');
  });

  test('the starter administrator and principal read the charges and cannot prepare, send or cancel', async ({
    api,
    app,
    addMember,
    createUser,
    schools: { owner, orgA },
  }) => {
    const fixture = await chargeFixture(app, api, owner);
    const { runId } = await prepare(api, owner, {
      termId: fixture.secondTermId,
      scope: 'school',
    });

    for (const role of ['administrator', 'principal']) {
      const member = await addMember(orgA, await createUser(), {
        roles: [role],
      });
      expect((await invoicesOf(api, member)).total).toBe(2);
      await api(member).get(`/billing-runs/${runId}`).expect(200);
      await api(member)
        .post('/billing-runs')
        .send({ termId: fixture.secondTermId, scope: 'school' })
        .expect(403);
      await api(member).post(`/billing-runs/${runId}/issue`).expect(403);
      await api(member).post(`/billing-runs/${runId}/cancel`).expect(403);
    }
    expect((await runOf(api, owner, runId ?? '')).status).toBe('draft');
  });

  test('a holder of invoice:bill alone cannot read', async ({
    api,
    app,
    withPermissions,
    schools: { owner, orgA },
  }) => {
    const fixture = await chargeFixture(app, api, owner);
    const biller = await withPermissions(orgA, ['invoice:bill']);

    await api(biller).get('/invoices').expect(403);
    await api(biller)
      .post('/billing-runs')
      .send({ termId: fixture.secondTermId, scope: 'school' })
      .expect(201);
  });
});
