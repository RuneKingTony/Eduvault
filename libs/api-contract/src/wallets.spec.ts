import { contract } from './contract';
import { JOURNAL_KINDS } from './finance';
import { FILE_KINDS, RESERVED_REFERENCE_MESSAGE } from './schemas';
import {
  WALLET_AMOUNT_MESSAGE,
  WALLET_SPEND_NO_LINES_MESSAGE,
  WALLET_SPEND_TWICE_MESSAGE,
  earmarkSchema,
  spendWalletSchema,
  topUpWalletSchema,
  walletEarmarkReleaseOverMessage,
  walletEarmarkSetOverMessage,
  walletListQuerySchema,
  walletMovementQuerySchema,
  walletSpendOverMessage,
} from './wallets';

const id = '0b0c8a8e-8a3e-4c6c-a8c4-0e2f0f6b1f11';
const other = '5d7e0f2a-3c1b-4e0a-9d7c-2f6a1b8c9d10';

const topUp = {
  reference: 'CSH-20261023-K3Q7ZA',
  moneyAccountId: id,
  method: 'cash',
  amountMinor: 5_000_000,
  receivedOn: '2026-10-23',
  proofFileId: other,
};

const messages = (result: {
  success: boolean;
  error?: { issues: { message: string }[] };
}) => result.error?.issues.map((issue) => issue.message) ?? [];

describe('topUpWalletSchema', () => {
  it('accepts a top-up and trims the reference', () => {
    const parsed = topUpWalletSchema.parse({
      ...topUp,
      reference: '  CSH-20261023-K3Q7ZA ',
    });
    expect(parsed.reference).toBe('CSH-20261023-K3Q7ZA');
    expect(parsed.depositorName).toBeUndefined();
  });

  it.each(['ADJ-2026-0001', ' del-2026-0004', 'VOID-CSH-20261023-K3Q7ZA'])(
    'refuses %s, a number the system issues',
    (reference) => {
      expect(
        messages(topUpWalletSchema.safeParse({ ...topUp, reference }))
      ).toEqual([RESERVED_REFERENCE_MESSAGE]);
    }
  );

  it.each([0, -100, 12.5])('refuses the amount %s', (amountMinor) => {
    expect(
      messages(topUpWalletSchema.safeParse({ ...topUp, amountMinor }))
    ).toEqual([WALLET_AMOUNT_MESSAGE]);
  });

  it('treats a blank depositor as none and trims a name', () => {
    expect(
      topUpWalletSchema.parse({ ...topUp, depositorName: '   ' }).depositorName
    ).toBeUndefined();
    expect(
      topUpWalletSchema.parse({ ...topUp, depositorName: ' Mrs Ojo ' })
        .depositorName
    ).toBe('Mrs Ojo');
  });

  it('needs the receipt file', () => {
    const { proofFileId: _removed, ...rest } = topUp;
    expect(topUpWalletSchema.safeParse(rest).success).toBe(false);
  });

  it('refuses a method the school cannot take', () => {
    expect(
      topUpWalletSchema.safeParse({ ...topUp, method: 'gateway' }).success
    ).toBe(false);
  });
});

describe('spendWalletSchema', () => {
  const body = {
    reference: 'WSP-20261023-A1B2C3',
    lines: [
      { studentId: id, amountMinor: 1_000_000 },
      { studentId: other, amountMinor: 250_000 },
    ],
  };

  it('accepts an amount per child', () => {
    expect(spendWalletSchema.parse(body).lines).toHaveLength(2);
  });

  it('needs at least one child', () => {
    expect(
      messages(spendWalletSchema.safeParse({ ...body, lines: [] }))
    ).toEqual([WALLET_SPEND_NO_LINES_MESSAGE]);
  });

  it('refuses the same child twice', () => {
    expect(
      messages(
        spendWalletSchema.safeParse({
          ...body,
          lines: [
            { studentId: id, amountMinor: 100 },
            { studentId: id, amountMinor: 200 },
          ],
        })
      )
    ).toEqual([WALLET_SPEND_TWICE_MESSAGE]);
  });

  it('refuses a zero or fractional line and a system reference', () => {
    expect(
      messages(
        spendWalletSchema.safeParse({
          ...body,
          lines: [{ studentId: id, amountMinor: 0 }],
        })
      )
    ).toEqual([WALLET_AMOUNT_MESSAGE]);
    expect(
      messages(spendWalletSchema.safeParse({ ...body, reference: 'ADJ-1' }))
    ).toEqual([RESERVED_REFERENCE_MESSAGE]);
  });
});

describe('earmarkSchema', () => {
  it('takes a reference, a child and a positive amount', () => {
    expect(
      earmarkSchema.parse({
        reference: 'ERM-1',
        studentId: id,
        amountMinor: 500_000,
      }).amountMinor
    ).toBe(500_000);
    expect(
      messages(
        earmarkSchema.safeParse({
          reference: 'ERM-1',
          studentId: id,
          amountMinor: -5,
        })
      )
    ).toEqual([WALLET_AMOUNT_MESSAGE]);
  });
});

describe('list and movement queries', () => {
  it('default to the first page of ten', () => {
    expect(walletListQuerySchema.parse({})).toEqual({ page: 1, pageSize: 10 });
    expect(walletMovementQuerySchema.parse({ page: '2' })).toEqual({
      page: 2,
      pageSize: 10,
    });
  });

  it('trim the search and cap the page size at fifty', () => {
    expect(walletListQuerySchema.parse({ q: '  Ojo ' }).q).toBe('Ojo');
    expect(walletListQuerySchema.safeParse({ pageSize: '51' }).success).toBe(
      false
    );
  });
});

describe('messages', () => {
  it('names the spendable maximum in naira, or says nothing can be used', () => {
    expect(walletSpendOverMessage('Ada', 1_250_000)).toContain('12,500');
    expect(walletSpendOverMessage('Ada', 0)).toBe(
      'Nothing in the wallet can be used for Ada’s charges right now.'
    );
  });

  it('names the most that can be set aside or released', () => {
    expect(walletEarmarkSetOverMessage(300_000)).toContain('3,000');
    expect(walletEarmarkSetOverMessage(-5)).toMatch(/up to ₦0\.$/);
    expect(walletEarmarkReleaseOverMessage(400_000)).toContain('4,000');
  });
});

describe('the wallet routes', () => {
  it('keep staff routes under /finance/wallets and the guardian ones under /portal/wallet', () => {
    expect(contract.wallets.list.path).toBe('/finance/wallets');
    expect(contract.wallets.get.path).toBe('/finance/wallets/:walletId');
    expect(contract.wallets.movements.path).toBe(
      '/finance/wallets/:walletId/movements'
    );
    expect(contract.wallets.topUp.path).toBe(
      '/finance/wallets/:walletId/top-ups'
    );
    expect(contract.portalWallet.get.path).toBe('/portal/wallet');
    expect(contract.portalWallet.spend.path).toBe('/portal/wallet/spend');
    expect(contract.portalWallet.setAside.path).toBe('/portal/wallet/earmarks');
    expect(contract.portalWallet.release.path).toBe(
      '/portal/wallet/earmarks/release'
    );
  });

  it('never put a wallet id in a guardian route', () => {
    for (const route of Object.values(contract.portalWallet)) {
      expect(route.path).not.toContain(':');
    }
  });

  it('know the wallet journal kinds and the proof file kind', () => {
    expect(JOURNAL_KINDS).toEqual(
      expect.arrayContaining(['wallet_topup', 'wallet_spend'])
    );
    expect(FILE_KINDS).toContain('wallet_proof');
  });
});
