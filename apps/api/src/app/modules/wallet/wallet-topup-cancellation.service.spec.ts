import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  WALLET_CANCEL_EXISTS_MESSAGE,
  WALLET_CANCEL_ONLINE_MESSAGE,
  WALLET_NOT_FOUND_MESSAGE,
  WALLET_REFERENCE_TAKEN_MESSAGE,
  WALLET_REQUEST_MONEY_GONE_MESSAGE,
  WALLET_REQUEST_NOT_FOUND_MESSAGE,
  WALLET_TOPUP_NOT_FOUND_MESSAGE,
  walletCancelOverMessage,
  type RequestWalletCancellation,
} from '@eduvault/api-contract';
import type { OrgContext } from '../../common/auth';
import { Clock } from '../../common/clock';
import type { MoneyAccountService } from '../money-account/money-account.service';
import {
  FakeWalletRepository,
  type FakeWallet,
} from './fake-wallet.repository';
import { WalletTopUpCancellationService } from './wallet-topup-cancellation.service';
import { WalletService } from './wallet.service';

const ORG = 'school-a';
const LEKKI = 'campus-lekki';
const IKEJA = 'campus-ikeja';

const ctxFor = (
  userId: string,
  options: { campusScope?: OrgContext['campusScope']; isOwner?: boolean } = {}
): OrgContext =>
  ({
    organizationId: ORG,
    user: { id: userId, email: `${userId}@eduvault.test`, name: userId },
    campusScope: options.campusScope ?? 'all',
    isOwner: options.isOwner ?? false,
    acting: null,
    permissions: {},
  }) as unknown as OrgContext;

const bursar = ctxFor('bursar');
const principal = ctxFor('principal');
const owner = ctxFor('owner', { isOwner: true });

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
  ],
};

const body: RequestWalletCancellation = {
  reference: 'WTQ-20261026-AAAAAA',
  reason: 'Keyed against the wrong family',
};

async function setup() {
  const repository = new FakeWalletRepository();
  repository.seed(structuredClone(ojo));
  repository.proofs.set('receipt-1', 'free');
  const clock = new Clock();
  clock.set('2026-10-26');
  const moneyAccounts = {
    listForRecording: vi.fn().mockResolvedValue([]),
  } as unknown as MoneyAccountService;
  const wallets = new WalletService(repository, clock, moneyAccounts);
  const recorded = await repository.insertTopUp({
    organizationId: ORG,
    userId: 'clerk',
    userName: 'clerk',
    walletId: ojo.id,
    reference: 'CSH-20261023-AAAAAA',
    requestHash: 'hash',
    moneyAccountId: 'till',
    ledgerAccountId: 'ledger-till',
    accountCampusId: null,
    method: 'cash',
    amountMinor: 3_000_000,
    receivedOn: '2026-10-23',
    depositorName: null,
    proofFileId: 'receipt-1',
  });
  if (recorded.status !== 'recorded') {
    throw new Error('The top-up was not recorded');
  }
  return {
    repository,
    wallets,
    topUpId: recorded.id,
    service: new WalletTopUpCancellationService(repository, wallets, clock),
  };
}

describe('WalletTopUpCancellationService.request', () => {
  it('holds the top-up’s amount and leaves the balance alone', async () => {
    const { service, topUpId } = await setup();
    const made = await service.request(
      bursar,
      { walletId: ojo.id, topUpId },
      body
    );
    expect(made.replayed).toBe(false);
    expect(made.request).toMatchObject({
      kind: 'wallet_topup_cancellation',
      status: 'submitted',
      amountMinor: 3_000_000,
      topUp: { id: topUpId, reference: 'CSH-20261023-AAAAAA' },
    });
    expect(made.wallet).toMatchObject({
      balanceMinor: 3_000_000,
      heldMinor: 3_000_000,
      freeMinor: 0,
    });
  });

  it('refuses a Monnify credit with 409, because the gateway has the money', async () => {
    const { repository, service } = await setup();
    repository.onlineTopUps.push({ id: 'online-1', walletId: ojo.id });
    await expect(
      service.request(bursar, { walletId: ojo.id, topUpId: 'online-1' }, body)
    ).rejects.toEqual(new ConflictException(WALLET_CANCEL_ONLINE_MESSAGE));
  });

  it('refuses once the family has spent or set aside part of it, naming what is still free', async () => {
    const { repository, service, topUpId } = await setup();
    await repository.spend({
      organizationId: ORG,
      userId: 'user-ojo',
      userName: 'Mrs Ojo',
      walletId: ojo.id,
      reference: 'WSP-1',
      requestHash: 'spend',
      lines: [{ studentId: 'ada', amountMinor: 800_000 }],
      spentOn: '2026-10-25',
    });
    await expect(
      service.request(bursar, { walletId: ojo.id, topUpId }, body)
    ).rejects.toEqual(
      new UnprocessableEntityException(
        walletCancelOverMessage(3_000_000, 2_200_000)
      )
    );
    expect(repository.requests).toHaveLength(0);
  });

  it('refuses a second cancellation of the same top-up while one waits or is done', async () => {
    const { service, topUpId } = await setup();
    const target = { walletId: ojo.id, topUpId };
    await service.request(bursar, target, body);
    await expect(
      service.request(bursar, target, {
        ...body,
        reference: 'WTQ-20261026-BBBBBB',
      })
    ).rejects.toEqual(new ConflictException(WALLET_CANCEL_EXISTS_MESSAGE));
  });

  it('allows a new request once the first was declined', async () => {
    const { service, topUpId } = await setup();
    const target = { walletId: ojo.id, topUpId };
    const first = await service.request(bursar, target, body);
    await service.decline(principal, first.request.id, 'Not yet');
    await expect(
      service.request(bursar, target, {
        ...body,
        reference: 'WTQ-20261026-BBBBBB',
      })
    ).resolves.toMatchObject({ replayed: false });
  });

  it('answers the same request again with replayed and holds once', async () => {
    const { repository, service, topUpId } = await setup();
    const target = { walletId: ojo.id, topUpId };
    const first = await service.request(bursar, target, body);
    const again = await service.request(bursar, target, body);
    expect(again).toMatchObject({ replayed: true });
    expect(again.request.id).toBe(first.request.id);
    expect(repository.requests).toHaveLength(1);
  });

  it('refuses the same reference with another reason', async () => {
    const { service, topUpId } = await setup();
    const target = { walletId: ojo.id, topUpId };
    await service.request(bursar, target, body);
    await expect(
      service.request(bursar, target, { ...body, reason: 'Another reason' })
    ).rejects.toEqual(new ConflictException(WALLET_REFERENCE_TAKEN_MESSAGE));
  });

  it('answers 404 for a wallet the caller cannot see and for a top-up that is not on it', async () => {
    const { service, topUpId } = await setup();
    await expect(
      service.request(
        ctxFor('ikeja', { campusScope: [IKEJA] }),
        { walletId: ojo.id, topUpId },
        body
      )
    ).rejects.toEqual(new NotFoundException(WALLET_NOT_FOUND_MESSAGE));
    await expect(
      service.request(bursar, { walletId: ojo.id, topUpId: 'nope' }, body)
    ).rejects.toEqual(new NotFoundException(WALLET_TOPUP_NOT_FOUND_MESSAGE));
  });
});

describe('WalletTopUpCancellationService.approve', () => {
  it('reverses the top-up when someone else approves', async () => {
    const { service, wallets, topUpId } = await setup();
    const { request } = await service.request(
      bursar,
      { walletId: ojo.id, topUpId },
      body
    );
    await expect(service.approve(principal, request.id)).resolves.toMatchObject(
      { status: 'approved', decidedBy: 'principal' }
    );
    expect(await wallets.get(principal, ojo.id)).toMatchObject({
      balanceMinor: 0,
      heldMinor: 0,
      freeMinor: 0,
    });
  });

  it('refuses the requester deciding their own request, but not an owner', async () => {
    const { service, topUpId } = await setup();
    const own = await service.request(
      bursar,
      { walletId: ojo.id, topUpId },
      body
    );
    await expect(service.approve(bursar, own.request.id)).rejects.toMatchObject(
      { response: { code: 'SelfApproval' } }
    );
  });

  it('lets an owner decide their own request', async () => {
    const { service, topUpId } = await setup();
    const { request } = await service.request(
      owner,
      { walletId: ojo.id, topUpId },
      body
    );
    await expect(service.approve(owner, request.id)).resolves.toMatchObject({
      status: 'approved',
    });
  });

  it('answers 409 AlreadyDecided on a second decision', async () => {
    const { service, topUpId } = await setup();
    const { request } = await service.request(
      bursar,
      { walletId: ojo.id, topUpId },
      body
    );
    await service.approve(principal, request.id);
    await expect(
      service.approve(ctxFor('other'), request.id)
    ).rejects.toMatchObject({ response: { code: 'AlreadyDecided' } });
  });

  it('answers 422 when the money is gone and leaves the request waiting', async () => {
    const { repository, service, topUpId } = await setup();
    const { request } = await service.request(
      bursar,
      { walletId: ojo.id, topUpId },
      body
    );
    repository.wallets[0]!.balanceMinor = 1_000_000;
    await expect(service.approve(principal, request.id)).rejects.toEqual(
      new UnprocessableEntityException(WALLET_REQUEST_MONEY_GONE_MESSAGE)
    );
    expect(repository.requests[0]?.status).toBe('submitted');
  });

  it('answers 404 for a request that is not there', async () => {
    const { service } = await setup();
    await expect(service.approve(principal, 'nope')).rejects.toEqual(
      new NotFoundException(WALLET_REQUEST_NOT_FOUND_MESSAGE)
    );
  });
});

describe('WalletTopUpCancellationService.decline', () => {
  it('needs a reason', async () => {
    const { service, topUpId } = await setup();
    const { request } = await service.request(
      bursar,
      { walletId: ojo.id, topUpId },
      body
    );
    await expect(
      service.decline(principal, request.id, '')
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('releases the hold and keeps the reason', async () => {
    const { service, wallets, topUpId } = await setup();
    const { request } = await service.request(
      bursar,
      { walletId: ojo.id, topUpId },
      body
    );
    await expect(
      service.decline(principal, request.id, 'Already used')
    ).resolves.toMatchObject({
      status: 'rejected',
      rejectionReason: 'Already used',
    });
    expect(await wallets.get(principal, ojo.id)).toMatchObject({
      balanceMinor: 3_000_000,
      heldMinor: 0,
      freeMinor: 3_000_000,
    });
  });

  it('answers 409 AlreadyDecided after an approval', async () => {
    const { service, topUpId } = await setup();
    const { request } = await service.request(
      bursar,
      { walletId: ojo.id, topUpId },
      body
    );
    await service.approve(principal, request.id);
    await expect(
      service.decline(ctxFor('other'), request.id, 'Late')
    ).rejects.toMatchObject({ response: { code: 'AlreadyDecided' } });
  });
});
