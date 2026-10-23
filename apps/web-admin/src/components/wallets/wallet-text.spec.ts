import type { WalletMovement } from '@eduvault/api-contract';
import { movementTitle, walletMoney } from './wallet-text';

const ID = '0b0c8a8e-8a3e-4c6c-a8c4-0e2f0f6b1f11';

const movement = (over: Partial<WalletMovement>): WalletMovement => ({
  lineId: ID,
  entryId: ID,
  effectiveOn: '2026-10-07',
  postedAt: '2026-10-07T09:00:00.000Z',
  kind: 'wallet_topup',
  reference: 'CSH-1',
  studentId: null,
  studentName: null,
  amountMinor: 5_000_000,
  source: null,
  madeBy: null,
  ...over,
});

describe('walletMoney', () => {
  it('always shows kobo, so an empty wallet reads ₦0.00', () => {
    expect(walletMoney(0, 'NGN')).toBe('₦0.00');
    expect(walletMoney(5_000_000, 'NGN')).toBe('₦50,000.00');
    expect(walletMoney(1250, 'NGN')).toBe('₦12.50');
  });
});

describe('movementTitle', () => {
  it('names a top-up by its depositor and way of paying', () => {
    expect(
      movementTitle(
        movement({
          source: {
            type: 'topup',
            id: ID,
            method: 'transfer',
            depositorName: 'Uncle Bode',
            proofFileId: ID,
          },
        })
      )
    ).toBe('Top-up from Uncle Bode · Bank transfer');
    expect(
      movementTitle(
        movement({
          source: {
            type: 'topup',
            id: ID,
            method: 'cash',
            depositorName: null,
            proofFileId: ID,
          },
        })
      )
    ).toBe('Top-up · Cash');
  });

  it('names a spend by the child whose charges it paid', () => {
    expect(
      movementTitle(
        movement({
          kind: 'wallet_spend',
          studentName: 'Ada Okeke',
          source: { type: 'spend', id: ID },
        })
      )
    ).toBe('Paid Ada Okeke’s charges');
    expect(movementTitle(movement({ kind: 'wallet_spend' }))).toBe(
      'Paid from wallet'
    );
  });
});
