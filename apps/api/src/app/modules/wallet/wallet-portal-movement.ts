import type {
  PortalWalletMovement,
  WalletMovement,
} from '@eduvault/api-contract';

type PortalSource = NonNullable<PortalWalletMovement['source']>;

function portalSourceOf(
  source: NonNullable<WalletMovement['source']>
): PortalSource {
  switch (source.type) {
    case 'topup': {
      return {
        type: 'topup',
        method: source.method,
        depositorName: source.depositorName,
      };
    }
    case 'monnify': {
      const { id: _id, ...facts } = source;
      return facts;
    }
    case 'spend': {
      return { type: 'spend' };
    }
  }
}

/** The staff movement minus who made it, the receipt file and every internal id except the line's, which keys the row. */
export const portalMovementOf = (
  movement: WalletMovement
): PortalWalletMovement => ({
  id: movement.lineId,
  effectiveOn: movement.effectiveOn,
  postedAt: movement.postedAt,
  kind: movement.kind,
  reference: movement.reference,
  studentId: movement.studentId,
  studentName: movement.studentName,
  amountMinor: movement.amountMinor,
  source: movement.source === null ? null : portalSourceOf(movement.source),
});
