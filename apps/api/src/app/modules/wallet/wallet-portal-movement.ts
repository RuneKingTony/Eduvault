import type {
  PortalWalletJournalMovement,
  PortalWalletMovement,
  WalletJournalMovement,
  WalletMovement,
} from '@eduvault/api-contract';
import { SYSTEM_REFERENCE_PREFIXES } from '@eduvault/shared';

type PortalSource = NonNullable<PortalWalletJournalMovement['source']>;

function portalSourceOf(
  source: NonNullable<WalletJournalMovement['source']>,
  reference: string
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
      return {
        type: 'spend',
        automatic: reference.startsWith(
          `${SYSTEM_REFERENCE_PREFIXES.autopay}-`
        ),
      };
    }
    case 'refund': {
      return { type: 'refund', payoutReference: source.payoutReference };
    }
    case 'topup_cancellation': {
      return {
        type: 'topup_cancellation',
        topUpReference: source.topUpReference,
      };
    }
    case 'credit_migration': {
      return { type: 'credit_migration', childCount: source.childCount };
    }
  }
}

/** The staff movement minus who made it, the receipt file and every internal id except the one that keys the row. */
export const portalMovementOf = (
  movement: WalletMovement
): PortalWalletMovement => {
  if (movement.type === 'earmark') {
    const { madeBy: _madeBy, ...shown } = movement;
    return shown;
  }
  return {
    type: 'journal',
    id: movement.lineId,
    effectiveOn: movement.effectiveOn,
    postedAt: movement.postedAt,
    kind: movement.kind,
    reference: movement.reference,
    studentId: movement.studentId,
    studentName: movement.studentName,
    amountMinor: movement.amountMinor,
    source:
      movement.source === null
        ? null
        : portalSourceOf(movement.source, movement.reference),
  };
};
