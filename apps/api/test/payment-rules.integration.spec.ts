import {
  LAST_PAYMENT_METHOD_MESSAGE,
  PAYMENT_METHOD_OFF_MESSAGE,
  RECEIPT_FOOTER_MESSAGE,
  type SchoolSettings,
} from '@eduvault/api-contract';
import { acting, expect } from './support/base-test';
import { bankAccount, cashBody } from './support/factories/payments';
import { schoolsTest as test } from './support/two-schools';

test.describe('payment rules', () => {
  test('every member reads the methods and the footer, all on by default', async ({
    api,
    schools: { noPermission },
  }) => {
    const settings = (
      await api(noPermission).get('/school-settings').expect(200)
    ).body as SchoolSettings;

    expect(settings.paymentMethods).toEqual({
      cash: true,
      transfer: true,
      pos: true,
    });
    expect(settings.receiptFooter).toBe('Thank you for your payment.');
  });

  test('switches a method off and on, and keeps the others', async ({
    api,
    schools: { owner },
  }) => {
    const off = await api(owner)
      .patch('/school-settings/payment-rules')
      .send({ pos: false })
      .expect(200);
    expect(off.body).toEqual({ cash: true, transfer: true, pos: false });

    const settings = (await api(owner).get('/school-settings').expect(200))
      .body as SchoolSettings;
    expect(settings.paymentMethods).toEqual({
      cash: true,
      transfer: true,
      pos: false,
    });

    const on = await api(owner)
      .patch('/school-settings/payment-rules')
      .send({ pos: true, cash: false })
      .expect(200);
    expect(on.body).toEqual({ cash: false, transfer: true, pos: true });
  });

  test('refuses to switch off the last way to record a payment with the PRD copy', async ({
    api,
    schools: { owner },
  }) => {
    await api(owner)
      .patch('/school-settings/payment-rules')
      .send({ cash: false, transfer: false })
      .expect(200);

    const refused = await api(owner)
      .patch('/school-settings/payment-rules')
      .send({ pos: false })
      .expect(400);

    expect(refused.body.message).toBe(LAST_PAYMENT_METHOD_MESSAGE);
    const settings = (await api(owner).get('/school-settings').expect(200))
      .body as SchoolSettings;
    expect(settings.paymentMethods).toEqual({
      cash: false,
      transfer: false,
      pos: true,
    });
    await api(owner)
      .patch('/school-settings/payment-rules')
      .send({ cash: false, transfer: false, pos: false })
      .expect(400);
  });

  test('two requests switching off the last two methods leave one on', async ({
    api,
    schools: { owner },
  }) => {
    await api(owner)
      .patch('/school-settings/payment-rules')
      .send({ pos: false })
      .expect(200);

    const results = await Promise.all([
      api(owner).patch('/school-settings/payment-rules').send({ cash: false }),
      api(owner)
        .patch('/school-settings/payment-rules')
        .send({ transfer: false }),
    ]);

    expect(results.map((res) => res.status).toSorted((a, b) => a - b)).toEqual([
      200, 400,
    ]);
    const settings = (await api(owner).get('/school-settings').expect(200))
      .body as SchoolSettings;
    expect(Object.values(settings.paymentMethods).filter(Boolean)).toHaveLength(
      1
    );
  });

  test('a method switched off is refused on record with 400', async ({
    api,
    app,
    schools: { owner, studentLekki },
  }) => {
    const account = await bankAccount(app, owner);
    await api(owner)
      .patch('/school-settings/payment-rules')
      .send({ cash: false })
      .expect(200);

    const refused = await api(owner)
      .post('/finance/payments')
      .send(
        cashBody({
          accountId: account.id,
          allocations: [{ studentId: studentLekki.id, amountMinor: 1000 }],
        })
      )
      .expect(400);

    expect(refused.body.message).toBe(PAYMENT_METHOD_OFF_MESSAGE);
    const options = await api(owner)
      .get('/finance/payments/recording-options')
      .expect(200);
    expect(options.body.methods).toEqual({
      cash: false,
      transfer: true,
      pos: true,
    });
  });

  test('keeps 120 characters of footer and refuses 121 with 400', async ({
    api,
    schools: { owner },
  }) => {
    const ok = await api(owner)
      .patch('/school-settings')
      .send({ receiptFooter: 'a'.repeat(120) })
      .expect(200);
    expect(ok.body.receiptFooter).toBe('a'.repeat(120));

    const refused = await api(owner)
      .patch('/school-settings')
      .send({ receiptFooter: 'a'.repeat(121) })
      .expect(400);
    expect(JSON.stringify(refused.body)).toContain(RECEIPT_FOOTER_MESSAGE);

    const settings = (await api(owner).get('/school-settings').expect(200))
      .body as SchoolSettings;
    expect(settings.receiptFooter).toBe('a'.repeat(120));
  });

  test('saves a footer on its own without touching the guardian rules', async ({
    api,
    schools: { owner },
  }) => {
    const saved = await api(owner)
      .patch('/school-settings')
      .send({ receiptFooter: ' Thank God for your payment. ' })
      .expect(200);

    expect(saved.body).toMatchObject({
      receiptFooter: 'Thank God for your payment.',
      maxGuardians: 4,
      requireGuardian: true,
      paymentMethods: { cash: true, transfer: true, pos: true },
    });
  });
});

test.describe('isolation', () => {
  test('school B’s rules do not move when school A switches a method off', async ({
    api,
    schools: { owner, ownerB },
  }) => {
    await api(owner)
      .patch('/school-settings/payment-rules')
      .send({ pos: false })
      .expect(200);
    await api(owner)
      .patch('/school-settings')
      .send({ receiptFooter: 'School A footer' })
      .expect(200);

    const settings = (await api(ownerB).get('/school-settings').expect(200))
      .body as SchoolSettings;

    expect(settings.paymentMethods.pos).toBe(true);
    expect(settings.receiptFooter).toBe('Thank you for your payment.');
  });

  test('answers 403 without schoolAccount:update and 401 without a session', async ({
    api,
    schools: { noPermission, lekkiOnly },
  }) => {
    for (const user of [noPermission, lekkiOnly]) {
      await api(user)
        .patch('/school-settings/payment-rules')
        .send({ pos: false })
        .expect(403);
      await api(user)
        .patch('/school-settings')
        .send({ receiptFooter: 'x' })
        .expect(403);
    }
    await api()
      .patch('/school-settings/payment-rules')
      .send({ pos: false })
      .expect(401);
  });

  test('refuses an unknown method and a non-boolean value with 400', async ({
    api,
    schools: { owner },
  }) => {
    await api(owner)
      .patch('/school-settings/payment-rules')
      .send({ gateway: false })
      .expect(400);
    await api(owner)
      .patch('/school-settings/payment-rules')
      .send({ pos: 'no' })
      .expect(400);
  });

  test('an acting super admin without a reason cannot change the rules', async ({
    api,
    createUser,
    makeSuperAdmin,
    schools: { orgA },
  }) => {
    const admin = await makeSuperAdmin(await createUser());

    const refused = await api(admin)
      .patch('/school-settings/payment-rules')
      .set(acting(orgA.id))
      .send({ pos: false })
      .expect(403);

    expect(refused.body).toMatchObject({ code: 'ActingReadOnly' });
    const settings = (
      await api(admin).get('/school-settings').set(acting(orgA.id)).expect(200)
    ).body as SchoolSettings;
    expect(settings.paymentMethods.pos).toBe(true);
  });
});
