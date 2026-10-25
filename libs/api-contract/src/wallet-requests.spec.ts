import { contract } from './contract';
import { RESERVED_REFERENCE_MESSAGE } from './schemas';
import {
  WALLET_AMOUNT_MESSAGE,
  portalWalletMovementSchema,
  walletMovementSourceSchema,
} from './wallets';
import {
  WALLET_CANCEL_REASON_MESSAGE,
  WALLET_PAYOUT_REFERENCE_MESSAGE,
  WALLET_REFUND_EMAIL_MESSAGE,
  WALLET_REFUND_REASON_MESSAGE,
  approveWalletRefundSchema,
  requestWalletCancellationSchema,
  requestWalletRefundSchema,
  walletCancelOverMessage,
  walletRefundOverMessage,
  walletRequestListQuerySchema,
  walletRequestSchema,
} from './wallet-requests';

const id = '0b0c8a8e-8a3e-4c6c-a8c4-0e2f0f6b1f11';
const other = '5d7e0f2a-3c1b-4e0a-9d7c-2f6a1b8c9d10';

const refund = {
  reference: 'WRQ-20261026-K3Q7ZA',
  moneyAccountId: id,
  amountMinor: 1_500_000,
  parentEmail: 'ada.parent@example.com',
  reason: 'Paid twice by mistake',
  proofFileId: other,
};

const messages = (result: {
  success: boolean;
  error?: { issues: { message: string }[] };
}) => result.error?.issues.map((issue) => issue.message) ?? [];

describe('requestWalletRefundSchema', () => {
  it('accepts a refund request and trims the text', () => {
    const parsed = requestWalletRefundSchema.parse({
      ...refund,
      parentEmail: '  ada.parent@example.com ',
      reason: '  Paid twice by mistake ',
    });
    expect(parsed.parentEmail).toBe('ada.parent@example.com');
    expect(parsed.reason).toBe('Paid twice by mistake');
  });

  it.each([0, -1, 10.5])('refuses the amount %s', (amountMinor) => {
    expect(
      messages(requestWalletRefundSchema.safeParse({ ...refund, amountMinor }))
    ).toEqual([WALLET_AMOUNT_MESSAGE]);
  });

  it.each(['', 'ada', 'ada@'])('refuses the email %j', (parentEmail) => {
    expect(
      messages(requestWalletRefundSchema.safeParse({ ...refund, parentEmail }))
    ).toEqual([WALLET_REFUND_EMAIL_MESSAGE]);
  });

  it('needs a reason', () => {
    expect(
      messages(requestWalletRefundSchema.safeParse({ ...refund, reason: ' ' }))
    ).toEqual([WALLET_REFUND_REASON_MESSAGE]);
  });

  it('refuses a reference that starts like a number the system issues', () => {
    expect(
      messages(
        requestWalletRefundSchema.safeParse({
          ...refund,
          reference: 'WRF-20261026-K3Q7ZA',
        })
      )
    ).toEqual([RESERVED_REFERENCE_MESSAGE]);
  });

  it('needs the parent’s email attached', () => {
    const { proofFileId: _proof, ...withoutProof } = refund;
    expect(requestWalletRefundSchema.safeParse(withoutProof).success).toBe(
      false
    );
  });
});

describe('requestWalletCancellationSchema', () => {
  it('needs a reference and a reason', () => {
    expect(
      requestWalletCancellationSchema.parse({
        reference: ' WTQ-20261026-K3Q7ZA',
        reason: ' Wrong family ',
      })
    ).toEqual({ reference: 'WTQ-20261026-K3Q7ZA', reason: 'Wrong family' });
    expect(
      messages(
        requestWalletCancellationSchema.safeParse({
          reference: 'WTQ-20261026-K3Q7ZA',
          reason: '',
        })
      )
    ).toEqual([WALLET_CANCEL_REASON_MESSAGE]);
  });
});

describe('approveWalletRefundSchema', () => {
  it('takes the bank’s payout reference and trims it', () => {
    expect(
      approveWalletRefundSchema.parse({ payoutReference: ' NIP-8841 ' })
    ).toEqual({ payoutReference: 'NIP-8841' });
  });

  it('refuses a blank payout reference', () => {
    expect(
      messages(approveWalletRefundSchema.safeParse({ payoutReference: ' ' }))
    ).toEqual([WALLET_PAYOUT_REFERENCE_MESSAGE]);
  });
});

describe('walletRequestListQuerySchema', () => {
  it('defaults to the first page and takes a kind and a status', () => {
    expect(walletRequestListQuerySchema.parse({})).toEqual({
      page: 1,
      pageSize: 10,
    });
    expect(
      walletRequestListQuerySchema.parse({
        kind: 'wallet_refund',
        status: 'submitted',
      })
    ).toMatchObject({ kind: 'wallet_refund', status: 'submitted' });
    expect(
      walletRequestListQuerySchema.safeParse({ kind: 'payment_void' }).success
    ).toBe(false);
  });
});

describe('walletRequestSchema', () => {
  const base = {
    id,
    status: 'submitted',
    reference: 'WRQ-20261026-K3Q7ZA',
    reason: 'Paid twice',
    amountMinor: 1_500_000,
    wallet: { id: other, guardianName: 'Ada Okeke' },
    createdBy: 'Chika',
    createdAt: '2026-10-26T08:00:00.000Z',
    decidedBy: null,
    decidedAt: null,
    rejectionReason: null,
  };

  it('tells a refund from a cancellation by its kind', () => {
    expect(
      walletRequestSchema.parse({
        ...base,
        kind: 'wallet_refund',
        parentEmail: 'ada.parent@example.com',
        moneyAccountName: 'GTBank',
        payoutReference: null,
        proofFileId: other,
      }).kind
    ).toBe('wallet_refund');
    expect(
      walletRequestSchema.parse({
        ...base,
        kind: 'wallet_topup_cancellation',
        topUp: { id: other, reference: 'CSH-20261023-K3Q7ZA' },
      }).kind
    ).toBe('wallet_topup_cancellation');
  });

  it('refuses a kind that is not a wallet request', () => {
    expect(
      walletRequestSchema.safeParse({ ...base, kind: 'payment_void' }).success
    ).toBe(false);
  });
});

describe('movement sources', () => {
  it('knows a refund and a top-up cancellation, and a top-up that carries its cancellation', () => {
    expect(
      walletMovementSourceSchema.parse({
        type: 'refund',
        id,
        payoutReference: 'NIP-8841',
      }).type
    ).toBe('refund');
    expect(
      walletMovementSourceSchema.parse({
        type: 'topup_cancellation',
        id,
        topUpReference: 'CSH-20261023-K3Q7ZA',
        reason: 'Wrong family',
      }).type
    ).toBe('topup_cancellation');
    expect(
      walletMovementSourceSchema.safeParse({
        type: 'topup',
        id,
        method: 'cash',
        depositorName: null,
        proofFileId: other,
        cancellation: 'rejected',
      }).success
    ).toBe(false);
  });

  it('shows a guardian the refund’s bank reference and no internal id', () => {
    const movement = portalWalletMovementSchema.parse({
      id,
      effectiveOn: '2026-10-26',
      postedAt: '2026-10-26T08:00:00.000Z',
      kind: 'wallet_refund',
      reference: 'WRF-WRQ-20261026-K3Q7ZA',
      studentId: null,
      studentName: null,
      amountMinor: -1_500_000,
      source: { type: 'refund', payoutReference: 'NIP-8841' },
    });
    expect(movement.source).toEqual({
      type: 'refund',
      payoutReference: 'NIP-8841',
    });
  });
});

describe('messages', () => {
  it('names the most that can be refunded and never a negative amount', () => {
    expect(walletRefundOverMessage(250_000)).toBe(
      'That is more than is free to refund. You can refund up to ₦2,500.'
    );
    expect(walletRefundOverMessage(-5)).toContain('up to ₦0.');
  });

  it('says how much of the top-up is still free', () => {
    expect(walletCancelOverMessage(5_000_000, 1_200_000)).toBe(
      'Only ₦12,000 of this ₦50,000 top-up is still free to use, so it can’t be cancelled.'
    );
  });
});

describe('contract routes', () => {
  it('serves the requests under the wallet and the decisions under their own paths', () => {
    expect(contract.wallets.requestRefund.path).toBe(
      '/finance/wallets/:walletId/refunds'
    );
    expect(contract.wallets.requestCancellation.path).toBe(
      '/finance/wallets/:walletId/top-ups/:topUpId/cancellations'
    );
    expect(contract.walletRequests.list.path).toBe('/finance/wallet-requests');
    expect(contract.walletRefunds.approve.path).toBe(
      '/finance/wallet-refunds/:id/approve'
    );
    expect(contract.walletTopUpCancellations.decline.path).toBe(
      '/finance/wallet-topup-cancellations/:id/decline'
    );
  });

  it('takes the payout reference on a refund approval only', () => {
    expect('body' in contract.walletRefunds.approve).toBe(true);
    expect('body' in contract.walletTopUpCancellations.approve).toBe(false);
  });
});
