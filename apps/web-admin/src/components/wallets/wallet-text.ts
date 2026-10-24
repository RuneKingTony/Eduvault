import {
  PAYMENT_METHOD_LABELS,
  type WalletMovement,
} from '@eduvault/api-contract';
import { money } from '@eduvault/shared';

/** A wallet always shows kobo, so an empty one reads ₦0.00 rather than a bare ₦0. */
export const walletMoney = (minor: number, currency: string): string =>
  money(minor, currency, { kobo: true });

export function movementTitle(movement: WalletMovement): string {
  if (movement.source?.type === 'topup') {
    const from =
      movement.source.depositorName === null
        ? ''
        : ` from ${movement.source.depositorName}`;
    return `Top-up${from} · ${PAYMENT_METHOD_LABELS[movement.source.method]}`;
  }
  if (movement.source?.type === 'monnify') {
    return 'Online top-up · Monnify';
  }
  return movement.studentName === null
    ? 'Paid from wallet'
    : `Paid ${movement.studentName}’s charges`;
}
