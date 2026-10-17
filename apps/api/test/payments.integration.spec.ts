import {
  PAYMENT_ACCOUNT_RETIRED_MESSAGE,
  PAYMENT_FUTURE_DATE_MESSAGE,
  PAYMENT_PROOF_NOT_FOUND_MESSAGE,
  PAYMENT_PROOF_REQUIRED_MESSAGE,
  PAYMENT_PROOF_TAKEN_MESSAGE,
  PAYMENT_PROVIDER_REFERENCE_TAKEN_MESSAGE,
  PAYMENT_REFERENCE_TAKEN_MESSAGE,
  paymentProviderReferenceUsedMessage,
  paymentReferenceUsedMessage,
  paymentSplitMismatchMessage,
  type CashBook,
  type PaymentList,
  type RecordedPayment,
  type RecordingOptions,
} from '@eduvault/api-contract';
import { acting, expect } from './support/base-test';
import { entriesFor, receivableBalance } from './support/factories/billing';
import { ledgerAccountId, postEntry } from './support/factories/finance';
import {
  PDF_BYTES,
  bankAccount,
  cashBody,
  nextReference,
  owes,
  receiptOf,
  recordCash,
  uploadProof,
} from './support/factories/payments';
import { schoolsTest as test } from './support/two-schools';

const FEES = 18_000_000;
const PART = 6_000_000;

const count = async (
  pool: { query: (sql: string) => Promise<{ rows: { n: string }[] }> },
  table: string
) =>
  Number(
    (await pool.query(`SELECT count(*)::text AS n FROM ${table}`)).rows[0]?.n
  );

test.describe('recording a payment', () => {
  test('posts one balanced entry and one receipt whose allocations add up to the amount', async ({
    api,
    app,
    pool,
    schools: { owner, orgA, studentLekki, studentIkeja },
  }) => {
    const account = await bankAccount(app, owner);
    await owes(app, owner, { studentId: studentLekki.id, amountMinor: FEES });
    await owes(app, owner, { studentId: studentIkeja.id, amountMinor: PART });
    const proof = await uploadProof(api, owner);
    const reference = nextReference('TRF');

    const res = await api(owner)
      .post('/finance/payments')
      .send({
        reference,
        payerName: 'Ngozi Okeke',
        moneyAccountId: account.id,
        method: 'transfer',
        providerReference: 'GTB/FT/2610070031',
        proofFileId: proof.id,
        amountMinor: FEES + PART,
        paidOn: '2026-10-07',
        allocations: [
          { studentId: studentLekki.id, amountMinor: FEES },
          { studentId: studentIkeja.id, amountMinor: PART },
        ],
      })
      .expect(201);

    const payment = res.body as RecordedPayment;
    expect(payment).toMatchObject({
      replayed: false,
      reference,
      providerReference: 'GTB/FT/2610070031',
      method: 'transfer',
      status: 'posted',
      payerName: 'Ngozi Okeke',
      amountMinor: FEES + PART,
      paidOn: '2026-10-07',
      proof: { fileId: proof.id, fileName: 'alert.pdf' },
      void: null,
      storeSale: null,
    });
    expect(payment.receiptNumber).toMatch(/^RCT-\d{4}-00001$/);
    expect(
      payment.allocations.reduce((sum, row) => sum + row.amountMinor, 0)
    ).toBe(FEES + PART);
    expect(payment.entry).toMatchObject({ reference, balanced: true });
    expect(payment.entry?.lines).toHaveLength(3);

    expect(await count(pool, 'payment')).toBe(1);
    expect(await count(pool, 'payment_allocation')).toBe(2);
    const lines = await entriesFor(pool, orgA.id, reference);
    expect(
      lines.map((line) => [
        line.student_id,
        line.campus_id,
        line.debit_minor,
        line.credit_minor,
      ])
    ).toEqual(
      expect.arrayContaining([
        [null, null, String(FEES + PART), '0'],
        [studentLekki.id, studentLekki.effectiveCampus.id, '0', String(FEES)],
        [studentIkeja.id, studentIkeja.effectiveCampus.id, '0', String(PART)],
      ])
    );
    expect(await receivableBalance(pool, orgA.id, studentLekki.id)).toBe(0);
    expect(await receivableBalance(pool, orgA.id, studentIkeja.id)).toBe(0);
  });

  test('numbers receipts one after another', async ({
    api,
    app,
    schools: { owner, studentLekki },
  }) => {
    const account = await bankAccount(app, owner);
    const first = await recordCash(api, owner, {
      accountId: account.id,
      allocations: [{ studentId: studentLekki.id, amountMinor: 100 }],
    });
    const second = await recordCash(api, owner, {
      accountId: account.id,
      allocations: [{ studentId: studentLekki.id, amountMinor: 100 }],
    });

    expect(first.receiptNumber).toMatch(/^RCT-\d{4}-00001$/);
    expect(second.receiptNumber).toMatch(/^RCT-\d{4}-00002$/);
  });

  test('takes a part payment and an overpayment, leaving credit', async ({
    api,
    app,
    pool,
    schools: { owner, orgA, studentLekki },
  }) => {
    const account = await bankAccount(app, owner);
    await owes(app, owner, { studentId: studentLekki.id, amountMinor: FEES });

    await recordCash(api, owner, {
      accountId: account.id,
      allocations: [{ studentId: studentLekki.id, amountMinor: PART }],
    });
    expect(await receivableBalance(pool, orgA.id, studentLekki.id)).toBe(
      FEES - PART
    );

    await recordCash(api, owner, {
      accountId: account.id,
      allocations: [{ studentId: studentLekki.id, amountMinor: FEES }],
    });
    expect(await receivableBalance(pool, orgA.id, studentLekki.id)).toBe(-PART);
  });

  test('two identical submits at the same moment give one receipt and one entry', async ({
    api,
    app,
    pool,
    schools: { owner, studentLekki },
  }) => {
    const account = await bankAccount(app, owner);
    const body = cashBody({
      accountId: account.id,
      allocations: [{ studentId: studentLekki.id, amountMinor: PART }],
    });

    const results = await Promise.all([
      api(owner).post('/finance/payments').send(body),
      api(owner).post('/finance/payments').send(body),
      api(owner).post('/finance/payments').send(body),
    ]);

    expect(results.map((res) => res.status).toSorted((a, b) => a - b)).toEqual([
      200, 200, 201,
    ]);
    expect(new Set(results.map((res) => res.body.id)).size).toBe(1);
    expect(results.filter((res) => res.body.replayed === true)).toHaveLength(2);
    expect(await count(pool, 'payment')).toBe(1);
    expect(
      Number(
        (
          await pool.query(
            `SELECT count(*)::text AS n FROM journal_entry WHERE kind = 'payment'`
          )
        ).rows[0].n
      )
    ).toBe(1);
  });

  test('a retry answers 200 with the first receipt and posts nothing', async ({
    api,
    app,
    pool,
    schools: { owner, studentLekki },
  }) => {
    const account = await bankAccount(app, owner);
    const body = cashBody({
      accountId: account.id,
      allocations: [{ studentId: studentLekki.id, amountMinor: PART }],
    });
    const first = (
      await api(owner).post('/finance/payments').send(body).expect(201)
    ).body as RecordedPayment;

    const again = await api(owner)
      .post('/finance/payments')
      .send({ ...body, allocations: body.allocations.toReversed() })
      .expect(200);

    expect(again.body).toMatchObject({
      id: first.id,
      receiptNumber: first.receiptNumber,
      replayed: true,
    });
    expect(await count(pool, 'payment')).toBe(1);
  });

  test('a retry that uploaded the proof again still replays the first receipt', async ({
    api,
    app,
    pool,
    schools: { owner, studentLekki },
  }) => {
    const account = await bankAccount(app, owner);
    const proof = await uploadProof(api, owner);
    const transfer = {
      ...cashBody({
        accountId: account.id,
        allocations: [{ studentId: studentLekki.id, amountMinor: PART }],
      }),
      method: 'transfer',
      proofFileId: proof.id,
    };
    const first = (
      await api(owner).post('/finance/payments').send(transfer).expect(201)
    ).body as RecordedPayment;

    const secondProof = await uploadProof(api, owner);
    const again = await api(owner)
      .post('/finance/payments')
      .send({
        ...transfer,
        proofFileId: secondProof.id,
        providerReference: 'GTB/FT/2609051184',
      })
      .expect(200);

    expect(again.body).toMatchObject({ id: first.id, replayed: true });
    expect(await count(pool, 'payment')).toBe(1);
  });

  test('the same reference with different details answers 409 and posts nothing', async ({
    api,
    app,
    pool,
    schools: { owner, studentLekki },
  }) => {
    const account = await bankAccount(app, owner);
    const body = cashBody({
      accountId: account.id,
      allocations: [{ studentId: studentLekki.id, amountMinor: PART }],
    });
    const first = (
      await api(owner).post('/finance/payments').send(body).expect(201)
    ).body as RecordedPayment;

    const clash = await api(owner)
      .post('/finance/payments')
      .send({
        ...body,
        amountMinor: PART + 1,
        allocations: [{ studentId: studentLekki.id, amountMinor: PART + 1 }],
      })
      .expect(409);

    expect(clash.body.message).toBe(
      paymentReferenceUsedMessage(body.reference, first.receiptNumber)
    );
    expect(await count(pool, 'payment')).toBe(1);
    expect(await count(pool, 'journal_entry')).toBe(1);
  });

  test('a provider reference already on a receipt answers 409 naming it', async ({
    api,
    app,
    schools: { owner, studentLekki },
  }) => {
    const account = await bankAccount(app, owner);
    const allocations = [{ studentId: studentLekki.id, amountMinor: PART }];
    const first = await recordCash(api, owner, {
      accountId: account.id,
      allocations,
      providerReference: 'GTB/FT/2609051183',
    });

    const clash = await api(owner)
      .post('/finance/payments')
      .send(
        cashBody({
          accountId: account.id,
          allocations,
          providerReference: 'GTB/FT/2609051183',
        })
      )
      .expect(409);

    expect(clash.body.message).toBe(
      paymentProviderReferenceUsedMessage(
        'GTB/FT/2609051183',
        first.receiptNumber
      )
    );
  });

  test('a cash payment needs no proof, a transfer does', async ({
    api,
    app,
    schools: { owner, studentLekki },
  }) => {
    const account = await bankAccount(app, owner);
    const allocations = [{ studentId: studentLekki.id, amountMinor: PART }];
    await recordCash(api, owner, { accountId: account.id, allocations });

    const refused = await api(owner)
      .post('/finance/payments')
      .send({
        ...cashBody({ accountId: account.id, allocations }),
        method: 'transfer',
      })
      .expect(400);

    expect(refused.body.message).toBe(PAYMENT_PROOF_REQUIRED_MESSAGE);
  });

  test('a proof on another payment answers 409, while a retry of that payment replays', async ({
    api,
    app,
    schools: { owner, studentLekki },
  }) => {
    const account = await bankAccount(app, owner);
    const allocations = [{ studentId: studentLekki.id, amountMinor: PART }];
    const proof = await uploadProof(api, owner);
    const transfer = {
      ...cashBody({ accountId: account.id, allocations }),
      method: 'transfer',
      proofFileId: proof.id,
    };
    await api(owner).post('/finance/payments').send(transfer).expect(201);

    await api(owner).post('/finance/payments').send(transfer).expect(200);
    const taken = await api(owner)
      .post('/finance/payments')
      .send({ ...transfer, reference: nextReference('TRF') })
      .expect(409);

    expect(taken.body.message).toBe(PAYMENT_PROOF_TAKEN_MESSAGE);
  });

  test('refuses a future date, a split that does not add up and a retired account with 400', async ({
    api,
    app,
    schools: { owner, studentLekki },
  }) => {
    const account = await bankAccount(app, owner);
    const retired = await bankAccount(app, owner);
    await api(owner)
      .patch(`/finance/money-accounts/${retired.id}`)
      .send({ retired: true })
      .expect(200);
    const allocations = [{ studentId: studentLekki.id, amountMinor: PART }];
    const base = cashBody({ accountId: account.id, allocations });

    const future = await api(owner)
      .post('/finance/payments')
      .send({ ...base, paidOn: '2999-01-01' })
      .expect(400);
    expect(future.body.message).toBe(PAYMENT_FUTURE_DATE_MESSAGE);

    const split = await api(owner)
      .post('/finance/payments')
      .send({ ...base, amountMinor: PART + 500 })
      .expect(400);
    expect(split.body.message).toBe(
      paymentSplitMismatchMessage(PART, PART + 500)
    );

    const gone = await api(owner)
      .post('/finance/payments')
      .send({ ...base, moneyAccountId: retired.id })
      .expect(400);
    expect(gone.body.message).toBe(PAYMENT_ACCOUNT_RETIRED_MESSAGE);

    await api(owner)
      .post('/finance/payments')
      .send({ ...base, payerName: undefined })
      .expect(400);
    await api(owner)
      .post('/finance/payments')
      .send({ ...base, allocations: [], amountMinor: PART })
      .expect(400);
    await api(owner)
      .post('/finance/payments')
      .send({ ...base, amountMinor: 0 })
      .expect(400);
  });

  test('answers 404 for a student, account, guardian or proof that is not in reach', async ({
    api,
    app,
    schools: { owner, ownerB, studentLekki, studentB },
  }) => {
    const account = await bankAccount(app, owner);
    const foreign = await bankAccount(app, ownerB);
    const foreignProof = await uploadProof(api, ownerB);
    const allocations = [{ studentId: studentLekki.id, amountMinor: PART }];
    const base = cashBody({ accountId: account.id, allocations });

    await api(owner)
      .post('/finance/payments')
      .send({
        ...base,
        allocations: [{ studentId: studentB.id, amountMinor: PART }],
      })
      .expect(404);
    await api(owner)
      .post('/finance/payments')
      .send({ ...base, moneyAccountId: foreign.id })
      .expect(404);
    await api(owner)
      .post('/finance/payments')
      .send({
        ...base,
        payerName: undefined,
        payerGuardianId: studentB.guardians?.[0]?.guardianId,
      })
      .expect(404);
    await api(owner)
      .post('/finance/payments')
      .send({
        ...base,
        method: 'transfer',
        proofFileId: foreignProof.id,
      })
      .expect(404);
  });

  test('a proof uploaded by another member answers 404, as if it did not exist', async ({
    api,
    app,
    schools: { owner, lekkiOnly, studentLekki },
  }) => {
    const account = await bankAccount(app, owner);
    const ownersProof = await uploadProof(api, owner);

    const refused = await api(lekkiOnly)
      .post('/finance/payments')
      .send({
        ...cashBody({
          accountId: account.id,
          allocations: [{ studentId: studentLekki.id, amountMinor: PART }],
        }),
        method: 'transfer',
        proofFileId: ownersProof.id,
      })
      .expect(404);

    expect(refused.body.message).toBe(PAYMENT_PROOF_NOT_FOUND_MESSAGE);
  });

  test('a campus bursar cannot record for another campus’s student but can pay into a school-wide account', async ({
    api,
    app,
    schools: { owner, lekkiOnly, studentLekki, studentIkeja },
  }) => {
    const schoolWide = await bankAccount(app, owner);
    const ikejaAccount = await bankAccount(
      app,
      owner,
      studentIkeja.effectiveCampus.id
    );

    await api(lekkiOnly)
      .post('/finance/payments')
      .send(
        cashBody({
          accountId: schoolWide.id,
          allocations: [{ studentId: studentIkeja.id, amountMinor: PART }],
        })
      )
      .expect(404);
    await api(lekkiOnly)
      .post('/finance/payments')
      .send(
        cashBody({
          accountId: ikejaAccount.id,
          allocations: [{ studentId: studentLekki.id, amountMinor: PART }],
        })
      )
      .expect(404);
    const recorded = await api(lekkiOnly)
      .post('/finance/payments')
      .send(
        cashBody({
          accountId: schoolWide.id,
          allocations: [{ studentId: studentLekki.id, amountMinor: PART }],
        })
      )
      .expect(201);

    expect(recorded.body.moneyAccount.id).toBe(schoolWide.id);
  });

  test('a method switched off in Payment rules answers 400', async ({
    api,
    app,
    schools: { owner, studentLekki },
  }) => {
    const account = await bankAccount(app, owner);
    await api(owner)
      .patch('/school-settings/payment-rules')
      .send({ pos: false })
      .expect(200);

    await api(owner)
      .post('/finance/payments')
      .send({
        ...cashBody({
          accountId: account.id,
          allocations: [{ studentId: studentLekki.id, amountMinor: PART }],
        }),
        method: 'pos',
      })
      .expect(400);
  });
});

test.describe('reading receipts', () => {
  test('an Ikeja-only receipt and its proof answer 404 to a Lekki bursar', async ({
    api,
    app,
    schools: { owner, lekkiOnly, studentIkeja },
  }) => {
    const account = await bankAccount(app, owner);
    const proof = await uploadProof(api, owner);
    const payment = (
      await api(owner)
        .post('/finance/payments')
        .send({
          ...cashBody({
            accountId: account.id,
            allocations: [{ studentId: studentIkeja.id, amountMinor: PART }],
          }),
          method: 'transfer',
          proofFileId: proof.id,
        })
        .expect(201)
    ).body as RecordedPayment;

    await api(lekkiOnly).get(`/finance/payments/${payment.id}`).expect(404);
    await api(lekkiOnly).get(`/files/${proof.id}`).expect(404);
    const list = (await api(lekkiOnly).get('/finance/payments').expect(200))
      .body as PaymentList;
    expect(list.items).toEqual([]);
    expect(list.summary).toEqual({
      receiptCount: 0,
      receivedMinor: 0,
      cancellationsWaiting: 0,
    });
    const asOwner = await api(owner).get(`/files/${proof.id}`).expect(200);
    expect(asOwner.headers['content-type']).toContain('application/pdf');
    expect(asOwner.headers['x-content-type-options']).toBe('nosniff');
  });

  test('a reference or provider reference on an Ikeja receipt does not name it to a Lekki bursar', async ({
    api,
    app,
    schools: { owner, lekkiOnly, studentLekki, studentIkeja },
  }) => {
    const account = await bankAccount(app, owner);
    const ikeja = await recordCash(api, owner, {
      accountId: account.id,
      allocations: [{ studentId: studentIkeja.id, amountMinor: PART }],
      providerReference: 'GTB/FT/2609051185',
    });
    const allocations = [{ studentId: studentLekki.id, amountMinor: PART }];

    const sameReference = await api(lekkiOnly)
      .post('/finance/payments')
      .send({
        ...cashBody({ accountId: account.id, allocations }),
        reference: ikeja.reference,
      })
      .expect(409);
    const sameProvider = await api(lekkiOnly)
      .post('/finance/payments')
      .send({
        ...cashBody({ accountId: account.id, allocations }),
        providerReference: 'GTB/FT/2609051185',
      })
      .expect(409);

    expect(sameReference.body.message).toBe(PAYMENT_REFERENCE_TAKEN_MESSAGE);
    expect(sameProvider.body.message).toBe(
      PAYMENT_PROVIDER_REFERENCE_TAKEN_MESSAGE
    );
    expect(
      JSON.stringify([sameReference.body, sameProvider.body])
    ).not.toContain(ikeja.receiptNumber);
  });

  test('a split receipt names the Ikeja child to a Lekki bursar without a balance', async ({
    api,
    app,
    schools: { owner, lekkiOnly, studentLekki, studentIkeja },
  }) => {
    const account = await bankAccount(app, owner);
    await owes(app, owner, { studentId: studentLekki.id, amountMinor: FEES });
    await owes(app, owner, { studentId: studentIkeja.id, amountMinor: FEES });
    const proof = await uploadProof(api, owner);
    const payment = (
      await api(owner)
        .post('/finance/payments')
        .send({
          ...cashBody({
            accountId: account.id,
            allocations: [
              { studentId: studentLekki.id, amountMinor: PART },
              { studentId: studentIkeja.id, amountMinor: PART },
            ],
          }),
          method: 'transfer',
          proofFileId: proof.id,
        })
        .expect(201)
    ).body as RecordedPayment;

    const receipt = await receiptOf(api, lekkiOnly, payment.id);

    const lekkiRow = receipt.allocations.find(
      (row) => row.studentId === studentLekki.id
    );
    const ikejaRow = receipt.allocations.find(
      (row) => row.studentId === studentIkeja.id
    );
    expect(lekkiRow).toMatchObject({
      inScope: true,
      balanceMinor: FEES - PART,
    });
    expect(lekkiRow?.className).not.toBeNull();
    expect(ikejaRow).toMatchObject({
      studentName: `${studentIkeja.firstName} ${studentIkeja.lastName}`,
      inScope: false,
      balanceMinor: null,
      className: null,
      amountMinor: PART,
    });
    await api(lekkiOnly).get(`/files/${proof.id}`).expect(200);
    const list = (await api(lekkiOnly).get('/finance/payments').expect(200))
      .body as PaymentList;
    expect(list.summary).toEqual({
      receiptCount: 1,
      receivedMinor: PART,
      cancellationsWaiting: 0,
    });
    expect(list.items[0]?.allocations.map((row) => row.inScope)).toEqual(
      expect.arrayContaining([true, false])
    );
  });

  test('lists newest first, searches receipt, payer, student and reference, and filters by status', async ({
    api,
    app,
    schools: { owner, studentLekki },
  }) => {
    const account = await bankAccount(app, owner);
    const first = await recordCash(api, owner, {
      accountId: account.id,
      payerName: 'Mrs Ojo',
      paidOn: '2026-10-01',
      allocations: [{ studentId: studentLekki.id, amountMinor: PART }],
    });
    const second = await recordCash(api, owner, {
      accountId: account.id,
      payerName: 'Mr Bello',
      paidOn: '2026-10-05',
      allocations: [{ studentId: studentLekki.id, amountMinor: PART }],
    });

    const all = (await api(owner).get('/finance/payments').expect(200))
      .body as PaymentList;
    expect(all.items.map((row) => row.id)).toEqual([second.id, first.id]);
    expect(all.total).toBe(2);
    expect(all.summary).toMatchObject({
      receiptCount: 2,
      receivedMinor: 2 * PART,
    });
    expect(all.items[0]?.moneyAccount.label).toContain('ending 4417');

    const find = async (q: string) =>
      (
        (await api(owner).get('/finance/payments').query({ q }).expect(200))
          .body as PaymentList
      ).items.map((row) => row.id);
    expect(await find('bello')).toEqual([second.id]);
    expect(await find(first.receiptNumber.toLowerCase())).toEqual([first.id]);
    expect(await find(studentLekki.firstName)).toHaveLength(2);
    expect(await find(first.reference.slice(0, 12))).toHaveLength(2);
    expect(await find('nobody')).toEqual([]);
    const none = (
      await api(owner)
        .get('/finance/payments')
        .query({ status: 'voided' })
        .expect(200)
    ).body as PaymentList;
    expect(none.items).toEqual([]);
  });

  test('feeds the Record a payment sheet with accounts, methods, payers and students in reach', async ({
    api,
    app,
    schools: { owner, lekkiOnly, studentLekki, studentIkeja },
  }) => {
    const schoolWide = await bankAccount(app, owner);
    await bankAccount(app, owner, studentIkeja.effectiveCampus.id);
    await owes(app, owner, { studentId: studentLekki.id, amountMinor: FEES });

    const options = (
      await api(lekkiOnly)
        .get('/finance/payments/recording-options')
        .expect(200)
    ).body as RecordingOptions;

    expect(options.accounts.map((row) => row.id)).toEqual([schoolWide.id]);
    expect(options.methods).toEqual({ cash: true, transfer: true, pos: true });
    expect(options.students.map((row) => row.studentId)).toEqual([
      studentLekki.id,
    ]);
    expect(options.students[0]?.owesMinor).toBe(FEES);
    expect(options.payers).toHaveLength(1);
    expect(options.payers[0]?.children).toEqual([
      expect.objectContaining({ studentId: studentLekki.id, owesMinor: FEES }),
    ]);
    expect(options.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test('the cash book links a payment entry to its receipt', async ({
    api,
    app,
    schools: { owner, studentLekki },
  }) => {
    const account = await bankAccount(app, owner);
    const payment = await recordCash(api, owner, {
      accountId: account.id,
      allocations: [{ studentId: studentLekki.id, amountMinor: PART }],
    });

    const book = (
      await api(owner)
        .get(`/finance/money-accounts/${account.id}/cash-book`)
        .expect(200)
    ).body as CashBook;

    expect(book.items[0]).toMatchObject({
      reference: payment.reference,
      link: { type: 'payment', id: payment.id },
    });
  });

  test('deleting an attached proof answers 409', async ({
    api,
    app,
    schools: { owner, studentLekki },
  }) => {
    const account = await bankAccount(app, owner);
    const proof = await uploadProof(api, owner);
    await api(owner)
      .post('/finance/payments')
      .send({
        ...cashBody({
          accountId: account.id,
          allocations: [{ studentId: studentLekki.id, amountMinor: PART }],
        }),
        method: 'transfer',
        proofFileId: proof.id,
      })
      .expect(201);

    await api(owner).delete(`/files/${proof.id}`).expect(409);
    await api(owner).get(`/files/${proof.id}`).expect(200);
  });

  test('an unattached proof is not served until a payment carries it', async ({
    api,
    schools: { owner },
  }) => {
    const proof = await uploadProof(api, owner, PDF_BYTES);
    await api(owner).get(`/files/${proof.id}`).expect(404);
  });
});

test.describe('isolation', () => {
  test('another school’s ids answer 404 on every route and its lists hold none of A’s rows', async ({
    api,
    app,
    schools: { owner, ownerB, studentLekki },
  }) => {
    const account = await bankAccount(app, owner);
    const payment = await recordCash(api, owner, {
      accountId: account.id,
      allocations: [{ studentId: studentLekki.id, amountMinor: PART }],
    });

    await api(ownerB).get(`/finance/payments/${payment.id}`).expect(404);
    const list = (await api(ownerB).get('/finance/payments').expect(200))
      .body as PaymentList;
    expect(list.items).toEqual([]);
    const options = (
      await api(ownerB).get('/finance/payments/recording-options').expect(200)
    ).body as RecordingOptions;
    expect(options.accounts).toEqual([]);
    expect(options.students.map((row) => row.studentId)).not.toContain(
      studentLekki.id
    );
    await api(ownerB)
      .post('/finance/payments')
      .send({
        ...cashBody({
          accountId: account.id,
          allocations: [{ studentId: studentLekki.id, amountMinor: PART }],
        }),
        reference: payment.reference,
      })
      .expect(404);
    await api(ownerB)
      .get(`/finance/money-accounts/${account.id}/cash-book`)
      .expect(404);
  });

  test('the database refuses an allocation or an account from another school', async ({
    api,
    app,
    pool,
    schools: { owner, ownerB, orgA, studentLekki, studentB },
  }) => {
    const account = await bankAccount(app, owner);
    const foreign = await bankAccount(app, ownerB);
    const payment = await recordCash(api, owner, {
      accountId: account.id,
      allocations: [{ studentId: studentLekki.id, amountMinor: PART }],
    });
    const organizationId = orgA.id;

    await expect(
      pool.query(
        `INSERT INTO payment_allocation (payment_id, organization_id, student_id, amount_minor)
         VALUES ($1, $2, $3, 100)`,
        [payment.id, organizationId, studentB.id]
      )
    ).rejects.toMatchObject({ code: '23503' });
    const entry = await postEntry(app, {
      organizationId,
      reference: 'JE-FOR-FOREIGN-ACCOUNT',
      kind: 'adjustment',
      effectiveOn: '2026-10-01',
      postedBy: null,
      lines: [
        {
          ledgerAccountId: await ledgerAccountId(pool, organizationId, 1200),
          debitMinor: 100,
          creditMinor: 0,
        },
        {
          ledgerAccountId: await ledgerAccountId(pool, organizationId, 3000),
          debitMinor: 0,
          creditMinor: 100,
        },
      ],
    });
    await expect(
      pool.query(
        `INSERT INTO payment
           (organization_id, reference, receipt_number, payer_name, money_account_id, method,
            amount_minor, paid_on, request_hash, journal_entry_id)
         VALUES ($1, 'X-1', 'RCT-X', 'Someone', $2, 'cash', 100, '2026-10-01', 'h', $3)`,
        [organizationId, foreign.id, entry.entry.id]
      )
    ).rejects.toMatchObject({ code: '23503' });
  });

  test('a payment can be neither deleted nor changed apart from its status', async ({
    api,
    app,
    pool,
    schools: { owner, studentLekki },
  }) => {
    const account = await bankAccount(app, owner);
    const payment = await recordCash(api, owner, {
      accountId: account.id,
      allocations: [{ studentId: studentLekki.id, amountMinor: PART }],
    });

    await api(owner).delete(`/finance/payments/${payment.id}`).expect(404);
    await expect(
      pool.query(`DELETE FROM payment WHERE id = $1`, [payment.id])
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      pool.query(`DELETE FROM payment_allocation WHERE payment_id = $1`, [
        payment.id,
      ])
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      pool.query(`UPDATE payment SET amount_minor = 1 WHERE id = $1`, [
        payment.id,
      ])
    ).rejects.toMatchObject({ code: '23514' });
    await pool.query(
      `UPDATE payment SET status = 'void_pending' WHERE id = $1`,
      [payment.id]
    );
    const waiting = await receiptOf(api, owner, payment.id);
    expect(waiting.status).toBe('void_pending');
  });

  test('answers 401 without a session', async ({ api }) => {
    await api().get('/finance/payments').expect(401);
    await api().get('/finance/payments/recording-options').expect(401);
    await api().post('/finance/payments').send({}).expect(401);
  });

  test('answers 403 without the permission, checked before anything else', async ({
    api,
    app,
    withPermissions,
    schools: { owner, orgA, noPermission, lekki, studentLekki },
  }) => {
    const account = await bankAccount(app, owner);
    const payment = await recordCash(api, owner, {
      accountId: account.id,
      allocations: [{ studentId: studentLekki.id, amountMinor: PART }],
    });
    const reader = await withPermissions(orgA, ['payment:read'], {
      campuses: [lekki],
    });
    const recorder = await withPermissions(orgA, ['payment:record'], {
      campuses: [lekki],
    });
    const body = cashBody({
      accountId: account.id,
      allocations: [{ studentId: studentLekki.id, amountMinor: PART }],
    });

    for (const user of [noPermission, reader]) {
      await api(user).post('/finance/payments').send(body).expect(403);
      await api(user).get('/finance/payments/recording-options').expect(403);
    }
    for (const user of [noPermission, recorder]) {
      await api(user).get('/finance/payments').expect(403);
      await api(user).get(`/finance/payments/${payment.id}`).expect(403);
    }
    await api(reader).get(`/finance/payments/${payment.id}`).expect(200);
    await api(recorder)
      .post('/finance/payments')
      .send({ ...body, reference: nextReference('CSH') })
      .expect(201);
    await api(noPermission)
      .patch('/school-settings/payment-rules')
      .send({ pos: false })
      .expect(403);
  });

  test('an acting super admin without a reason cannot record', async ({
    api,
    app,
    pool,
    makeSuperAdmin,
    createUser,
    schools: { owner, orgA, studentLekki },
  }) => {
    const account = await bankAccount(app, owner);
    const admin = await makeSuperAdmin(await createUser());
    const body = cashBody({
      accountId: account.id,
      allocations: [{ studentId: studentLekki.id, amountMinor: PART }],
    });

    const refused = await api(admin)
      .post('/finance/payments')
      .set(acting(orgA.id))
      .send(body)
      .expect(403);

    expect(refused.body).toMatchObject({ code: 'ActingReadOnly' });
    expect(await count(pool, 'payment')).toBe(0);
    await api(admin).get('/finance/payments').set(acting(orgA.id)).expect(200);
  });
});
