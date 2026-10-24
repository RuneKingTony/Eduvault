import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  WALLET_NOT_FOUND_MESSAGE,
  WALLET_REFERENCE_TAKEN_MESSAGE,
  WALLET_STUDENT_NOT_FOUND_MESSAGE,
  walletEarmarkReleaseOverMessage,
  walletEarmarkSetOverMessage,
  walletSpendOverMessage,
} from '@eduvault/api-contract';
import type { OrgContext } from '../../common/auth';
import { Clock } from '../../common/clock';
import {
  FakeWalletRepository,
  type FakeWallet,
} from './fake-wallet.repository';
import { WalletPortalService } from './wallet-portal.service';

const ORG = 'school-a';

const ctxOf = (userId: string, organizationId = ORG): OrgContext =>
  ({
    organizationId,
    user: { id: userId, email: `${userId}@eduvault.test`, name: userId },
    campusScope: [],
  }) as unknown as OrgContext;

const ojoUser = ctxOf('user-ojo');
const belloUser = ctxOf('user-bello');

const ojo = (balanceMinor: number): FakeWallet => ({
  id: 'wallet-ojo',
  organizationId: ORG,
  guardianId: 'guardian-ojo',
  userId: 'user-ojo',
  name: 'Mrs Ojo',
  phone: '08012345678',
  paying: true,
  balanceMinor,
  children: [
    {
      studentId: 'ada',
      name: 'Ada Ojo',
      admissionNumber: 'EDU/001',
      campusId: 'lekki',
      owedMinor: 2_000_000,
    },
    {
      studentId: 'tobi',
      name: 'Tobi Ojo',
      admissionNumber: 'EDU/002',
      campusId: 'ikeja',
      owedMinor: 1_000_000,
    },
  ],
});

const bello: FakeWallet = {
  id: 'wallet-bello',
  organizationId: ORG,
  guardianId: 'guardian-bello',
  userId: 'user-bello',
  name: 'Mr Bello',
  phone: '08099998888',
  paying: true,
  balanceMinor: 9_000_000,
  children: [
    {
      studentId: 'musa',
      name: 'Musa Bello',
      admissionNumber: 'EDU/003',
      campusId: 'ikeja',
      owedMinor: 500_000,
    },
  ],
};

function setup(balanceMinor = 2_500_000) {
  const repository = new FakeWalletRepository();
  repository.seed(ojo(balanceMinor));
  repository.seed(structuredClone(bello));
  const clock = new Clock();
  clock.set('2026-10-23');
  return { repository, service: new WalletPortalService(repository, clock) };
}

const spendBody = (
  reference: string,
  ...lines: [studentId: string, amountMinor: number][]
) => ({
  reference,
  lines: lines.map(([studentId, amountMinor]) => ({ studentId, amountMinor })),
});

const markBody = (
  reference: string,
  studentId: string,
  amountMinor: number
) => ({
  reference,
  studentId,
  amountMinor,
});

describe('WalletPortalService.mine', () => {
  it('answers with the signed-in guardian’s own wallet and every linked child', async () => {
    const { service } = setup();
    const wallet = await service.mine(ojoUser);
    expect(wallet).toMatchObject({
      currency: 'NGN',
      id: 'wallet-ojo',
      balanceMinor: 2_500_000,
      setAsideMinor: 0,
      freeMinor: 2_500_000,
    });
    expect(
      wallet.children.map((child) => [child.name, child.spendableMinor])
    ).toEqual([
      ['Ada Ojo', 2_000_000],
      ['Tobi Ojo', 1_000_000],
    ]);
  });

  it('never shows another family’s wallet', async () => {
    const { service } = setup();
    expect((await service.mine(belloUser)).id).toBe('wallet-bello');
  });

  it('answers 404 for a user who is no guardian with a wallet, or in another school', async () => {
    const { service } = setup();
    await expect(service.mine(ctxOf('user-stranger'))).rejects.toThrow(
      new NotFoundException(WALLET_NOT_FOUND_MESSAGE)
    );
    await expect(
      service.mine(ctxOf('user-ojo', 'school-b'))
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('WalletPortalService.spend', () => {
  it('spends an amount per child as one request and answers with the new wallet', async () => {
    const { repository, service } = setup();
    const spent = await service.spend(
      ojoUser,
      spendBody('WSP-1', ['ada', 1_500_000], ['tobi', 500_000])
    );
    expect(spent).toMatchObject({
      reference: 'WSP-1',
      totalMinor: 2_000_000,
      replayed: false,
    });
    expect(spent.wallet.balanceMinor).toBe(500_000);
    expect(
      spent.wallet.children.map((child) => [child.name, child.owedMinor])
    ).toEqual([
      ['Ada Ojo', 500_000],
      ['Tobi Ojo', 500_000],
    ]);
    expect(repository.spends).toHaveLength(1);
    expect(repository.spends[0]).toMatchObject({
      walletId: 'wallet-ojo',
      userId: 'user-ojo',
      spentOn: '2026-10-23',
    });
  });

  it('resolves the guardian from the session, so another family’s child answers 404', async () => {
    const { repository, service } = setup();
    const refused = service.spend(ojoUser, spendBody('WSP-2', ['musa', 100]));
    await expect(refused).rejects.toBeInstanceOf(NotFoundException);
    await expect(refused).rejects.toThrow(WALLET_STUDENT_NOT_FOUND_MESSAGE);
    expect(repository.spends).toHaveLength(0);
  });

  it('refuses a line over what the child owes with 422 and the spendable maximum', async () => {
    const { repository, service } = setup(9_000_000);
    const refused = service.spend(
      ojoUser,
      spendBody('WSP-3', ['ada', 2_000_001])
    );
    await expect(refused).rejects.toBeInstanceOf(UnprocessableEntityException);
    await expect(refused).rejects.toThrow(
      walletSpendOverMessage('Ada Ojo', 2_000_000)
    );
    expect(repository.spends).toHaveLength(0);
  });

  it('refuses a line over the free money, even when the child owes more', async () => {
    const { service } = setup(1_000_000);
    await expect(
      service.spend(ojoUser, spendBody('WSP-4', ['ada', 1_000_001]))
    ).rejects.toThrow(walletSpendOverMessage('Ada Ojo', 1_000_000));
  });

  it('refuses two lines that together need more than the free money, naming what is left for the second', async () => {
    const { repository, service } = setup(1_500_000);
    const refused = service.spend(
      ojoUser,
      spendBody('WSP-5', ['ada', 1_000_000], ['tobi', 600_000])
    );
    await expect(refused).rejects.toThrow(
      walletSpendOverMessage('Tobi Ojo', 500_000)
    );
    expect(repository.spends).toHaveLength(0);
  });

  it('says nothing can be used when the wallet is empty', async () => {
    const { service } = setup(0);
    await expect(
      service.spend(ojoUser, spendBody('WSP-6', ['ada', 1]))
    ).rejects.toThrow(walletSpendOverMessage('Ada Ojo', 0));
  });

  it('answers a repeated reference with the same spend, replayed, and spends once', async () => {
    const { repository, service } = setup();
    const body = spendBody('WSP-7', ['ada', 1_000_000]);
    const first = await service.spend(ojoUser, body);
    const again = await service.spend(ojoUser, body);
    expect(again).toMatchObject({ id: first.id, replayed: true });
    expect(again.wallet.balanceMinor).toBe(1_500_000);
    expect(repository.spends).toHaveLength(1);
  });

  it('answers 409 for the same reference with a different amount, or from another family', async () => {
    const { repository, service } = setup();
    await service.spend(ojoUser, spendBody('WSP-8', ['ada', 1_000_000]));
    await expect(
      service.spend(ojoUser, spendBody('WSP-8', ['ada', 900_000]))
    ).rejects.toThrow(new ConflictException(WALLET_REFERENCE_TAKEN_MESSAGE));
    await expect(
      service.spend(belloUser, spendBody('WSP-8', ['musa', 100_000]))
    ).rejects.toBeInstanceOf(ConflictException);
    expect(repository.spends).toHaveLength(1);
  });

  it('uses the child’s earmark first and releases it as it is spent', async () => {
    const { repository, service } = setup(2_500_000);
    await service.setAside(ojoUser, markBody('ERM-1', 'ada', 800_000));
    const spent = await service.spend(
      ojoUser,
      spendBody('WSP-9', ['ada', 1_000_000])
    );
    expect(spent.wallet).toMatchObject({
      balanceMinor: 1_500_000,
      setAsideMinor: 0,
      freeMinor: 1_500_000,
    });
    expect(repository.spends[0]?.split).toEqual([
      {
        studentId: 'ada',
        amountMinor: 1_000_000,
        fromEarmarkMinor: 800_000,
        fromFreeMinor: 200_000,
      },
    ]);
  });
});

describe('WalletPortalService earmarks', () => {
  it('sets money aside for a child and shows it as set aside, not free', async () => {
    const { service } = setup();
    const marked = await service.setAside(
      ojoUser,
      markBody('ERM-2', 'tobi', 600_000)
    );
    expect(marked.replayed).toBe(false);
    expect(marked.wallet).toMatchObject({
      balanceMinor: 2_500_000,
      setAsideMinor: 600_000,
      freeMinor: 1_900_000,
    });
    expect(
      marked.wallet.children.find((child) => child.name === 'Tobi Ojo')
    ).toMatchObject({ earmarkMinor: 600_000, spendableMinor: 1_000_000 });
  });

  it('refuses to set aside more than the free money, naming the most that can be', async () => {
    const { service } = setup();
    await service.setAside(ojoUser, markBody('ERM-3', 'ada', 2_000_000));
    await expect(
      service.setAside(ojoUser, markBody('ERM-4', 'tobi', 500_001))
    ).rejects.toThrow(walletEarmarkSetOverMessage(500_000));
  });

  it('releases money back to free, up to what is set aside for that child', async () => {
    const { service } = setup();
    await service.setAside(ojoUser, markBody('ERM-5', 'ada', 700_000));
    const released = await service.release(
      ojoUser,
      markBody('ERM-6', 'ada', 300_000)
    );
    expect(released.wallet).toMatchObject({
      setAsideMinor: 400_000,
      freeMinor: 2_100_000,
    });
    await expect(
      service.release(ojoUser, markBody('ERM-7', 'ada', 400_001))
    ).rejects.toThrow(walletEarmarkReleaseOverMessage(400_000));
    await expect(
      service.release(ojoUser, markBody('ERM-8', 'tobi', 1))
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('is idempotent by reference: the same request replays, a different one answers 409', async () => {
    const { repository, service } = setup();
    await service.setAside(ojoUser, markBody('ERM-9', 'ada', 700_000));
    const again = await service.setAside(
      ojoUser,
      markBody('ERM-9', 'ada', 700_000)
    );
    expect(again.replayed).toBe(true);
    expect(again.wallet.setAsideMinor).toBe(700_000);
    expect(repository.earmarks).toHaveLength(1);
    await expect(
      service.setAside(ojoUser, markBody('ERM-9', 'ada', 100_000))
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      service.release(ojoUser, markBody('ERM-9', 'ada', 700_000))
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('answers 404 for a child who is not the guardian’s', async () => {
    const { repository, service } = setup();
    await expect(
      service.setAside(ojoUser, markBody('ERM-10', 'musa', 1))
    ).rejects.toThrow(WALLET_STUDENT_NOT_FOUND_MESSAGE);
    await expect(
      service.release(ojoUser, markBody('ERM-11', 'musa', 1))
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(repository.earmarks).toHaveLength(0);
  });
});

describe('WalletPortalService auto-pay', () => {
  it('is off until the guardian turns it on, and reads back as the wallet', async () => {
    const { service } = setup();
    expect((await service.mine(ojoUser)).autoPay).toBe(false);
    const on = await service.setAutoPay(ojoUser, {
      enabled: true,
      reference: 'APY-1',
    });
    expect(on.autoPay).toBe(true);
    const off = await service.setAutoPay(ojoUser, {
      enabled: false,
      reference: 'APY-2',
    });
    expect(off.autoPay).toBe(false);
  });

  it('is idempotent by reference: the same request replays, a different one answers 409', async () => {
    const { repository, service } = setup();
    await service.setAutoPay(ojoUser, { enabled: true, reference: 'APY-3' });
    const again = await service.setAutoPay(ojoUser, {
      enabled: true,
      reference: 'APY-3',
    });
    expect(again.autoPay).toBe(true);
    expect(repository.autoPays).toHaveLength(1);
    await expect(
      service.setAutoPay(ojoUser, { enabled: false, reference: 'APY-3' })
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('keeps another guardian’s switch to itself', async () => {
    const { service } = setup();
    await service.setAutoPay(ojoUser, { enabled: true, reference: 'APY-4' });
    expect((await service.mine(belloUser)).autoPay).toBe(false);
  });

  it('answers 404 when the user has no wallet', async () => {
    const { service } = setup();
    await expect(
      service.setAutoPay(ctxOf('user-nobody'), {
        enabled: true,
        reference: 'APY-5',
      })
    ).rejects.toThrow(WALLET_NOT_FOUND_MESSAGE);
  });
});

describe('WalletPortalService movements', () => {
  const query = { page: 1, pageSize: 10 };

  it('lists the signed-in guardian’s movements with the school currency', async () => {
    const { service } = setup();
    expect(await service.movements(ojoUser, query)).toEqual({
      currency: 'NGN',
      items: [],
      total: 0,
    });
  });

  it('answers 404 for a user with no wallet', async () => {
    const { service } = setup();
    await expect(
      service.movements(ctxOf('user-nobody'), query)
    ).rejects.toThrow(WALLET_NOT_FOUND_MESSAGE);
    await expect(
      service.movements(ctxOf('user-ojo', 'school-b'), query)
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
