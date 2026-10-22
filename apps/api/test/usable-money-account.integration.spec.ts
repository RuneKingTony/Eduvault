import { KYSELY_TOKEN, type Database } from '../src/app/common/db/tokens';
import { usableMoneyAccount } from '../src/app/common/money-accounts';
import { expect } from './support/base-test';
import { bankAccount } from './support/factories/payments';
import { gatewayAccountId } from './support/factories/store';
import { schoolsTest as test } from './support/two-schools';

test.describe('whether a money account can serve the caller', () => {
  test('answers ok, retired, gateway or missing, and keeps out accounts beyond the caller', async ({
    api,
    app,
    pool,
    schools: { owner, orgA, orgB, lekki, ikeja },
  }) => {
    const db = app.get<Database>(KYSELY_TOKEN, { strict: false });
    const schoolWide = await bankAccount(app, owner);
    const onIkeja = await bankAccount(app, owner, ikeja.id);
    const retired = await bankAccount(app, owner);
    await api(owner)
      .patch(`/finance/money-accounts/${retired.id}`)
      .send({ retired: true })
      .expect(200);
    const gateway = await gatewayAccountId(pool, orgA.id);
    const everyone = { organizationId: orgA.id, campusScope: 'all' } as const;
    const ledgerOf = async (id: string) =>
      (
        await pool.query<{ ledger_account_id: string }>(
          'SELECT ledger_account_id FROM money_account WHERE id = $1',
          [id]
        )
      ).rows[0]?.ledger_account_id;
    const lekkiOnly = { organizationId: orgA.id, campusScope: [lekki.id] };
    const nobody = { organizationId: orgA.id, campusScope: [] };

    expect(await usableMoneyAccount(db, everyone, schoolWide.id)).toEqual({
      status: 'ok',
      ledgerAccountId: await ledgerOf(schoolWide.id),
      campusId: null,
      kind: 'bank',
    });
    expect(await usableMoneyAccount(db, everyone, onIkeja.id)).toEqual({
      status: 'ok',
      ledgerAccountId: await ledgerOf(onIkeja.id),
      campusId: ikeja.id,
      kind: 'bank',
    });
    expect(await usableMoneyAccount(db, everyone, retired.id)).toEqual({
      status: 'retired',
    });
    expect(await usableMoneyAccount(db, everyone, gateway)).toEqual({
      status: 'gateway',
    });
    expect(await usableMoneyAccount(db, everyone, crypto.randomUUID())).toEqual(
      { status: 'missing' }
    );

    expect(
      (await usableMoneyAccount(db, lekkiOnly, schoolWide.id)).status
    ).toBe('ok');
    expect(await usableMoneyAccount(db, lekkiOnly, onIkeja.id)).toEqual({
      status: 'missing',
    });
    expect((await usableMoneyAccount(db, nobody, schoolWide.id)).status).toBe(
      'ok'
    );
    expect(await usableMoneyAccount(db, nobody, onIkeja.id)).toEqual({
      status: 'missing',
    });
    expect(
      await usableMoneyAccount(
        db,
        { organizationId: orgB.id, campusScope: 'all' },
        schoolWide.id
      )
    ).toEqual({ status: 'missing' });
  });
});
