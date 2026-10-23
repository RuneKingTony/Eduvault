import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import {
  WALLET_ACCOUNT_GATEWAY_MESSAGE,
  WALLET_ACCOUNT_METHOD_MESSAGE,
  WALLET_ACCOUNT_NOT_FOUND_MESSAGE,
  WALLET_ACCOUNT_RETIRED_MESSAGE,
  WALLET_FUTURE_DATE_MESSAGE,
  WALLET_METHOD_OFF_MESSAGE,
  WALLET_NOT_FOUND_MESSAGE,
  WALLET_NOT_PAYING_MESSAGE,
  WALLET_PROOF_NOT_FOUND_MESSAGE,
  WALLET_PROOF_TAKEN_MESSAGE,
  WALLET_REFERENCE_TAKEN_MESSAGE,
  type TopUpWallet,
} from '@eduvault/api-contract';
import type { OrgContext } from '../../common/auth';
import { Clock } from '../../common/clock';
import {
  FakeWalletRepository,
  type FakeWallet,
} from './fake-wallet.repository';
import type { MoneyAccountService } from '../money-account/money-account.service';
import { WalletService } from './wallet.service';

const ORG = 'school-a';
const LEKKI = 'campus-lekki';
const IKEJA = 'campus-ikeja';

const ctxFor = (
  campusScope: OrgContext['campusScope'],
  organizationId = ORG
): OrgContext =>
  ({
    organizationId,
    user: { id: 'clerk', email: 'c@eduvault.test', name: 'Tunde Bakare' },
    campusScope,
  }) as OrgContext;

const everyone = ctxFor('all');
const lekkiOnly = ctxFor([LEKKI]);

const ojo: FakeWallet = {
  id: 'wallet-ojo',
  organizationId: ORG,
  guardianId: 'guardian-ojo',
  userId: 'user-ojo',
  name: 'Mrs Ojo',
  phone: '08012345678',
  paying: true,
  balanceMinor: 0,
  children: [
    {
      studentId: 'ada',
      name: 'Ada Ojo',
      admissionNumber: 'EDU/001',
      campusId: LEKKI,
      owedMinor: 2_000_000,
    },
    {
      studentId: 'tobi',
      name: 'Tobi Ojo',
      admissionNumber: 'EDU/002',
      campusId: IKEJA,
      owedMinor: 1_000_000,
    },
  ],
};

const bello: FakeWallet = {
  ...ojo,
  id: 'wallet-bello',
  guardianId: 'guardian-bello',
  userId: 'user-bello',
  name: 'Mr Bello',
  phone: '08099998888',
  children: [
    {
      studentId: 'musa',
      name: 'Musa Bello',
      admissionNumber: 'EDU/003',
      campusId: IKEJA,
      owedMinor: 500_000,
    },
  ],
};

const topUp: TopUpWallet = {
  reference: 'CSH-20261023-AAAAAA',
  moneyAccountId: 'till',
  method: 'cash',
  amountMinor: 5_000_000,
  receivedOn: '2026-10-23',
  depositorName: undefined,
  proofFileId: 'receipt-1',
};

function setup(...seeded: FakeWallet[]) {
  const repository = new FakeWalletRepository();
  for (const wallet of seeded.length === 0 ? [ojo] : seeded) {
    repository.seed(structuredClone(wallet));
  }
  repository.accounts.set('till', {
    status: 'ok',
    ledgerAccountId: 'ledger-till',
    campusId: LEKKI,
    kind: 'cash',
  });
  repository.proofs.set('receipt-1', 'free');
  const clock = new Clock();
  clock.set('2026-10-23');
  const moneyAccounts = {
    listForRecording: vi
      .fn()
      .mockResolvedValue([{ id: 'till', label: 'Front desk', kind: 'cash' }]),
  };
  return {
    repository,
    service: new WalletService(
      repository,
      clock,
      moneyAccounts as unknown as MoneyAccountService
    ),
  };
}

describe('WalletService.topUp', () => {
  it('records the top-up and answers with the wallet, 201 style (not replayed)', async () => {
    const { repository, service } = setup();
    const recorded = await service.topUp(everyone, ojo.id, topUp);
    expect(recorded).toMatchObject({
      reference: topUp.reference,
      amountMinor: 5_000_000,
      method: 'cash',
      receivedOn: '2026-10-23',
      replayed: false,
    });
    expect(recorded.wallet).toMatchObject({
      balanceMinor: 5_000_000,
      setAsideMinor: 0,
      freeMinor: 5_000_000,
    });
    expect(repository.topUps).toHaveLength(1);
    expect(repository.topUps[0]).toMatchObject({
      organizationId: ORG,
      userId: 'clerk',
      walletId: ojo.id,
      ledgerAccountId: 'ledger-till',
      accountCampusId: LEKKI,
      depositorName: null,
      proofFileId: 'receipt-1',
    });
  });

  it('answers a repeated reference with the same top-up, replayed, and posts once', async () => {
    const { repository, service } = setup();
    const first = await service.topUp(everyone, ojo.id, topUp);
    const again = await service.topUp(everyone, ojo.id, topUp);
    expect(again).toMatchObject({ id: first.id, replayed: true });
    expect(again.wallet.balanceMinor).toBe(5_000_000);
    expect(repository.topUps).toHaveLength(1);
  });

  it('replays when only the receipt file differs, since a retry may upload it again', async () => {
    const { repository, service } = setup();
    repository.proofs.set('receipt-2', 'free');
    await service.topUp(everyone, ojo.id, topUp);
    const again = await service.topUp(everyone, ojo.id, {
      ...topUp,
      proofFileId: 'receipt-2',
    });
    expect(again.replayed).toBe(true);
    expect(repository.topUps).toHaveLength(1);
  });

  it('answers 409 when the same reference comes with a different amount, and records nothing more', async () => {
    const { repository, service } = setup();
    await service.topUp(everyone, ojo.id, topUp);
    const refused = service.topUp(everyone, ojo.id, {
      ...topUp,
      amountMinor: 5_000_001,
    });
    await expect(refused).rejects.toBeInstanceOf(ConflictException);
    await expect(refused).rejects.toThrow(WALLET_REFERENCE_TAKEN_MESSAGE);
    expect(repository.topUps).toHaveLength(1);
  });

  it('answers 409 when the reference belongs to another family’s top-up', async () => {
    const { service } = setup(ojo, bello);
    await service.topUp(everyone, ojo.id, topUp);
    await expect(
      service.topUp(everyone, bello.id, { ...topUp, proofFileId: 'receipt-1' })
    ).rejects.toThrow(WALLET_REFERENCE_TAKEN_MESSAGE);
  });

  it('answers 404 for a wallet that is not in the school or not on the caller’s campuses', async () => {
    const { repository, service } = setup(ojo, bello);
    await expect(
      service.topUp(ctxFor('all', 'school-b'), ojo.id, topUp)
    ).rejects.toThrow(WALLET_NOT_FOUND_MESSAGE);
    await expect(
      service.topUp(lekkiOnly, bello.id, topUp)
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(repository.topUps).toHaveLength(0);
  });

  it('lets a campus member top up a family with any child on their campus', async () => {
    const { service } = setup(ojo);
    const recorded = await service.topUp(lekkiOnly, ojo.id, topUp);
    expect(recorded.replayed).toBe(false);
  });

  it('answers 400 for a family with no paying guardian', async () => {
    const { repository, service } = setup({ ...ojo, paying: false });
    await expect(service.topUp(everyone, ojo.id, topUp)).rejects.toThrow(
      WALLET_NOT_PAYING_MESSAGE
    );
    expect(repository.topUps).toHaveLength(0);
  });

  it('answers 400 for a way of paying that is switched off and for a future date', async () => {
    const { repository, service } = setup();
    repository.methods = { cash: false, transfer: true, pos: true };
    await expect(service.topUp(everyone, ojo.id, topUp)).rejects.toThrow(
      WALLET_METHOD_OFF_MESSAGE
    );
    repository.methods = { cash: true, transfer: true, pos: true };
    await expect(
      service.topUp(everyone, ojo.id, { ...topUp, receivedOn: '2026-10-24' })
    ).rejects.toThrow(WALLET_FUTURE_DATE_MESSAGE);
  });

  it('answers 404, 400, 400 and 400 for a missing, retired, gateway or mismatched account', async () => {
    const { repository, service } = setup();
    const ask = (
      moneyAccountId: string,
      method: TopUpWallet['method'] = 'cash'
    ) => service.topUp(everyone, ojo.id, { ...topUp, moneyAccountId, method });
    await expect(ask('nowhere')).rejects.toThrow(
      new NotFoundException(WALLET_ACCOUNT_NOT_FOUND_MESSAGE)
    );
    repository.accounts.set('old', { status: 'retired' });
    await expect(ask('old')).rejects.toThrow(
      new BadRequestException(WALLET_ACCOUNT_RETIRED_MESSAGE)
    );
    repository.accounts.set('monnify', { status: 'gateway' });
    await expect(ask('monnify')).rejects.toThrow(
      new BadRequestException(WALLET_ACCOUNT_GATEWAY_MESSAGE)
    );
    await expect(ask('till', 'transfer')).rejects.toThrow(
      new BadRequestException(WALLET_ACCOUNT_METHOD_MESSAGE)
    );
    expect(repository.topUps).toHaveLength(0);
  });

  it('answers 404 for a receipt that is not the caller’s upload and 409 for one already attached', async () => {
    const { repository, service } = setup();
    await expect(
      service.topUp(everyone, ojo.id, { ...topUp, proofFileId: 'stranger' })
    ).rejects.toThrow(WALLET_PROOF_NOT_FOUND_MESSAGE);
    repository.proofs.set('receipt-1', 'taken');
    await expect(service.topUp(everyone, ojo.id, topUp)).rejects.toThrow(
      WALLET_PROOF_TAKEN_MESSAGE
    );
    expect(repository.topUps).toHaveLength(0);
  });

  it('answers 409 when the receipt was attached by a request that raced ahead', async () => {
    const { repository, service } = setup();
    vi.spyOn(repository, 'insertTopUp').mockResolvedValue({
      status: 'proof_taken',
    });
    await expect(service.topUp(everyone, ojo.id, topUp)).rejects.toThrow(
      WALLET_PROOF_TAKEN_MESSAGE
    );
  });
});

describe('WalletService.topUpOptions', () => {
  it('offers the accounts that can take money, the ways of paying that are on, and today', async () => {
    const { repository, service } = setup();
    repository.methods = { cash: true, transfer: false, pos: true };
    await expect(service.topUpOptions(everyone)).resolves.toEqual({
      currency: 'NGN',
      today: '2026-10-23',
      accounts: [{ id: 'till', label: 'Front desk', kind: 'cash' }],
      methods: { cash: true, transfer: false, pos: true },
    });
  });
});

describe('WalletService reads', () => {
  it('lists the wallets the caller can see with totals, searching by guardian name or phone', async () => {
    const { repository, service } = setup(ojo, bello);
    await service.topUp(everyone, ojo.id, topUp);
    const all = await service.list(everyone, { page: 1, pageSize: 10 });
    expect(all.currency).toBe('NGN');
    expect(all.items.map((item) => item.guardianName)).toEqual([
      'Mr Bello',
      'Mrs Ojo',
    ]);
    expect(all.totals).toEqual({
      walletCount: 2,
      balanceMinor: 5_000_000,
      setAsideMinor: 0,
      freeMinor: 5_000_000,
    });
    const byName = await service.list(everyone, {
      q: 'ojo',
      page: 1,
      pageSize: 10,
    });
    expect(byName.items.map((item) => item.id)).toEqual([ojo.id]);
    const byPhone = await service.list(everyone, {
      q: '0809999',
      page: 1,
      pageSize: 10,
    });
    expect(byPhone.items.map((item) => item.id)).toEqual([bello.id]);
    expect(repository.topUps).toHaveLength(1);
  });

  it('shows a campus member only the families with a child on their campuses, and 404s the rest', async () => {
    const { service } = setup(ojo, bello);
    const listed = await service.list(lekkiOnly, { page: 1, pageSize: 10 });
    expect(listed.items.map((item) => item.id)).toEqual([ojo.id]);
    expect(listed.totals.walletCount).toBe(1);
    await expect(service.get(lekkiOnly, bello.id)).rejects.toThrow(
      WALLET_NOT_FOUND_MESSAGE
    );
    await expect(
      service.movements(lekkiOnly, bello.id, { page: 1, pageSize: 10 })
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('flags the children on other campuses as out of scope but still counts the whole family', async () => {
    const { service } = setup();
    const wallet = await service.get(lekkiOnly, ojo.id);
    expect(wallet.children.map((child) => [child.name, child.inScope])).toEqual(
      [
        ['Ada Ojo', true],
        ['Tobi Ojo', false],
      ]
    );
  });

  it('shows no wallet from another school', async () => {
    const { service } = setup();
    const foreign = ctxFor('all', 'school-b');
    expect(
      (await service.list(foreign, { page: 1, pageSize: 10 })).items
    ).toEqual([]);
    await expect(service.get(foreign, ojo.id)).rejects.toBeInstanceOf(
      NotFoundException
    );
  });
});
