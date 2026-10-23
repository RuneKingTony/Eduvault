import { randomUUID } from 'node:crypto';
import { FakeWalletRepository } from '../src/app/modules/wallet/fake-wallet.repository';
import { WalletRepository } from '../src/app/modules/wallet/wallet.repository';
import {
  OWED,
  describeWalletRepositoryContract,
  type WalletHarness,
} from './wallet-repository.contract';
import { expect, type Fixtures } from './support/base-test';
import { owes } from './support/factories/payments';
import {
  cashAccount,
  uploadWalletProof,
  walletIdOf,
} from './support/factories/wallets';
import { family, signInAs } from './support/portal';
import { schoolsTest as test, twoSchools } from './support/two-schools';

const fakeHarness = (): WalletHarness => {
  const repository = new FakeWalletRepository();
  repository.seed({
    id: 'wallet-1',
    organizationId: 'school-a',
    guardianId: 'guardian-1',
    userId: 'user-guardian',
    name: 'Mrs Okeke',
    phone: '08012345678',
    paying: true,
    balanceMinor: 0,
    children: ['ada', 'tobi'].map((studentId) => ({
      studentId,
      name: studentId,
      admissionNumber: studentId,
      campusId: 'lekki',
      owedMinor: OWED,
    })),
  });
  repository.accounts.set('till', {
    status: 'ok',
    ledgerAccountId: 'ledger-till',
    campusId: null,
    kind: 'cash',
  });
  return {
    repository,
    scope: { organizationId: 'school-a', campusScope: 'all' },
    organizationId: 'school-a',
    userId: 'user-staff',
    userName: 'Tunde Bakare',
    walletId: 'wallet-1',
    children: ['ada', 'tobi'],
    newTopUp: (overrides = {}) => {
      const proofFileId = randomUUID();
      return Promise.resolve({
        organizationId: 'school-a',
        userId: 'user-staff',
        userName: 'Tunde Bakare',
        walletId: 'wallet-1',
        reference: randomUUID(),
        requestHash: 'hash',
        moneyAccountId: 'till',
        ledgerAccountId: 'ledger-till',
        accountCampusId: null,
        method: 'cash',
        amountMinor: 1000,
        receivedOn: '2026-10-07',
        depositorName: null,
        proofFileId,
        ...overrides,
      });
    },
  };
};

describe('FakeWalletRepository', () => {
  describeWalletRepositoryContract((title, runScenario) => {
    it(title, async () => {
      await runScenario(fakeHarness());
    });
  });
});

describe('the wallet repository contract', () => {
  it('gives every scenario its own title, so none is hidden behind another', () => {
    const titles: string[] = [];
    describeWalletRepositoryContract((title) => titles.push(title));

    expect(titles.length).toBeGreaterThan(0);
    expect(new Set(titles).size).toBe(titles.length);
  });
});

const postgresHarness = async ({
  app,
  api,
  pool,
  schools,
}: Pick<Fixtures, 'app' | 'api' | 'pool'> & {
  schools: Awaited<ReturnType<typeof twoSchools>>;
}): Promise<WalletHarness> => {
  const { owner, orgA } = schools;
  const { ada, tobi, guardianLogin } = await family(app, schools);
  await owes(app, owner, { studentId: ada.id, amountMinor: OWED });
  await owes(app, owner, { studentId: tobi.id, amountMinor: OWED });
  const account = await cashAccount(app, owner);
  const { rows } = await pool.query<{ ledger_account_id: string }>(
    'SELECT ledger_account_id FROM money_account WHERE id = $1',
    [account.id]
  );
  await signInAs(api, guardianLogin);
  return {
    repository: app.get(WalletRepository),
    scope: { organizationId: orgA.id, campusScope: 'all' },
    organizationId: orgA.id,
    userId: owner.id,
    userName: 'Owner',
    walletId: await walletIdOf(pool, guardianLogin?.guardianId ?? ''),
    children: [ada.id, tobi.id],
    newTopUp: async (overrides = {}) => ({
      organizationId: orgA.id,
      userId: owner.id,
      userName: 'Owner',
      walletId: await walletIdOf(pool, guardianLogin?.guardianId ?? ''),
      reference: randomUUID(),
      requestHash: 'hash',
      moneyAccountId: account.id,
      ledgerAccountId: rows[0]?.ledger_account_id ?? '',
      accountCampusId: null,
      method: 'cash',
      amountMinor: 1000,
      receivedOn: '2026-10-07',
      depositorName: null,
      proofFileId: (await uploadWalletProof(api, owner)).id,
      ...overrides,
    }),
  };
};

test.describe('KyselyWalletRepository', () => {
  describeWalletRepositoryContract((title, runScenario) => {
    test(title, async ({ app, api, pool, schools }) => {
      await runScenario(await postgresHarness({ app, api, pool, schools }));
    });
  });
});
