import {
  portalWalletMovementSchema,
  type WalletMovement,
} from '@eduvault/api-contract';
import { portalMovementOf } from './wallet-portal-movement';

const ID = '0b0c8a8e-8a3e-4c6c-a8c4-0e2f0f6b1f11';
const OTHER = '5d7e0f2a-3c1b-4e0a-9d7c-2f6a1b8c9d10';

const movement = (over: Partial<WalletMovement>): WalletMovement => ({
  lineId: ID,
  entryId: OTHER,
  effectiveOn: '2026-10-24',
  postedAt: '2026-10-24T09:00:00.000Z',
  kind: 'wallet_topup',
  reference: 'CSH-1',
  studentId: null,
  studentName: null,
  amountMinor: 5_000_000,
  source: null,
  madeBy: 'Bursar Bola',
  ...over,
});

const spendSource = (reference: string) =>
  portalMovementOf(
    movement({ reference, source: { type: 'spend', id: OTHER } })
  ).source;

describe('portalMovementOf', () => {
  it('leaves out who made the movement and the entry id', () => {
    const portal = portalMovementOf(movement({}));
    expect(portal).not.toHaveProperty('madeBy');
    expect(portal).not.toHaveProperty('entryId');
    expect(portal).not.toHaveProperty('lineId');
    expect(portal.id).toBe(ID);
  });

  it('keeps a staff top-up’s depositor and method but not its receipt', () => {
    const portal = portalMovementOf(
      movement({
        source: {
          type: 'topup',
          id: OTHER,
          method: 'transfer',
          depositorName: 'Uncle Bode',
          proofFileId: OTHER,
          cancellation: null,
        },
      })
    );
    expect(portal.source).toEqual({
      type: 'topup',
      method: 'transfer',
      depositorName: 'Uncle Bode',
    });
  });

  it('keeps the Monnify facts Trace shows but not the top-up row id', () => {
    const portal = portalMovementOf(
      movement({
        source: {
          type: 'monnify',
          id: OTHER,
          transactionReference: 'MNFY|20|1',
          paymentReference: 'PAY-1',
          signatureVerified: true,
          paidAt: '2026-10-24T08:00:00.000Z',
          confirmedAt: '2026-10-24T08:00:05.000Z',
          grossMinor: 5_000_000,
          feeMinor: 50_000,
          netMinor: 4_950_000,
        },
      })
    );
    expect(portal.source).not.toHaveProperty('id');
    expect(portal.source).toMatchObject({
      type: 'monnify',
      transactionReference: 'MNFY|20|1',
      netMinor: 4_950_000,
    });
  });

  it('marks a spend made by auto-pay and not one the guardian made', () => {
    expect(spendSource('AUTOPAY-CSH-1')).toEqual({
      type: 'spend',
      automatic: true,
    });
    expect(spendSource('WSP-1')).toEqual({ type: 'spend', automatic: false });
  });

  it('shows a guardian a refund’s bank reference and a cancelled top-up’s reference, never the reason or the ids', () => {
    expect(
      portalMovementOf(
        movement({
          source: { type: 'refund', id: OTHER, payoutReference: 'NIP-8841' },
        })
      ).source
    ).toEqual({ type: 'refund', payoutReference: 'NIP-8841' });
    expect(
      portalMovementOf(
        movement({
          source: {
            type: 'topup_cancellation',
            id: OTHER,
            topUpReference: 'CSH-20261023-K3Q7ZA',
            reason: 'Keyed against the wrong family',
          },
        })
      ).source
    ).toEqual({
      type: 'topup_cancellation',
      topUpReference: 'CSH-20261023-K3Q7ZA',
    });
  });

  it('answers what the portal contract parses', () => {
    for (const source of [null, { type: 'spend' as const, id: OTHER }]) {
      const portal = portalMovementOf(movement({ source }));
      expect(portalWalletMovementSchema.parse(portal)).toEqual(portal);
    }
  });
});
