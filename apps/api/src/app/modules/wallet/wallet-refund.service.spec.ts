import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  WALLET_ACCOUNT_NOT_FOUND_MESSAGE,
  WALLET_ACCOUNT_RETIRED_MESSAGE,
  WALLET_NOT_FOUND_MESSAGE,
  WALLET_PAYOUT_REFERENCE_TAKEN_MESSAGE,
  WALLET_REFERENCE_TAKEN_MESSAGE,
  WALLET_REFUND_ACCOUNT_MESSAGE,
  WALLET_REFUND_PAYOUT_ACCOUNT_MESSAGE,
  WALLET_REFUND_PROOF_NOT_FOUND_MESSAGE,
  WALLET_REFUND_PROOF_TAKEN_MESSAGE,
  WALLET_REQUEST_MONEY_GONE_MESSAGE,
  WALLET_REQUEST_NOT_FOUND_MESSAGE,
  walletRefundOverMessage,
  type RequestWalletRefund,
} from '@eduvault/api-contract';
import type { OrgContext } from '../../common/auth';
import { Clock } from '../../common/clock';
import type { MoneyAccountService } from '../money-account/money-account.service';
import {
  FakeWalletRepository,
  type FakeWallet,
} from './fake-wallet.repository';
import { WalletRefundService } from './wallet-refund.service';
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
  balanceMinor: 5_000_000,
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

const request: RequestWalletRefund = {
  reference: 'WRQ-20261026-AAAAAA',
  moneyAccountId: 'bank',
  amountMinor: 1_500_000,
  parentEmail: 'ada.parent@example.com',
  reason: 'Paid twice by mistake',
  proofFileId: 'email-1',
};

function setup() {
  const repository = new FakeWalletRepository();
  repository.seed(structuredClone(ojo));
  repository.accounts.set('bank', {
    status: 'ok',
    ledgerAccountId: 'ledger-bank',
    campusId: null,
    kind: 'bank',
  });
  repository.accounts.set('till', {
    status: 'ok',
    ledgerAccountId: 'ledger-till',
    campusId: null,
    kind: 'cash',
  });
  repository.proofs.set('email-1', 'free');
  repository.proofs.set('email-2', 'free');
  const clock = new Clock();
  clock.set('2026-10-26');
  const moneyAccounts = {
    listForRecording: vi.fn().mockResolvedValue([
      { id: 'bank', label: 'GTBank', kind: 'bank' },
      { id: 'till', label: 'Front desk', kind: 'cash' },
    ]),
  } as unknown as MoneyAccountService;
  const wallets = new WalletService(repository, clock, moneyAccounts);
  return {
    repository,
    service: new WalletRefundService(repository, wallets, clock),
    wallets,
  };
}

const waiting = async (
  service: WalletRefundService,
  body: Partial<RequestWalletRefund> = {}
) => (await service.request(bursar, ojo.id, { ...request, ...body })).request;

describe('WalletRefundService.request', () => {
  it('holds the amount out of free money and leaves the balance alone', async () => {
    const { service } = setup();
    const made = await service.request(bursar, ojo.id, request);
    expect(made.replayed).toBe(false);
    expect(made.request).toMatchObject({
      kind: 'wallet_refund',
      status: 'submitted',
      amountMinor: 1_500_000,
      parentEmail: 'ada.parent@example.com',
      createdBy: 'bursar',
      payoutReference: null,
    });
    expect(made.wallet).toMatchObject({
      balanceMinor: 5_000_000,
      heldMinor: 1_500_000,
      freeMinor: 3_500_000,
    });
  });

  it('refuses more than the free money and names the most that can be refunded', async () => {
    const { service } = setup();
    await expect(
      service.request(bursar, ojo.id, { ...request, amountMinor: 5_000_001 })
    ).rejects.toEqual(
      new UnprocessableEntityException(walletRefundOverMessage(5_000_000))
    );
  });

  it('counts money a waiting request already holds, so the same money is not refunded twice', async () => {
    const { service } = setup();
    await waiting(service, { amountMinor: 4_000_000 });
    await expect(
      service.request(bursar, ojo.id, {
        ...request,
        reference: 'WRQ-20261026-BBBBBB',
        proofFileId: 'email-2',
        amountMinor: 1_000_001,
      })
    ).rejects.toEqual(
      new UnprocessableEntityException(walletRefundOverMessage(1_000_000))
    );
  });

  it('does not count money set aside for a child as free', async () => {
    const { repository, service } = setup();
    await repository.earmark({
      organizationId: ORG,
      userId: 'guardian',
      userName: 'Mrs Ojo',
      walletId: ojo.id,
      kind: 'set',
      reference: 'WSA-1',
      studentId: 'ada',
      amountMinor: 2_000_000,
    });
    await expect(
      service.request(bursar, ojo.id, { ...request, amountMinor: 3_000_001 })
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    await expect(
      service.request(bursar, ojo.id, { ...request, amountMinor: 3_000_000 })
    ).resolves.toMatchObject({ replayed: false });
  });

  it('answers the same request again with 200 style replayed and holds once', async () => {
    const { repository, service } = setup();
    const first = await service.request(bursar, ojo.id, request);
    const again = await service.request(bursar, ojo.id, request);
    expect(again).toMatchObject({ replayed: true });
    expect(again.request.id).toBe(first.request.id);
    expect(repository.requests).toHaveLength(1);
    expect(again.wallet.heldMinor).toBe(1_500_000);
  });

  it('replays when only the attached email file differs', async () => {
    const { repository, service } = setup();
    await service.request(bursar, ojo.id, request);
    const again = await service.request(bursar, ojo.id, {
      ...request,
      proofFileId: 'email-2',
    });
    expect(again.replayed).toBe(true);
    expect(repository.requests).toHaveLength(1);
  });

  it('refuses the same reference with another body', async () => {
    const { service } = setup();
    await service.request(bursar, ojo.id, request);
    await expect(
      service.request(bursar, ojo.id, { ...request, amountMinor: 1000 })
    ).rejects.toEqual(new ConflictException(WALLET_REFERENCE_TAKEN_MESSAGE));
  });

  it('answers 404 for a wallet the caller cannot see', async () => {
    const { service } = setup();
    await expect(
      service.request(
        ctxFor('ikeja-bursar', { campusScope: [IKEJA] }),
        ojo.id,
        request
      )
    ).rejects.toEqual(new NotFoundException(WALLET_NOT_FOUND_MESSAGE));
    await expect(
      service.request(bursar, 'wallet-missing', request)
    ).rejects.toEqual(new NotFoundException(WALLET_NOT_FOUND_MESSAGE));
  });

  it.each([
    ['a cash account', 'till'],
    ['a gateway account', 'gateway'],
  ])('refuses %s: a refund leaves from a bank account', async (_name, id) => {
    const { repository, service } = setup();
    repository.accounts.set('gateway', { status: 'gateway' });
    await expect(
      service.request(bursar, ojo.id, { ...request, moneyAccountId: id })
    ).rejects.toEqual(new BadRequestException(WALLET_REFUND_ACCOUNT_MESSAGE));
  });

  it('refuses a retired account and answers 404 for an unknown one', async () => {
    const { repository, service } = setup();
    repository.accounts.set('old', { status: 'retired' });
    await expect(
      service.request(bursar, ojo.id, { ...request, moneyAccountId: 'old' })
    ).rejects.toEqual(new BadRequestException(WALLET_ACCOUNT_RETIRED_MESSAGE));
    await expect(
      service.request(bursar, ojo.id, { ...request, moneyAccountId: 'nope' })
    ).rejects.toEqual(new NotFoundException(WALLET_ACCOUNT_NOT_FOUND_MESSAGE));
  });

  it('needs the parent’s email attached once only', async () => {
    const { repository, service } = setup();
    await expect(
      service.request(bursar, ojo.id, { ...request, proofFileId: 'unknown' })
    ).rejects.toEqual(
      new NotFoundException(WALLET_REFUND_PROOF_NOT_FOUND_MESSAGE)
    );
    repository.proofs.set('email-2', 'taken');
    await expect(
      service.request(bursar, ojo.id, { ...request, proofFileId: 'email-2' })
    ).rejects.toEqual(new ConflictException(WALLET_REFUND_PROOF_TAKEN_MESSAGE));
    expect(repository.requests).toHaveLength(0);
  });
});

describe('WalletRefundService.approve', () => {
  it('lets someone else approve: the payout reference is kept and the balance falls', async () => {
    const { service, wallets } = setup();
    const { id } = await waiting(service);
    const approved = await service.approve(principal, id, {
      payoutReference: 'NIP-8841',
    });
    expect(approved).toMatchObject({
      status: 'approved',
      payoutReference: 'NIP-8841',
      decidedBy: 'principal',
    });
    expect(await wallets.get(principal, ojo.id)).toMatchObject({
      balanceMinor: 3_500_000,
      heldMinor: 0,
      freeMinor: 3_500_000,
    });
  });

  it('refuses the requester deciding their own request with 409 SelfApproval', async () => {
    const { service } = setup();
    const { id } = await waiting(service);
    await expect(
      service.approve(bursar, id, { payoutReference: 'NIP-1' })
    ).rejects.toMatchObject({
      response: { code: 'SelfApproval' },
    });
  });

  it('lets an owner decide their own request', async () => {
    const { service } = setup();
    const { id } = (await service.request(owner, ojo.id, request)).request;
    await expect(
      service.approve(owner, id, { payoutReference: 'NIP-2' })
    ).resolves.toMatchObject({ status: 'approved' });
  });

  it('answers 409 AlreadyDecided on a second decision and pays once', async () => {
    const { service, wallets } = setup();
    const { id } = await waiting(service);
    await service.approve(principal, id, { payoutReference: 'NIP-3' });
    await expect(
      service.approve(ctxFor('other'), id, { payoutReference: 'NIP-4' })
    ).rejects.toMatchObject({ response: { code: 'AlreadyDecided' } });
    expect((await wallets.get(principal, ojo.id)).balanceMinor).toBe(3_500_000);
  });

  it('answers 422 when the money is gone and leaves the request waiting for a decline', async () => {
    const { repository, service } = setup();
    const { id } = await waiting(service);
    repository.wallets[0]!.balanceMinor = 1_000_000;
    await expect(
      service.approve(principal, id, { payoutReference: 'NIP-5' })
    ).rejects.toEqual(
      new UnprocessableEntityException(WALLET_REQUEST_MONEY_GONE_MESSAGE)
    );
    expect(repository.requests[0]?.status).toBe('submitted');
    await expect(
      service.decline(principal, id, 'Money was spent')
    ).resolves.toMatchObject({ status: 'rejected' });
  });

  it('answers 422 when the chosen bank account can no longer pay out', async () => {
    const { repository, service } = setup();
    const { id } = await waiting(service);
    repository.accounts.set('bank', { status: 'retired' });
    await expect(
      service.approve(principal, id, { payoutReference: 'NIP-6' })
    ).rejects.toEqual(
      new UnprocessableEntityException(WALLET_REFUND_PAYOUT_ACCOUNT_MESSAGE)
    );
  });

  it('refuses a payout reference another refund already holds', async () => {
    const { service } = setup();
    const first = await waiting(service, { amountMinor: 1_000_000 });
    const second = await waiting(service, {
      reference: 'WRQ-20261026-BBBBBB',
      proofFileId: 'email-2',
      amountMinor: 1_000_000,
    });
    await service.approve(principal, first.id, { payoutReference: 'NIP-7' });
    await expect(
      service.approve(principal, second.id, { payoutReference: 'NIP-7' })
    ).rejects.toEqual(
      new ConflictException(WALLET_PAYOUT_REFERENCE_TAKEN_MESSAGE)
    );
  });

  it('answers 404 for a request that is not there', async () => {
    const { service } = setup();
    await expect(
      service.approve(principal, 'nope', { payoutReference: 'NIP-8' })
    ).rejects.toEqual(new NotFoundException(WALLET_REQUEST_NOT_FOUND_MESSAGE));
  });

  it('answers 404 for a request on a wallet the caller cannot see', async () => {
    const { service } = setup();
    const { id } = await waiting(service);
    await expect(
      service.approve(ctxFor('ikeja', { campusScope: [IKEJA] }), id, {
        payoutReference: 'NIP-9',
      })
    ).rejects.toEqual(new NotFoundException(WALLET_REQUEST_NOT_FOUND_MESSAGE));
  });
});

describe('WalletRefundService.decline', () => {
  it('needs a reason', async () => {
    const { service } = setup();
    const { id } = await waiting(service);
    await expect(service.decline(principal, id, '  ')).rejects.toBeInstanceOf(
      BadRequestException
    );
  });

  it('releases the hold and keeps the reason', async () => {
    const { service, wallets } = setup();
    const { id } = await waiting(service);
    const declined = await service.decline(
      principal,
      id,
      'No such overpayment'
    );
    expect(declined).toMatchObject({
      status: 'rejected',
      rejectionReason: 'No such overpayment',
    });
    expect(await wallets.get(principal, ojo.id)).toMatchObject({
      balanceMinor: 5_000_000,
      heldMinor: 0,
      freeMinor: 5_000_000,
    });
  });

  it('lets the money be asked for again once declined', async () => {
    const { service } = setup();
    const { id } = await waiting(service, { amountMinor: 5_000_000 });
    await service.decline(principal, id, 'Wrong amount');
    await expect(
      service.request(bursar, ojo.id, {
        ...request,
        reference: 'WRQ-20261026-BBBBBB',
        proofFileId: 'email-2',
        amountMinor: 5_000_000,
      })
    ).resolves.toMatchObject({ replayed: false });
  });

  it('refuses the requester declining their own request unless they own the school', async () => {
    const { service } = setup();
    const { id } = await waiting(service);
    await expect(
      service.decline(bursar, id, 'Changed my mind')
    ).rejects.toMatchObject({
      response: { code: 'SelfApproval' },
    });
  });

  it('answers 409 AlreadyDecided after an approval', async () => {
    const { service } = setup();
    const { id } = await waiting(service);
    await service.approve(principal, id, { payoutReference: 'NIP-10' });
    await expect(
      service.decline(ctxFor('other'), id, 'Too late')
    ).rejects.toMatchObject({ response: { code: 'AlreadyDecided' } });
  });
});
