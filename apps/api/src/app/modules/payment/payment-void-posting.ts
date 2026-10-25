import { SYSTEM_REFERENCE_PREFIXES } from '@eduvault/shared';
import { clampMemo } from '../../common/ledger';

export const voidReference = (paymentReference: string): string =>
  `${SYSTEM_REFERENCE_PREFIXES.void}-${paymentReference}`;

export const voidMemo = (receiptNumber: string, reason: string): string =>
  clampMemo(`Void of ${receiptNumber}: ${reason}`);
