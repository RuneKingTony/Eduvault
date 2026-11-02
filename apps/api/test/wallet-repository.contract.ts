import type {
  NewCancellationRequest,
  NewCreditMigration,
  NewEarmark,
  NewRefundRequest,
  NewSpend,
  NewTopUp,
  WalletRepository,
} from '../src/app/modules/wallet/wallet.repository';
import type { OrgScope } from '../src/app/common/scope';
import { expect } from './support/base-test';

export const OWED = 2_000_000;
const TOP_UP = 3_000_000;

export interface WalletHarness {
  repository: WalletRepository;
  scope: OrgScope;
  organizationId: string;
  userId: string;
  userName: string;
  walletId: string;
  children: readonly [string, string];
  newTopUp: (overrides?: Partial<NewTopUp>) => Promise<NewTopUp>;
  newRefund: (
    overrides?: Partial<NewRefundRequest>
  ) => Promise<NewRefundRequest>;
  giveCredit: (index: 0 | 1, amountMinor: number) => Promise<void>;
}

type TestFn = (
  title: string,
  run: (harness: WalletHarness) => Promise<void>
) => unknown;

let sequence = 0;
const nextReference = (prefix: string): string => {
  sequence += 1;
  return `${prefix}-CONTRACT-${String(sequence).padStart(4, '0')}`;
};

const view = async (harness: WalletHarness) => {
  const found = await harness.repository.findWallet(
    harness.scope,
    harness.walletId
  );
  if (found === undefined) {
    throw new Error('The wallet is not visible');
  }
  return found;
};

const childOf = async (harness: WalletHarness, index: 0 | 1) => {
  const wallet = await view(harness);
  const child = wallet.children.find(
    (row) => row.studentId === harness.children[index]
  );
  if (child === undefined) {
    throw new Error('The child is not on the wallet');
  }
  return child;
};

const fund = async (harness: WalletHarness, amountMinor = TOP_UP) =>
  harness.repository.insertTopUp(
    await harness.newTopUp({
      reference: nextReference('CSH'),
      amountMinor,
    })
  );

const spendBody = (
  harness: WalletHarness,
  lines: [index: 0 | 1, amountMinor: number][],
  reference = nextReference('WSP')
): NewSpend => ({
  organizationId: harness.organizationId,
  userId: harness.userId,
  userName: harness.userName,
  walletId: harness.walletId,
  reference,
  requestHash: JSON.stringify(lines),
  lines: lines.map(([index, amountMinor]) => ({
    studentId: harness.children[index],
    amountMinor,
  })),
  spentOn: '2026-10-07',
});

const markBody = (
  harness: WalletHarness,
  mark: {
    kind: 'set' | 'release';
    index: 0 | 1;
    amountMinor: number;
    reference?: string;
  }
): NewEarmark => ({
  organizationId: harness.organizationId,
  userId: harness.userId,
  userName: harness.userName,
  walletId: harness.walletId,
  kind: mark.kind,
  reference: mark.reference ?? nextReference('ERM'),
  studentId: harness.children[mark.index],
  amountMinor: mark.amountMinor,
});

const migrationBody = (
  harness: WalletHarness,
  reviewed: { expectedFamilies: number; expectedTotalMinor: number }
): NewCreditMigration => ({
  organizationId: harness.organizationId,
  userId: harness.userId,
  userName: harness.userName,
  today: '2026-10-07',
  ...reviewed,
});

export function describeWalletRepositoryContract(test: TestFn): void {
  test('tells whether a wallet is in scope without building its view, and sums what is set aside', async (harness) => {
    expect(
      await harness.repository.walletInScope(harness.scope, harness.walletId)
    ).toBe(true);
    expect(
      await harness.repository.walletInScope(
        harness.scope,
        '00000000-0000-4000-8000-000000000000'
      )
    ).toBe(false);

    await fund(harness);
    await harness.repository.earmark(
      markBody(harness, { kind: 'set', index: 0, amountMinor: 100_000 })
    );
    await harness.repository.earmark(
      markBody(harness, { kind: 'set', index: 1, amountMinor: 250_000 })
    );

    expect((await view(harness)).setAsideMinor).toBe(350_000);
  });

  test('records a top-up once: the same request replays, a changed one clashes, a used receipt is refused', async (harness) => {
    const input = await harness.newTopUp({
      reference: nextReference('CSH'),
      amountMinor: TOP_UP,
    });
    const first = await harness.repository.insertTopUp(input);
    expect(first).toMatchObject({ status: 'recorded' });

    const again = await harness.repository.insertTopUp(input);
    expect(again).toEqual({
      status: 'replayed',
      id: 'id' in first ? first.id : '',
    });
    await expect(
      harness.repository.insertTopUp({ ...input, requestHash: 'another' })
    ).resolves.toEqual({ status: 'reference_used' });
    await expect(
      harness.repository.insertTopUp(
        await harness.newTopUp({
          reference: nextReference('CSH'),
          proofFileId: input.proofFileId,
        })
      )
    ).resolves.toEqual({ status: 'proof_taken' });
    expect((await view(harness)).balanceMinor).toBe(TOP_UP);
  });

  test('finds a top-up and a spend by reference with their wallet and request hash', async (harness) => {
    const input = await harness.newTopUp({ reference: nextReference('CSH') });
    const recorded = await harness.repository.insertTopUp(input);
    await expect(
      harness.repository.findTopUp(harness.organizationId, input.reference)
    ).resolves.toEqual({
      id: 'id' in recorded ? recorded.id : '',
      walletId: harness.walletId,
      requestHash: input.requestHash,
    });
    await expect(
      harness.repository.findTopUp(harness.organizationId, 'NEVER-USED')
    ).resolves.toBeUndefined();

    await fund(harness);
    const spend = spendBody(harness, [[0, 100_000]]);
    const spent = await harness.repository.spend(spend);
    await expect(
      harness.repository.findSpend(harness.organizationId, spend.reference)
    ).resolves.toEqual({
      id: 'id' in spent ? spent.id : '',
      walletId: harness.walletId,
      requestHash: spend.requestHash,
    });
  });

  test('spends an amount per child: the balance and what each child owes both fall', async (harness) => {
    await fund(harness);
    const outcome = await harness.repository.spend(
      spendBody(harness, [
        [0, 1_200_000],
        [1, 300_000],
      ])
    );
    expect(outcome.status).toBe('spent');

    expect(await view(harness)).toMatchObject({
      balanceMinor: TOP_UP - 1_500_000,
      freeMinor: TOP_UP - 1_500_000,
    });
    expect((await childOf(harness, 0)).owedMinor).toBe(OWED - 1_200_000);
    expect((await childOf(harness, 1)).owedMinor).toBe(OWED - 300_000);
  });

  test('replays the same spend, refuses a changed one, and spends once', async (harness) => {
    await fund(harness);
    const spend = spendBody(harness, [[0, 500_000]]);
    const first = await harness.repository.spend(spend);
    await expect(harness.repository.spend(spend)).resolves.toEqual({
      status: 'replayed',
      id: 'id' in first ? first.id : '',
    });
    await expect(
      harness.repository.spend({ ...spend, requestHash: 'another' })
    ).resolves.toEqual({ status: 'reference_used' });
    expect((await view(harness)).balanceMinor).toBe(TOP_UP - 500_000);
  });

  test('refuses a reference a top-up already holds, in either order', async (harness) => {
    await fund(harness);
    const topUp = await harness.newTopUp({ reference: nextReference('CSH') });
    await harness.repository.insertTopUp(topUp);
    await expect(
      harness.repository.spend(spendBody(harness, [[0, 1000]], topUp.reference))
    ).resolves.toEqual({ status: 'reference_used' });

    const spend = spendBody(harness, [[0, 1000]]);
    await harness.repository.spend(spend);
    await expect(
      harness.repository.insertTopUp(
        await harness.newTopUp({ reference: spend.reference })
      )
    ).resolves.toEqual({ status: 'reference_used' });
  });

  test('refuses a line over the free money, naming the most the child can use, and changes nothing', async (harness) => {
    await fund(harness, 1_000_000);
    await expect(
      harness.repository.spend(spendBody(harness, [[0, 1_000_001]]))
    ).resolves.toEqual({
      status: 'over',
      studentId: harness.children[0],
      spendableMinor: 1_000_000,
    });
    expect((await view(harness)).balanceMinor).toBe(1_000_000);
    expect((await childOf(harness, 0)).owedMinor).toBe(OWED);
  });

  test('refuses a line over what the child owes even when the wallet holds more', async (harness) => {
    await fund(harness, 9_000_000);
    await expect(
      harness.repository.spend(spendBody(harness, [[1, OWED + 1]]))
    ).resolves.toEqual({
      status: 'over',
      studentId: harness.children[1],
      spendableMinor: OWED,
    });
  });

  test('shares the free money across the lines of one spend', async (harness) => {
    await fund(harness, 2_500_000);
    await expect(
      harness.repository.spend(
        spendBody(harness, [
          [0, 2_000_000],
          [1, 600_000],
        ])
      )
    ).resolves.toEqual({
      status: 'over',
      studentId: harness.children[1],
      spendableMinor: 500_000,
    });
    expect((await view(harness)).balanceMinor).toBe(2_500_000);
  });

  test('sets money aside up to the free money and shows it as set aside, not free', async (harness) => {
    await fund(harness);
    await expect(
      harness.repository.earmark(
        markBody(harness, { kind: 'set', index: 0, amountMinor: 2_000_000 })
      )
    ).resolves.toEqual({ status: 'applied' });
    expect(await view(harness)).toMatchObject({
      balanceMinor: TOP_UP,
      setAsideMinor: 2_000_000,
      freeMinor: 1_000_000,
    });
    await expect(
      harness.repository.earmark(
        markBody(harness, { kind: 'set', index: 1, amountMinor: 1_000_001 })
      )
    ).resolves.toEqual({ status: 'over', limitMinor: 1_000_000 });
  });

  test('releases no more than is set aside for that child', async (harness) => {
    await fund(harness);
    await harness.repository.earmark(
      markBody(harness, { kind: 'set', index: 0, amountMinor: 700_000 })
    );
    await expect(
      harness.repository.earmark(
        markBody(harness, { kind: 'release', index: 0, amountMinor: 700_001 })
      )
    ).resolves.toEqual({ status: 'over', limitMinor: 700_000 });
    await expect(
      harness.repository.earmark(
        markBody(harness, { kind: 'release', index: 1, amountMinor: 1 })
      )
    ).resolves.toEqual({ status: 'over', limitMinor: 0 });
    await expect(
      harness.repository.earmark(
        markBody(harness, { kind: 'release', index: 0, amountMinor: 700_000 })
      )
    ).resolves.toEqual({ status: 'applied' });
    expect((await view(harness)).setAsideMinor).toBe(0);
  });

  test('replays an earmark by reference and refuses the reference for a different one', async (harness) => {
    await fund(harness);
    const mark = markBody(harness, {
      kind: 'set',
      index: 0,
      amountMinor: 400_000,
    });
    await harness.repository.earmark(mark);
    await expect(harness.repository.earmark(mark)).resolves.toEqual({
      status: 'replayed',
    });
    await expect(
      harness.repository.earmark({ ...mark, amountMinor: 400_001 })
    ).resolves.toEqual({ status: 'reference_used' });
    await expect(
      harness.repository.earmark({ ...mark, kind: 'release' })
    ).resolves.toEqual({ status: 'reference_used' });
    expect((await view(harness)).setAsideMinor).toBe(400_000);
  });

  test('uses the earmark first when a child’s charges are paid, and lets it go as it is used', async (harness) => {
    await fund(harness);
    await harness.repository.earmark(
      markBody(harness, { kind: 'set', index: 0, amountMinor: 800_000 })
    );
    await harness.repository.spend(spendBody(harness, [[0, 500_000]]));
    expect(await view(harness)).toMatchObject({
      balanceMinor: TOP_UP - 500_000,
      setAsideMinor: 300_000,
      freeMinor: TOP_UP - 800_000,
    });
    await harness.repository.spend(spendBody(harness, [[0, 600_000]]));
    expect(await view(harness)).toMatchObject({
      setAsideMinor: 0,
      freeMinor: TOP_UP - 1_100_000,
    });
  });

  test('lets a child use their earmark beyond the free money', async (harness) => {
    await fund(harness, 1_000_000);
    await harness.repository.earmark(
      markBody(harness, { kind: 'set', index: 0, amountMinor: 1_000_000 })
    );
    await expect(
      harness.repository.spend(spendBody(harness, [[1, 1]]))
    ).resolves.toEqual({
      status: 'over',
      studentId: harness.children[1],
      spendableMinor: 0,
    });
    await expect(
      harness.repository.spend(spendBody(harness, [[0, 1_000_000]]))
    ).resolves.toMatchObject({ status: 'spent' });
  });

  test('holds a refund request out of the free money: the balance stays, and a spend, a set-aside and a second request can only use the rest', async (harness) => {
    await fund(harness);
    const made = await harness.repository.requestRefund(
      await harness.newRefund({ amountMinor: 2_000_000 })
    );
    expect(made.status).toBe('requested');
    expect(await view(harness)).toMatchObject({
      balanceMinor: TOP_UP,
      heldMinor: 2_000_000,
      freeMinor: 1_000_000,
    });
    await expect(
      harness.repository.spend(spendBody(harness, [[0, 1_000_001]]))
    ).resolves.toMatchObject({ status: 'over', spendableMinor: 1_000_000 });
    await expect(
      harness.repository.earmark(
        markBody(harness, { kind: 'set', index: 0, amountMinor: 1_000_001 })
      )
    ).resolves.toEqual({ status: 'over', limitMinor: 1_000_000 });
    await expect(
      harness.repository.requestRefund(
        await harness.newRefund({ amountMinor: 1_000_001 })
      )
    ).resolves.toEqual({ status: 'over', limitMinor: 1_000_000 });
    await expect(
      harness.repository.spend(spendBody(harness, [[0, 1_000_000]]))
    ).resolves.toMatchObject({ status: 'spent' });
  });

  test('replays a refund request by reference, clashes on another body and refuses a used email file', async (harness) => {
    await fund(harness);
    const input = await harness.newRefund({ amountMinor: 500_000 });
    const first = await harness.repository.requestRefund(input);
    await expect(harness.repository.requestRefund(input)).resolves.toEqual({
      status: 'replayed',
      id: 'id' in first ? first.id : '',
    });
    await expect(
      harness.repository.requestRefund({ ...input, requestHash: 'another' })
    ).resolves.toEqual({ status: 'reference_used' });
    await expect(
      harness.repository.requestRefund(
        await harness.newRefund({ proofFileId: input.proofFileId })
      )
    ).resolves.toEqual({ status: 'proof_taken' });
    await expect(
      harness.repository.findRefundRequest(
        harness.organizationId,
        input.reference
      )
    ).resolves.toEqual({
      id: 'id' in first ? first.id : '',
      walletId: harness.walletId,
      requestHash: input.requestHash,
    });
    expect((await view(harness)).heldMinor).toBe(500_000);
  });

  test('releases the hold when a refund is declined, and decides a request once', async (harness) => {
    await fund(harness);
    const made = await harness.repository.requestRefund(
      await harness.newRefund({ amountMinor: 2_000_000 })
    );
    const id = 'id' in made ? made.id : '';
    await expect(
      harness.repository.declineRequest('wallet_refund', {
        organizationId: harness.organizationId,
        userId: harness.userId,
        userName: harness.userName,
        id,
        reason: 'No such overpayment',
      })
    ).resolves.toEqual({ status: 'declined' });
    expect(await view(harness)).toMatchObject({
      balanceMinor: TOP_UP,
      heldMinor: 0,
      freeMinor: TOP_UP,
    });
    await expect(
      harness.repository.declineRequest('wallet_refund', {
        organizationId: harness.organizationId,
        userId: harness.userId,
        userName: harness.userName,
        id,
        reason: 'Again',
      })
    ).resolves.toEqual({ status: 'decided' });
    await expect(
      harness.repository.findRequest(harness.scope, 'wallet_refund', id)
    ).resolves.toMatchObject({
      status: 'rejected',
      rejectionReason: 'No such overpayment',
    });
  });

  test('takes the refund out of the balance on approval, keeps the payout reference and approves once', async (harness) => {
    await fund(harness);
    const made = await harness.repository.requestRefund(
      await harness.newRefund({ amountMinor: 2_000_000 })
    );
    const decision = {
      organizationId: harness.organizationId,
      userId: harness.userId,
      userName: harness.userName,
      id: 'id' in made ? made.id : '',
      decidedOn: '2026-10-26',
      ownRequest: false,
      payoutReference: nextReference('NIP'),
    };
    await expect(harness.repository.approveRefund(decision)).resolves.toEqual({
      status: 'approved',
    });
    expect(await view(harness)).toMatchObject({
      balanceMinor: TOP_UP - 2_000_000,
      heldMinor: 0,
      freeMinor: TOP_UP - 2_000_000,
    });
    await expect(
      harness.repository.findRequest(
        harness.scope,
        'wallet_refund',
        decision.id
      )
    ).resolves.toMatchObject({
      status: 'approved',
      payoutReference: decision.payoutReference,
    });
    await expect(
      harness.repository.approveRefund({
        ...decision,
        payoutReference: nextReference('NIP'),
      })
    ).resolves.toEqual({ status: 'decided' });
    expect((await view(harness)).balanceMinor).toBe(TOP_UP - 2_000_000);
  });

  test('refuses a payout reference another refund already holds', async (harness) => {
    await fund(harness);
    const payoutReference = nextReference('NIP');
    const decide = async (amountMinor: number) => {
      const made = await harness.repository.requestRefund(
        await harness.newRefund({ amountMinor })
      );
      return harness.repository.approveRefund({
        organizationId: harness.organizationId,
        userId: harness.userId,
        userName: harness.userName,
        id: 'id' in made ? made.id : '',
        decidedOn: '2026-10-26',
        ownRequest: false,
        payoutReference,
      });
    };
    await expect(decide(500_000)).resolves.toEqual({ status: 'approved' });
    await expect(decide(400_000)).resolves.toEqual({
      status: 'payout_reference_used',
    });
  });

  test('holds a top-up’s amount while its cancellation waits and takes it out of the balance on approval, once per top-up', async (harness) => {
    const recorded = await fund(harness);
    const topUpId = 'id' in recorded ? recorded.id : '';
    const request: NewCancellationRequest = {
      organizationId: harness.organizationId,
      userId: harness.userId,
      userName: harness.userName,
      walletId: harness.walletId,
      topUpId,
      reference: nextReference('WTQ'),
      requestHash: 'cancel-hash',
      reason: 'Wrong family',
    };
    const made = await harness.repository.requestCancellation(request);
    expect(made.status).toBe('requested');
    expect(await view(harness)).toMatchObject({
      balanceMinor: TOP_UP,
      heldMinor: TOP_UP,
      freeMinor: 0,
    });
    await expect(
      harness.repository.requestCancellation(request)
    ).resolves.toEqual({
      status: 'replayed',
      id: 'id' in made ? made.id : '',
    });
    await expect(
      harness.repository.requestCancellation({
        ...request,
        reference: nextReference('WTQ'),
        requestHash: 'other',
      })
    ).resolves.toEqual({ status: 'exists' });

    await expect(
      harness.repository.approveCancellation({
        organizationId: harness.organizationId,
        userId: harness.userId,
        userName: harness.userName,
        id: 'id' in made ? made.id : '',
        decidedOn: '2026-10-26',
        ownRequest: false,
      })
    ).resolves.toEqual({ status: 'approved' });
    expect(await view(harness)).toMatchObject({
      balanceMinor: 0,
      heldMinor: 0,
      freeMinor: 0,
    });
    await expect(
      harness.repository.requestCancellation({
        ...request,
        reference: nextReference('WTQ'),
        requestHash: 'again',
      })
    ).resolves.toEqual({ status: 'exists' });
  });

  test('refuses to cancel a top-up when less than its amount is still free', async (harness) => {
    const recorded = await fund(harness);
    await harness.repository.spend(spendBody(harness, [[0, 500_000]]));
    await expect(
      harness.repository.requestCancellation({
        organizationId: harness.organizationId,
        userId: harness.userId,
        userName: harness.userName,
        walletId: harness.walletId,
        topUpId: 'id' in recorded ? recorded.id : '',
        reference: nextReference('WTQ'),
        requestHash: 'cancel-hash',
        reason: 'Wrong family',
      })
    ).resolves.toEqual({
      status: 'over',
      topUpMinor: TOP_UP,
      freeMinor: TOP_UP - 500_000,
    });
    expect((await view(harness)).heldMinor).toBe(0);
  });

  test('lists the requests of both kinds, newest first, and counts the waiting ones', async (harness) => {
    const first = await fund(harness, 3_000_000);
    await fund(harness, 3_000_000);
    const cancellation = await harness.repository.requestCancellation({
      organizationId: harness.organizationId,
      userId: harness.userId,
      userName: harness.userName,
      walletId: harness.walletId,
      topUpId: 'id' in first ? first.id : '',
      reference: nextReference('WTQ'),
      requestHash: 'cancel-hash',
      reason: 'Wrong family',
    });
    expect(cancellation.status).toBe('requested');
    const refund = await harness.repository.requestRefund(
      await harness.newRefund({ amountMinor: 1_000_000 })
    );
    expect(refund.status).toBe('requested');

    const all = await harness.repository.listRequests(harness.scope, {
      page: 1,
      pageSize: 10,
    });
    expect(all.items.map((item) => item.kind)).toEqual([
      'wallet_refund',
      'wallet_topup_cancellation',
    ]);
    expect(all).toMatchObject({ total: 2, waitingCount: 2 });

    await harness.repository.declineRequest('wallet_refund', {
      organizationId: harness.organizationId,
      userId: harness.userId,
      userName: harness.userName,
      id: 'id' in refund ? refund.id : '',
      reason: 'Not now',
    });
    const declined = await harness.repository.listRequests(harness.scope, {
      page: 1,
      pageSize: 10,
      status: 'rejected',
    });
    expect(declined.items.map((item) => item.kind)).toEqual(['wallet_refund']);
    expect(declined.waitingCount).toBe(1);
    const cancellations = await harness.repository.listRequests(harness.scope, {
      page: 1,
      pageSize: 10,
      kind: 'wallet_topup_cancellation',
    });
    expect(cancellations).toMatchObject({ total: 1, waitingCount: 1 });
  });

  test('moves a child’s credit onto the wallet once and answers a second run as a replay', async (harness) => {
    await harness.giveCredit(0, 500_000);
    const { repository, organizationId } = harness;
    const report = await repository.creditMigration(organizationId);
    expect(report.totals).toEqual({
      familyCount: 1,
      childCount: 1,
      movableMinor: 500_000,
      notMovedMinor: 0,
    });

    const reviewed = { expectedFamilies: 1, expectedTotalMinor: 500_000 };
    await expect(
      repository.migrateCredit(migrationBody(harness, reviewed))
    ).resolves.toEqual({
      status: 'moved',
      familyCount: 1,
      childCount: 1,
      movedMinor: 500_000,
    });
    expect((await view(harness)).balanceMinor).toBe(500_000);

    await expect(
      repository.migrateCredit(migrationBody(harness, reviewed))
    ).resolves.toEqual({ status: 'replayed' });
    expect((await view(harness)).balanceMinor).toBe(500_000);
    expect((await repository.creditMigration(organizationId)).families).toEqual(
      []
    );
  });

  test('refuses credit figures that differ from the report, answering the fresh report and moving nothing', async (harness) => {
    await harness.giveCredit(0, 500_000);

    const refused = await harness.repository.migrateCredit(
      migrationBody(harness, {
        expectedFamilies: 1,
        expectedTotalMinor: 499_999,
      })
    );

    expect(refused).toMatchObject({
      status: 'changed',
      report: { totals: { familyCount: 1, movableMinor: 500_000 } },
    });
    expect((await view(harness)).balanceMinor).toBe(0);
  });

  test('answers a replay when no credit is left to move, even for figures of zero', async (harness) => {
    await expect(
      harness.repository.migrateCredit(
        migrationBody(harness, { expectedFamilies: 0, expectedTotalMinor: 0 })
      )
    ).resolves.toEqual({ status: 'replayed' });
    expect((await view(harness)).balanceMinor).toBe(0);
  });
}
