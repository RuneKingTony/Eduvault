import type {
  NewEarmark,
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

export function describeWalletRepositoryContract(test: TestFn): void {
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
}
